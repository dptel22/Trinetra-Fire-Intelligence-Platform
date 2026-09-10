import logging

from fastapi import APIRouter, HTTPException, Query

from app.core.config import settings
from app.schemas.archive import (
    ArchiveDatesResponse,
    ArchivePredictionsResponse,
    ArchiveSummaryResponse,
)
from app.services.archive_service import ArchiveDateNotAvailable, archive_service

logger = logging.getLogger(__name__)

router = APIRouter()

# "unclassified" is a policy fallback, not a trained class, but it can appear
# in predictions (UNCLASSIFIED_THRESHOLD); allow filtering on it.
_VALID_ARCHIVE_CLASSES = set(settings.TARGET_CLASSES) | {"unclassified"}


def _iso_date(value: str, field: str) -> str:
    try:
        from datetime import date as date_cls

        return date_cls.fromisoformat(value).isoformat()
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid ISO date for {field}: {value!r}")


@router.get("/archive/dates", response_model=ArchiveDatesResponse)
def get_archive_dates():
    """Dates available in the H3-day archive, plus honest serving provenance."""
    try:
        return archive_service.get_archive_dates()
    except Exception:
        logger.exception("Archive dates query failed")
        raise HTTPException(status_code=500, detail="Archive dates query failed due to an internal server error.")


@router.get("/archive/predictions", response_model=ArchivePredictionsResponse)
def get_archive_predictions(
    acq_date: str = Query(..., description="ISO date (YYYY-MM-DD) of the archived day to browse"),
    class_name: str | None = Query(None, description="Filter by predicted class"),
    state: str | None = Query(None, description="Filter by state provenance"),
    needs_review: bool | None = Query(None, description="Filter by analyst-review flag"),
    min_confidence: float | None = Query(None, ge=0.0, le=1.0),
    max_confidence: float | None = Query(None, ge=0.0, le=1.0),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0, le=100000),
):
    """Paginated archived predictions for one acq_date, with provenance.

    Unknown dates return a structured 404 — never a silent mock fallback.
    """
    acq_date = _iso_date(acq_date, "acq_date")
    if class_name is not None and class_name not in _VALID_ARCHIVE_CLASSES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown class_name {class_name!r}; valid classes: {sorted(_VALID_ARCHIVE_CLASSES)}",
        )
    if min_confidence is not None and max_confidence is not None and min_confidence > max_confidence:
        raise HTTPException(status_code=400, detail="min_confidence must be <= max_confidence")

    try:
        return archive_service.get_archive_predictions(
            acq_date=acq_date,
            class_name=class_name,
            state=state,
            needs_review=needs_review,
            min_confidence=min_confidence,
            max_confidence=max_confidence,
            limit=limit,
            offset=offset,
        )
    except ArchiveDateNotAvailable:
        dates = archive_service.get_archive_dates()
        raise HTTPException(
            status_code=404,
            detail={
                "error": "archive_date_not_available",
                "acq_date": acq_date,
                "newest_date": dates.get("newest_date"),
                "oldest_date": dates.get("oldest_date"),
            },
        )
    except Exception:
        logger.exception("Archive predictions query failed")
        raise HTTPException(status_code=500, detail="Archive predictions query failed due to an internal server error.")


@router.get("/archive/summary", response_model=ArchiveSummaryResponse)
def get_archive_summary(
    start_date: str | None = Query(None, description="ISO date; defaults to oldest archived day"),
    end_date: str | None = Query(None, description="ISO date; defaults to newest archived day"),
):
    """Daily totals by class, needs_review, and state over a date range."""
    start = _iso_date(start_date, "start_date") if start_date is not None else None
    end = _iso_date(end_date, "end_date") if end_date is not None else None
    if start is not None and end is not None and start > end:
        raise HTTPException(status_code=400, detail="start_date must be <= end_date")
    try:
        return archive_service.get_archive_summary(start_date=start, end_date=end)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception:
        logger.exception("Archive summary query failed")
        raise HTTPException(status_code=500, detail="Archive summary query failed due to an internal server error.")
