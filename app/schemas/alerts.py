"""Schemas for the alert lifecycle API.

A hotspot's lifecycle state is replayed from append-only events; the model's
original prediction is resolved server-side and never client-supplied. The
lifecycle state is separate from the model's `needs_review` flag, which stays
on the prediction itself.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

AlertAction = Literal["acknowledged", "confirmed", "dismissed", "note", "reopened"]

LifecycleState = Literal["new", "acknowledged", "confirmed", "dismissed"]


class AlertActionRequest(BaseModel):
    action: AlertAction
    note: str | None = Field(
        None,
        description="Analyst note. Mandatory (min 10 chars) for dismissals.",
        max_length=2000,
    )
    analyst_id: str | None = Field(
        None,
        max_length=80,
        description="Reviewer identity; defaults to DEMO_ANALYST when unset.",
    )

    def resolved_analyst_id(self) -> str:
        return (self.analyst_id or "DEMO_ANALYST").strip() or "DEMO_ANALYST"


class AlertEvent(BaseModel):
    model_config = {"protected_namespaces": ()}

    event_id: str
    timestamp: str
    hotspot_id: str
    h3_08: str
    acq_date: str
    action: str
    note: str | None = None
    analyst_id: str
    model_prediction: str | None = None
    model_confidence: float | None = None
    needs_review: bool | None = None
    model_version: str | None = None
    ingestion_run_id: str | None = None
    data_mode: str | None = None


class AlertHistoryResponse(BaseModel):
    hotspot_id: str
    total: int
    events: list[AlertEvent]


class AlertState(BaseModel):
    hotspot_id: str
    h3_08: str
    acq_date: str
    state: LifecycleState
    last_action: str | None = None
    last_note: str | None = None
    analyst_id: str | None = None
    last_event_at: str | None = None
    last_event_id: str | None = None


class AlertStatesResponse(BaseModel):
    acq_date: str
    total: int
    counts: dict[str, int]
    states: list[AlertState]
