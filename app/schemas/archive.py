"""Schemas for the archive (historical H3-day prediction browsing) API.

Deliberately no "alert" object here: every row is a model *prediction* over an
H3-day cell. No alert lifecycle state exists yet, so none is implied.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.prediction import PredictionResponse

DataMode = Literal["live", "historical", "demo", "offline"]

IngestionStatus = Literal["ok", "plausibility_warning", "failed", "no_run_record"]


class ArchiveDatesResponse(BaseModel):
    available_dates: list[str]
    newest_date: str | None
    oldest_date: str | None
    source: str
    data_mode: DataMode


class ArchivePredictionsResponse(BaseModel):
    total: int
    acq_date: str
    predictions: list[PredictionResponse]
    data_mode: DataMode
    source: str
    model_version: str
    ingestion_run_id: str | None = None
    ingestion_status: IngestionStatus | None = None


class ArchiveDaySummary(BaseModel):
    date: str
    total: int
    needs_review_total: int
    by_class: dict[str, int]
    by_state: dict[str, int]


class ArchiveSummaryResponse(BaseModel):
    start_date: str
    end_date: str
    days: list[ArchiveDaySummary]
    unavailable_dates: list[str] = Field(default_factory=list)
    data_mode: DataMode
    source: str
