from __future__ import annotations

from pathlib import Path
from threading import Lock
from typing import Any, Dict, List, Optional

import duckdb

from app.core.config import settings


STATIC_COLUMNS = [col for col in settings.MODEL_FEATURES if col not in settings.H3_DAILY_FEATURES]


class FeatureStoreService:
    """DuckDB-backed H3-day feature store seeded from the real parquet artifacts."""

    def __init__(self, db_path: str = settings.DUCKDB_PATH):
        self.db_path = db_path
        self.loaded = False
        self._lock = Lock()

    def _connect(self, read_only: bool = False):
        return duckdb.connect(self.db_path, read_only=read_only)

    def load(self) -> None:
        with self._lock:
            if self.loaded:
                return
            daily_path = Path(settings.H3_DAILY_PARQUET)
            static_path = Path(settings.OSMWRI_PARQUET)
            if not daily_path.exists():
                raise FileNotFoundError(f"Missing H3 daily parquet: {daily_path}")
            if not static_path.exists():
                raise FileNotFoundError(f"Missing OSM/WRI parquet: {static_path}")

            Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
            conn = self._connect()
            conn.execute("CREATE OR REPLACE TABLE h3_daily AS SELECT * FROM read_parquet(?)", [str(daily_path)])
            # DuckDB does NOT support SELECT DISTINCT ON. Use ROW_NUMBER() to
            # take the first row per h3_08 for the static OSM/WRI columns.
            static_col_list = ", ".join(STATIC_COLUMNS)
            conn.execute(
                f"""
                CREATE OR REPLACE TABLE osm_wri_static AS
                SELECT h3_08, h3_lat, h3_lon, {static_col_list}
                FROM (
                    SELECT
                        h3_08, h3_lat, h3_lon, {static_col_list},
                        ROW_NUMBER() OVER (PARTITION BY h3_08 ORDER BY h3_08) AS _rn
                    FROM read_parquet(?)
                    WHERE h3_08 IS NOT NULL
                )
                WHERE _rn = 1
                """,
                [str(static_path)],
            )
            conn.close()
            self.loaded = True

    def get_cell(self, h3_index: str, acq_date: str) -> Optional[Dict[str, Any]]:
        self.load()
        conn = self._connect(read_only=True)
        row = conn.execute(
            """
            SELECT d.*, s.* EXCLUDE (h3_08)
            FROM h3_daily d
            LEFT JOIN osm_wri_static s USING (h3_08)
            WHERE d.h3_08 = ? AND CAST(d.acq_date AS DATE) = CAST(? AS DATE)
            LIMIT 1
            """,
            [h3_index, acq_date],
        ).fetchone()
        columns = [col[0] for col in conn.description] if conn.description else []
        conn.close()
        return dict(zip(columns, row)) if row else None

    def query_bbox(
        self,
        min_lat: float,
        max_lat: float,
        min_lon: float,
        max_lon: float,
        acq_date: str,
    ) -> List[Dict[str, Any]]:
        self.load()
        conn = self._connect(read_only=True)
        rows = conn.execute(
            """
            SELECT d.*, s.* EXCLUDE (h3_08)
            FROM h3_daily d
            INNER JOIN osm_wri_static s USING (h3_08)
            WHERE CAST(d.acq_date AS DATE) = CAST(? AS DATE)
              AND s.h3_lat BETWEEN ? AND ?
              AND s.h3_lon BETWEEN ? AND ?
            LIMIT 2500
            """,
            [acq_date, min_lat, max_lat, min_lon, max_lon],
        ).fetchall()
        columns = [col[0] for col in conn.description] if conn.description else []
        conn.close()
        return [dict(zip(columns, row)) for row in rows]

    # Temporary compatibility for old spatial endpoint until Agent B rewires it.
    def get_viewport_hexagons(self, min_lat: float, max_lat: float, min_lon: float, max_lon: float, limit: int = 500):
        self.load()
        conn = self._connect(read_only=True)
        rows = conn.execute(
            """
            SELECT h3_08, h3_lat, h3_lon
            FROM osm_wri_static
            WHERE h3_lat BETWEEN ? AND ? AND h3_lon BETWEEN ? AND ?
            LIMIT ?
            """,
            [min_lat, max_lat, min_lon, max_lon, limit],
        ).fetchall()
        conn.close()
        return [{"h3_index": row[0], "latitude": row[1], "longitude": row[2]} for row in rows]


feature_store = FeatureStoreService()
