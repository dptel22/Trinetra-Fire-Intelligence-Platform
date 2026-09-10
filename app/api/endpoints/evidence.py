"""Raw FIRMS evidence + ingestion-run manifest browsing under /api/v1/archive.

Complements the prediction archive: /archive/predictions shows what the model
concluded, /archive/evidence shows what the satellite actually reported for
the same date+run, and /archive/runs lists the whitelisted manifest fields of
the ingestion runs that connect the two.

No filesystem paths are ever returned — part descriptors are logical keys.
"""

import logging

from fastapi import APIRouter, HTTPException, Query

from app.schemas.evidence import (
    ArchiveRunsResponse,
    IngestionRunRecord,
    RawEvidenceResponse,
)
from app.services.archive_service import archive_service
from ingestion import raw_archive

logger = logging.getLogger(__name__)

router = APIRouter()

# Whitelisted scalar keys copied from a run-history entry; everything else
# (osm_cache paths, per-chunk dicts, host-specific fields) stays internal.
_RUN_SCALARS = (
    "run_id", "started_at", "finished_at", "ok", "target_date", "bbox",
    "points_total", "final_daily_rows", "model_version", "schema_hash",
)


def _run_record(run: dict) -> IngestionRunRecord:
    fetch = run.get("fetch") or {}
    return IngestionRunRecord(
        **{key: run.get(key) for key in _RUN_SCALARS},
        fetch_mode=fetch.get("mode"),
        raw_rows={k: int(v) for k, v in (fetch.get("raw_rows") or {}).items() if isinstance(v, (int, float))},
        rows_after_harmonize=fetch.get("rows_after_harmonize"),
        plausibility_violations=[str(v) for v in (run.get("plausibility_violations") or [])],
        raw_archive=run.get("raw_archive") or {},
    )


def _runs_for_date(acq_date: str | None) -> list[dict]:
    runs = archive_service._run_history()
    if acq_date is None:
        return runs
    matched = []
    for run in runs:
        if str(run.get("target_date")) == acq_date:
            matched.append(run)
            continue
        fetch = run.get("fetch") or {}
        raw_rows = fetch.get("raw_rows") or {}
        # Gap-fill runs cover every chunk date, e.g. key "VIIRS_SNPP_NRT@2026-09-05".
        if any(k.endswith(f"@{acq_date}") for k in raw_rows):
            matched.append(run)
            continue
        parts = (run.get("raw_archive") or {}).get("parts") or []
        if any(p.get("acq_date") == acq_date for p in parts):
            matched.append(run)
    return matched


@router.get("/archive/runs", response_model=ArchiveRunsResponse)
def get_archive_runs(
    acq_date: str | None = Query(None, description="Filter to runs covering this ISO date"),
    limit: int = Query(20, ge=1, le=200),
):
    """Whitelisted ingestion-run manifest entries (newest first)."""
    if acq_date is not None:
        from app.api.endpoints.archive import _iso_date

        acq_date = _iso_date(acq_date, "acq_date")
    try:
        runs = _runs_for_date(acq_date)
        records = [_run_record(run) for run in reversed(runs[-limit:])]
        return ArchiveRunsResponse(runs=records, total=len(runs), acq_date=acq_date)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Archive runs query failed")
        raise HTTPException(status_code=500, detail="Archive runs query failed due to an internal server error.")


@router.get("/archive/evidence", response_model=RawEvidenceResponse)
def get_archive_evidence(
    acq_date: str = Query(..., description="ISO date (YYYY-MM-DD) of the raw observations"),
    source: str | None = Query(None, description="FIRMS source product, e.g. VIIRS_SNPP_NRT"),
    run_id: str | None = Query(None, description="Ingestion run; defaults to the decisive run for the date"),
    limit: int = Query(200, ge=1, le=5000),
    offset: int = Query(0, ge=0, le=100000),
):
    """Raw FIRMS observations behind a prediction date — immutable evidence.

    Defaults to the decisive run for the date (the same provenance walk the
    prediction archive uses), so this always shows the fetch behind the
    displayed predictions. Unknown dates return a structured 404.
    """
    from app.api.endpoints.archive import _iso_date

    acq_date = _iso_date(acq_date, "acq_date")
    if source is not None and source not in raw_archive.SOURCES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown source {source!r}; valid sources: {list(raw_archive.SOURCES)}",
        )
    try:
        provenance = archive_service.provenance_for_date(acq_date)
        effective_run_id = run_id or provenance.get("ingestion_run_id")
        # A date with no raw partition at all is a 404 ("not captured"); a
        # partition with zero rows is a valid empty day — evidence, not an error.
        if not raw_archive.has_parts(acq_date, source):
            available = raw_archive.available_raw_dates()
            raise HTTPException(
                status_code=404,
                detail={
                    "error": "raw_evidence_not_available",
                    "acq_date": acq_date,
                    "reason": (
                        "no raw observations were captured for this date "
                        "(predates the raw archive)" if acq_date not in available
                        else "no raw part matches the requested source/run"
                    ),
                    "available_dates": available,
                },
            )
        rows, total = raw_archive.read_raw_observations(
            acq_date=acq_date,
            source=source,
            run_id=effective_run_id,
            limit=limit,
            offset=offset,
        )
        columns = sorted({key for row in rows for key in row})
        return RawEvidenceResponse(
            acq_date=acq_date,
            source=source,
            run_id=effective_run_id or "unknown",
            total=total,
            rows=rows,
            columns=columns,
            data_mode=provenance.get("data_mode", "historical"),
            ingestion_status=provenance.get("ingestion_status", "no_run_record"),
            source_label=f"raw FIRMS archive (source={source or 'all'})",
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Raw evidence query failed")
        raise HTTPException(status_code=500, detail="Raw evidence query failed due to an internal server error.")
