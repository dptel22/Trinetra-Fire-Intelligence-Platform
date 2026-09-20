from __future__ import annotations

from pathlib import Path
from threading import Lock
from typing import Any

import duckdb
from fastapi import HTTPException

from app.core.config import settings

STATIC_COLUMNS = [col for col in settings.MODEL_FEATURES if col not in settings.H3_DAILY_FEATURES]


class FeatureStoreUnavailableError(HTTPException):
    """The serving parquets are missing, so the feature store cannot be seeded.

    Raised (as HTTP 503) instead of a bare ``FileNotFoundError`` so that a fresh
    clone boots in a visibly degraded, fail-closed mode: the API starts,
    ``/health`` reports the missing store, and every data-backed route answers
    503 with the remediation. No prediction is ever invented. Each request
    re-attempts ``load()``, so the store recovers as soon as the parquets appear.
    """

    def __init__(self, reason: str):
        super().__init__(
            status_code=503,
            detail=(
                f"Serving data store is not loaded: {reason}. "
                "Run `python scripts/fetch_serving_data.py` (or an ingestion run) to provide it."
            ),
        )
        self.reason = reason


class FeatureStoreService:
    """DuckDB-backed H3-day feature store seeded from the real parquet artifacts.

    Concurrency contract: ONE persistent connection is shared by all reads and
    (re)seeding, and every access — load(), reload(), get_cell(), query_bbox()
    — is serialized under self._lock. This guarantees that a background
    reload() triggered after ingestion can never expose a half-swapped table
    pair to an in-flight query (both CREATE OR REPLACE statements run inside a
    single DuckDB transaction, so readers see the old or the new pair, never a
    mix) and avoids DuckDB's mixed read-only/read-write same-file connection
    conflict that per-call connections would create.
    """

    def __init__(self, db_path: str = settings.DUCKDB_PATH):
        self.db_path = db_path
        self.loaded = False
        # Last seed failure (missing parquets); None while loaded or never attempted.
        self.load_error: str | None = None
        self._lock = Lock()
        self._conn = None
        # Provenance side-map: h3_08 -> (state, state_assignment_method).
        # Built with pandas at seed time (the DuckDB static table intentionally
        # holds only model features). Used for geographic-generalization
        # labeling on prediction responses.
        self._state_by_cell: dict[str, tuple[str | None, str | None]] = {}

    def _connection(self):
        if self._conn is None:
            Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
            self._conn = duckdb.connect(self.db_path)
        return self._conn

    def _seed_tables(self) -> None:
        """(Re)seed both tables from the parquets; caller must hold the lock."""
        conn = self._connection()
        daily_path = Path(settings.H3_DAILY_PARQUET)
        static_path = Path(settings.OSMWRI_PARQUET)
        if not daily_path.exists():
            raise FileNotFoundError(f"Missing H3 daily parquet: {daily_path}")
        if not static_path.exists():
            raise FileNotFoundError(f"Missing OSM/WRI parquet: {static_path}")

        # Calendar features required by the v3 model contract are derived
        # from acq_date at seed time: month plus 1-indexed day-of-year
        # sin/cos with a 365.25-day period.
        conn.execute("BEGIN TRANSACTION")
        try:
            conn.execute(
                """
                CREATE OR REPLACE TABLE _h3_daily_staging AS
                SELECT
                    *,
                    month(CAST(acq_date AS DATE)) AS acq_month,
                    sin(2 * pi() * dayofyear(CAST(acq_date AS DATE)) / 365.25) AS doy_sin,
                    cos(2 * pi() * dayofyear(CAST(acq_date AS DATE)) / 365.25) AS doy_cos
                FROM read_parquet(?)
                """,
                [str(daily_path)],
            )
            total = conn.execute("SELECT count(*) FROM _h3_daily_staging").fetchone()[0]
            for col in ("acq_month", "doy_sin", "doy_cos"):
                null_count = conn.execute(
                    f"SELECT count(*) FROM _h3_daily_staging WHERE {col} IS NULL"
                ).fetchone()[0]
                if null_count == total:
                    raise ValueError(f"Derived column {col} is entirely NULL; check acq_date parsing")
            # DuckDB does NOT support SELECT DISTINCT ON. Use ROW_NUMBER() to
            # take the first row per h3_08 for the static OSM/WRI columns.
            static_col_list = ", ".join(STATIC_COLUMNS)
            conn.execute(
                f"""
                CREATE OR REPLACE TABLE _osm_wri_static_staging AS
                SELECT h3_08, h3_lat, h3_lon, {static_col_list}
                    FROM (
                        SELECT
                        h3_08, h3_lat, h3_lon, {static_col_list},
                        ROW_NUMBER() OVER (PARTITION BY h3_08 ORDER BY h3_08) AS _rn
                        FROM read_parquet(?)
                        WHERE h3_08 IS NOT NULL
                          AND (state_assignment_method IS NULL OR state_assignment_method IN ('within', 'nearest_boundary_tie_break', 'fallback'))
                    )
                WHERE _rn = 1
                """,
                [str(static_path)],
            )
            # Atomic swap: both tables flip inside one transaction, so a
            # query can never observe the new daily table against the old
            # static table (or vice versa).
            conn.execute("CREATE OR REPLACE TABLE h3_daily AS SELECT * FROM _h3_daily_staging")
            conn.execute("CREATE OR REPLACE TABLE osm_wri_static AS SELECT * FROM _osm_wri_static_staging")
            conn.execute("DROP TABLE IF EXISTS _h3_daily_staging")
            conn.execute("DROP TABLE IF EXISTS _osm_wri_static_staging")
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
        # Refresh the provenance side-map from the same static parquet.
        import pandas as pd

        prov = pd.read_parquet(static_path, columns=["h3_08", "state", "state_assignment_method"])
        prov = prov[prov["state_assignment_method"].isna() | prov["state_assignment_method"].isin(("within", "nearest_boundary_tie_break", "fallback"))]
        self._state_by_cell = {
            str(row.h3_08): (
                row.state if isinstance(row.state, str) else None,
                row.state_assignment_method if isinstance(row.state_assignment_method, str) else None,
            )
            for row in prov.itertuples(index=False)
        }
        self.loaded = True

    def load(self) -> None:
        with self._lock:
            if self.loaded:
                return
            try:
                self._seed_tables()
            except FileNotFoundError as err:
                self.load_error = str(err)
                raise FeatureStoreUnavailableError(str(err)) from err
            self.load_error = None

    def reload(self) -> None:
        """Force a re-seed from the parquets (after ingestion updates them)."""
        with self._lock:
            self._seed_tables()

    def latest_acq_date(self) -> str | None:
        """Newest acq_date in the daily table (ISO yyyy-mm-dd), or None if empty.

        Lets the UI ask for the freshest ingested day instead of guessing a
        calendar date the store may not hold (empty-200 silent-blank failure).
        """
        self.load()
        with self._lock:
            row = self._connection().execute(
                "SELECT max(CAST(acq_date AS DATE)) FROM h3_daily"
            ).fetchone()
        return row[0].isoformat() if row and row[0] is not None else None

    def available_dates(self) -> list[str]:
        """All distinct acq_dates in the daily table, sorted ascending."""
        self.load()
        with self._lock:
            rows = self._connection().execute(
                "SELECT DISTINCT CAST(acq_date AS DATE) AS d FROM h3_daily ORDER BY d"
            ).fetchall()
        return [row[0].isoformat() for row in rows if row[0] is not None]

    def rows_for_date(self, acq_date: str) -> list[dict[str, Any]]:
        """All H3-day feature rows for one acq_date (static OSM/WRI columns joined).

        Ordered by h3_08 so downstream pagination is deterministic. Note: the
        DuckDB static table intentionally holds only model features — `state`
        is NOT a column here; attach it from the provenance side-map (get_state).
        """
        self.load()
        with self._lock:
            rows = self._connection().execute(
                """
                SELECT d.*, s.* EXCLUDE (h3_08)
                FROM h3_daily d
                INNER JOIN osm_wri_static s USING (h3_08)
                WHERE CAST(d.acq_date AS DATE) = CAST(? AS DATE)
                ORDER BY d.h3_08
                """,
                [acq_date],
            ).fetchall()
            columns = [col[0] for col in self._conn.description] if self._conn.description else []
        return [dict(zip(columns, row)) for row in rows]

    def get_state(self, h3_index: str) -> tuple[str | None, str | None] | None:
        """(state, state_assignment_method) provenance for a cell, or None."""
        self.load()
        with self._lock:
            return self._state_by_cell.get(str(h3_index))

    def get_cell(self, h3_index: str, acq_date: str) -> dict[str, Any] | None:
        self.load()
        with self._lock:
            row = self._connection().execute(
                """
                SELECT d.*, s.* EXCLUDE (h3_08)
                FROM h3_daily d
                INNER JOIN osm_wri_static s USING (h3_08)
                WHERE d.h3_08 = ? AND CAST(d.acq_date AS DATE) = CAST(? AS DATE)
                LIMIT 1
                """,
                [h3_index, acq_date],
            ).fetchone()
            columns = [col[0] for col in self._conn.description] if self._conn.description else []
        return dict(zip(columns, row)) if row else None

    def rows_for_cell(
        self, h3_index: str, start_date: str | None = None, end_date: str | None = None
    ):
        """Return the H3-day evidence stream for one cell in date order."""

        self.load()
        clauses = ["d.h3_08 = ?"]
        params: list[Any] = [h3_index]
        if start_date:
            clauses.append("CAST(d.acq_date AS DATE) >= CAST(? AS DATE)")
            params.append(start_date)
        if end_date:
            clauses.append("CAST(d.acq_date AS DATE) <= CAST(? AS DATE)")
            params.append(end_date)
        with self._lock:
            return self._connection().execute(
                f"""
                SELECT d.*, s.* EXCLUDE (h3_08)
                FROM h3_daily d
                INNER JOIN osm_wri_static s USING (h3_08)
                WHERE {' AND '.join(clauses)}
                ORDER BY d.acq_date
                """,
                params,
            ).fetchdf()

    def query_bbox(
        self,
        min_lat: float,
        max_lat: float,
        min_lon: float,
        max_lon: float,
        acq_date: str,
    ) -> list[dict[str, Any]]:
        self.load()
        with self._lock:
            rows = self._connection().execute(
                """
                SELECT d.*, s.* EXCLUDE (h3_08)
                FROM h3_daily d
                INNER JOIN osm_wri_static s USING (h3_08)
                WHERE CAST(d.acq_date AS DATE) = CAST(? AS DATE)
                  AND s.h3_lat BETWEEN ? AND ?
                  AND s.h3_lon BETWEEN ? AND ?
                ORDER BY s.h3_08
                LIMIT 2500
                """,
                [acq_date, min_lat, max_lat, min_lon, max_lon],
            ).fetchall()
            columns = [col[0] for col in self._conn.description] if self._conn.description else []
        return [dict(zip(columns, row)) for row in rows]

    # Temporary compatibility for old spatial endpoint until Agent B rewires it.
    def get_viewport_hexagons(self, min_lat: float, max_lat: float, min_lon: float, max_lon: float, limit: int = 500):
        self.load()
        with self._lock:
            rows = self._connection().execute(
                """
                SELECT h3_08, h3_lat, h3_lon
                FROM osm_wri_static
                WHERE h3_lat BETWEEN ? AND ? AND h3_lon BETWEEN ? AND ?
                LIMIT ?
                """,
                [min_lat, max_lat, min_lon, max_lon, limit],
            ).fetchall()
        return [{"h3_index": row[0], "latitude": row[1], "longitude": row[2]} for row in rows]


feature_store = FeatureStoreService()
