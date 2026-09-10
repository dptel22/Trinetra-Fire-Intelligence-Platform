"""Durable ingestion run manifest in DuckDB.

The JSON run history (`ingestion_run_history.json`) is the authoritative
provenance source for serving, but it truncates at 200 entries. This module
mirrors every canonical run into `settings.INGESTION_DB_PATH` as an INSERT-only
manifest table so runs stay traceable long-term.

The write is deliberately BEST-EFFORT: ingestion also runs from the CLI as a
separate process, and DuckDB is single-writer per file across processes — a
manifest lock contention must degrade to a logged warning, never fail an
ingestion run that already wrote its serving parquets and raw evidence. All
query text is a static literal; every value is `?`-bound.
"""

from __future__ import annotations

import logging
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger("ingestion.manifest")


def record_run(stats: dict) -> bool:
    """Append one run to the manifest. Returns True when written.

    Never raises: cross-process DuckDB lock contention or a bad row degrades to
    a warning — the serving outputs already exist at this point.
    """
    if not stats.get("run_id"):
        logger.warning("Manifest skipped: run stats carry no run_id")
        return False
    try:
        import duckdb

        Path(settings.INGESTION_DB_PATH).parent.mkdir(parents=True, exist_ok=True)
        conn = duckdb.connect(settings.INGESTION_DB_PATH)
        try:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS ingestion_runs (run_id VARCHAR PRIMARY KEY, started_at VARCHAR, finished_at VARCHAR, ok BOOLEAN, error VARCHAR, target_date VARCHAR, bbox VARCHAR, fetch_mode VARCHAR, points_total INTEGER, final_daily_rows INTEGER, final_static_rows INTEGER, model_version VARCHAR, schema_hash VARCHAR, plausibility_violations VARCHAR, raw_archive_parts VARCHAR)"
            )
            conn.execute(
                "INSERT OR REPLACE INTO ingestion_runs (run_id, started_at, finished_at, ok, error, target_date, bbox, fetch_mode, points_total, final_daily_rows, final_static_rows, model_version, schema_hash, plausibility_violations, raw_archive_parts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    stats.get("run_id"),
                    stats.get("started_at"),
                    stats.get("finished_at"),
                    bool(stats.get("ok")),
                    stats.get("error"),
                    stats.get("target_date"),
                    stats.get("bbox"),
                    (stats.get("fetch") or {}).get("mode"),
                    stats.get("points_total"),
                    stats.get("final_daily_rows"),
                    stats.get("final_static_rows"),
                    stats.get("model_version"),
                    stats.get("schema_hash"),
                    _json_or_empty(stats.get("plausibility_violations")),
                    _json_or_empty(stats.get("raw_archive")),
                ],
            )
        finally:
            conn.close()
        return True
    except Exception as err:  # noqa: BLE001 — best-effort by contract
        logger.warning("Manifest write failed (non-fatal): %s", err)
        return False


def _json_or_empty(value) -> str:
    import json as _json

    return _json.dumps(value if value is not None else [])
