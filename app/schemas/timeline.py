from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class TimelineContext(BaseModel):
    osm_context_vintage: str
    wri_context_vintage: str
    historical_context_available: bool
    land_use_claim: bool


class TimelineModel(BaseModel):
    bundle_version: str | None = None
    pipeline_version: str
    prediction_scope: str


class TimelineResponse(BaseModel):
    h3_index: str
    granularity: Literal["day", "month", "year"]
    requested_start_date: str | None
    requested_end_date: str | None
    available_start_date: str | None
    available_end_date: str | None
    archive_range_limited: bool
    # Materialization provenance — present on every successful (200) response,
    # including the explicit fallback path. Missing/stale layers fail closed (503)
    # by default and never reach this shape unless TIMELINE_ALLOW_FALLBACK=1.
    materialization_status: Literal["materialized", "stale", "missing", "fallback_h3_daily"]
    materialized_at: str | None = None
    materialization_version: str | None = None
    materialized_start_date: str | None = None
    materialized_end_date: str | None = None
    fallback_used: bool = False
    rows: list[dict[str, Any]]
    gaps: list[dict[str, str]] = Field(default_factory=list)
    partial_periods: list[str] = Field(default_factory=list)
    has_more: bool
    next_cursor: str | None
    context: TimelineContext
    model: TimelineModel
    caveats: list[str] = Field(default_factory=list)
