from __future__ import annotations

from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from app.schemas.timeline import TimelineResponse
from app.services.feature_store import FeatureStoreUnavailableError
from app.services.timeline_service import (
    TimelineDateError,
    TimelineMaterializationError,
    timeline_service,
)

router = APIRouter()


@router.get("/cells/{h3_index}/timeline", response_model=TimelineResponse)
def get_cell_timeline(
    h3_index: str,
    granularity: Literal["day", "month", "year"] = Query("month"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    for value, name in ((start_date, "start_date"), (end_date, "end_date"), (cursor, "cursor")):
        if value is not None:
            try:
                date.fromisoformat(value)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=f"Invalid ISO date for {name}: {value!r}") from exc
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date must be <= end_date")
    try:
        return timeline_service.get_timeline(
            h3_index=h3_index,
            granularity=granularity,
            start_date=start_date,
            end_date=end_date,
            cursor=cursor,
            limit=limit,
        )
    except TimelineDateError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except TimelineMaterializationError as exc:
        resolution = exc.resolution
        raise HTTPException(
            status_code=503,
            detail={
                "message": resolution.get("detail"),
                "materialization_status": resolution.get("status"),
                "layer": resolution.get("layer"),
                "materialized_at": resolution.get("materialized_at"),
                "materialization_version": resolution.get("materialization_version"),
                "materialized_start_date": resolution.get("materialized_start_date"),
                "materialized_end_date": resolution.get("materialized_end_date"),
                "fallback_used": False,
            },
        ) from exc
    except FeatureStoreUnavailableError:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Timeline query failed due to an internal server error.") from exc
