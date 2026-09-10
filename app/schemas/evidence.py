"""Schemas for raw FIRMS evidence + ingestion run manifest browsing.

Every response is path-free: run records and raw parts are described by
logical keys (run_id, source, acq_date, rows, sha256) only — the host
filesystem layout is never leaked through the API (same posture as
test_security_error_sanitization).
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.archive import DataMode, IngestionStatus


class RawArchivePart(BaseModel):
    source: str
    acq_date: str
    rows: int
    sha256: str | None = None
    run_id: str | None = None


class IngestionRunRecord(BaseModel):
    run_id: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
    ok: bool | None = None
    target_date: str | None = None
    bbox: str | None = None
    fetch_mode: str | None = None
    raw_rows: dict[str, int] = Field(default_factory=dict)
    points_total: int | None = None
    rows_after_harmonize: int | None = None
    final_daily_rows: int | None = None
    model_version: str | None = None
    schema_hash: str | None = None
    plausibility_violations: list[str] = Field(default_factory=list)
    raw_archive: dict = Field(default_factory=dict)


class ArchiveRunsResponse(BaseModel):
    runs: list[IngestionRunRecord]
    total: int
    acq_date: str | None = None


class RawEvidenceResponse(BaseModel):
    acq_date: str
    source: str | None = None
    run_id: str
    total: int
    rows: list[dict]
    columns: list[str]
    data_mode: DataMode
    ingestion_status: IngestionStatus
    source_label: str
