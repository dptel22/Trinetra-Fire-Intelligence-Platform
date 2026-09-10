"""Immutable raw FIRMS observation archive.

Persists the untouched per-source `_parse_csv` output of every live FIRMS
fetch — the full column superset the API returned (the 13 NRT fields are a
validated subset; extras like `instrument` are preserved verbatim) plus three
provenance columns — BEFORE harmonization can drop rows. Rejected and
low-confidence rows and outside-India points are deliberately retained:
rejection provenance is the point of the archive.

Layout (hive-style, readable by DuckDB read_parquet with hive_partitioning):

    data/archive/firms/
      source=VIIRS_SNPP_NRT/
        acq_date=YYYY-MM-DD/part-<run_id>.parquet

The run_id in the filename makes parts immutable by construction: a later run
writes a NEW part next to the old one, never overwrites it. Zero-detection
days still write a zero-row, schema-carrying partition — an empty day is
evidence too.

The module never returns filesystem paths to callers: part descriptors carry
logical keys only (source, acq_date, rows, sha256) so run manifests and API
responses stay free of host paths.
"""

from __future__ import annotations

import hashlib
import logging
import os
from pathlib import Path

import pandas as pd

from app.core.config import settings
from ingestion.firms_pull import NRT_COLUMNS, SOURCES

logger = logging.getLogger("ingestion.raw_archive")

PROVENANCE_COLUMNS = ["_run_id", "_ingested_at_utc", "_request_bbox"]


def _part_dir(source: str, acq_date: str) -> Path:
    return Path(settings.RAW_ARCHIVE_DIR) / f"source={source}" / f"acq_date={acq_date}"


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def _atomic_write_parquet(df: pd.DataFrame, path: Path) -> None:
    import pyarrow as pa
    import pyarrow.parquet as pq

    path.parent.mkdir(parents=True, exist_ok=True)
    table = pa.Table.from_pandas(df, preserve_index=False)
    tmp = path.with_suffix(path.suffix + ".tmp")
    pq.write_table(table, tmp)
    os.replace(tmp, path)


def write_raw_observations(
    raw_by_source: dict[str, pd.DataFrame],
    run_id: str,
    requested_date: str,
    bbox: str,
    ingested_at: str,
) -> list[dict]:
    """Write one immutable part per (source, acq_date). Returns logical part keys.

    A gap-fill run's chunk frames can span several acq_dates, so parts are cut
    per distinct acq_date inside each source frame. Empty inputs still produce
    a zero-row part per source for the requested date.
    """
    parts: list[dict] = []
    for source in SOURCES:
        raw = raw_by_source.get(source)
        if raw is None:
            # No frame for this source at all — fall back to the NRT column
            # schema so the zero-row part still documents the expected shape.
            raw = pd.DataFrame({col: pd.Series(dtype="object") for col in NRT_COLUMNS})
        if raw.empty:
            day_groups = [(requested_date, raw)]
        else:
            day_groups = [
                (str(day.date()) if hasattr(day, "date") else str(day), group)
                for day, group in raw.groupby(pd.to_datetime(raw["acq_date"]).dt.date)
            ]
        for acq_date, group in day_groups:
            out = group.drop(columns=[c for c in ("source", "satellite_name") if c in group.columns]).copy()
            out["_run_id"] = run_id
            out["_ingested_at_utc"] = ingested_at
            out["_request_bbox"] = bbox
            path = _part_dir(source, acq_date) / f"part-{run_id}.parquet"
            _atomic_write_parquet(out, path)
            parts.append(
                {
                    "source": source,
                    "acq_date": acq_date,
                    "rows": int(len(out)),
                    "sha256": _sha256_file(path),
                    "run_id": run_id,
                }
            )
            logger.info("Raw archive part written: %s/%s (%d rows)", source, acq_date, len(out))
    return parts


def _list_parts(acq_date: str, source: str | None = None) -> list[Path]:
    root = Path(settings.RAW_ARCHIVE_DIR)
    if not root.exists():
        return []
    sources = [source] if source else [d.name.split("=", 1)[1] for d in sorted(root.glob("source=*")) if d.is_dir()]
    parts: list[Path] = []
    for src in sources:
        src_dir = root / f"source={src}" / f"acq_date={acq_date}"
        if src_dir.exists():
            parts.extend(sorted(src_dir.glob("part-*.parquet")))
    return parts


def available_raw_dates() -> list[str]:
    """acq_dates with at least one raw part, sorted ascending (for UI gating)."""
    root = Path(settings.RAW_ARCHIVE_DIR)
    if not root.exists():
        return []
    dates = {
        d.name.split("=", 1)[1]
        for src_dir in root.glob("source=*")
        for d in src_dir.glob("acq_date=*")
        if d.is_dir() and any(d.glob("part-*.parquet"))
    }
    return sorted(dates)


def has_parts(acq_date: str, source: str | None = None) -> bool:
    """True when at least one raw part exists for the date (any run)."""
    return bool(_list_parts(acq_date, source))


def read_raw_observations(
    acq_date: str,
    source: str | None = None,
    run_id: str | None = None,
    limit: int = 1000,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """Read raw observations for one acq_date, preferring the requested run's part.

    Returns (rows, total_matching). When run_id is None the newest part for the
    date (lexicographically last filename, i.e. latest run) is used, mirroring
    how provenance treats the newest decisive run.
    """
    import duckdb

    parts = _list_parts(acq_date, source)
    if not parts:
        return [], 0
    if run_id is not None:
        matching = [p for p in parts if p.name == f"part-{run_id}.parquet"]
        if not matching:
            return [], 0
        part = matching[0]
    else:
        part = parts[-1]

    conn = duckdb.connect()
    try:
        total = conn.execute(
            "SELECT count(*) FROM read_parquet(?)",
            [str(part)],
        ).fetchone()[0]
        rows = conn.execute(
            f"SELECT * FROM read_parquet(?) LIMIT ? OFFSET ?",
            [str(part), int(limit), int(offset)],
        ).fetchdf()
    finally:
        conn.close()
    records = rows.to_dict(orient="records")
    for rec in records:
        if hasattr(rec.get("acq_date"), "isoformat"):
            rec["acq_date"] = rec["acq_date"].isoformat()
    return records, int(total)
