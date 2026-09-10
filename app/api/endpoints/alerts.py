"""Alert lifecycle endpoints: analyst review actions on H3-day hotspots.

Every action is an append-only event in the audit trail; the model's original
prediction and the decisive ingestion run are resolved server-side so the
evidentiary chain never depends on client-supplied values. Lifecycle state is
replayed from events and is separate from the model's `needs_review` flag.
"""

import logging

from fastapi import APIRouter, HTTPException

from app.schemas.alerts import (
    AlertActionRequest,
    AlertEvent,
    AlertHistoryResponse,
    AlertStatesResponse,
)
from app.services.archive_service import archive_service
from app.services.audit_service import audit_service
from app.services.feature_store import feature_store
from app.services.model_service import model_service

logger = logging.getLogger(__name__)

router = APIRouter()


def _split_hotspot_id(hotspot_id: str) -> tuple[str, str]:
    """'{h3_08}_{acq_date}' — the same convention the audit override uses."""
    if "_" not in hotspot_id:
        raise HTTPException(status_code=400, detail=f"Malformed hotspot_id {hotspot_id!r}; expected '{{h3_08}}_{{acq_date}}'")
    h3_08, acq_date = hotspot_id.split("_", 1)
    try:
        from datetime import date as date_cls

        date_cls.fromisoformat(acq_date)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Malformed hotspot_id {hotspot_id!r}: acq_date is not an ISO date")
    return h3_08, acq_date


def _resolve_context(h3_08: str, acq_date: str):
    """Server-side resolution of the model output + run provenance. 404 when absent."""
    try:
        detail = model_service.get_cell_detail(h3_08, acq_date)
    except ValueError as ve:
        if "No H3-day features found" in str(ve):
            raise HTTPException(status_code=404, detail=f"No stored prediction for {h3_08} on {acq_date}")
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception:
        logger.exception("Cell detail resolution failed for %s/%s", h3_08, acq_date)
        raise HTTPException(status_code=500, detail="Failed to resolve the stored prediction.")
    provenance = archive_service.provenance_for_date(acq_date)
    return detail, provenance


@router.post("/alerts/{hotspot_id}/actions", response_model=AlertEvent)
def record_alert_action(hotspot_id: str, request: AlertActionRequest):
    """Append an analyst lifecycle action (acknowledge/confirm/dismiss/note/reopen)."""
    if request.action == "dismissed" and (request.note is None or len(request.note.strip()) < 10):
        raise HTTPException(status_code=400, detail="Dismissals require a justification note of at least 10 characters.")

    h3_08, acq_date = _split_hotspot_id(hotspot_id)
    detail, provenance = _resolve_context(h3_08, acq_date)
    # DEMO_ANALYST default is applied server-side so the stored event always
    # carries an explicit reviewer identity.
    request.analyst_id = request.resolved_analyst_id()
    try:
        return audit_service.log_action(
            req=request,
            hotspot_id=hotspot_id,
            h3_08=h3_08,
            acq_date=acq_date,
            model_prediction=f"{detail.predicted_class} (confidence: {detail.confidence:.4f})",
            model_confidence=float(detail.confidence),
            needs_review=bool(detail.needs_review),
            model_version=model_service.model_version,
            ingestion_run_id=provenance.get("ingestion_run_id"),
            data_mode=provenance.get("data_mode"),
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to record alert action for %s", hotspot_id)
        raise HTTPException(status_code=500, detail="Failed to record the alert action due to an internal server error.")


@router.get("/alerts/states", response_model=AlertStatesResponse)
def get_alert_states(acq_date: str):
    """Replay-derived lifecycle state for every hotspot of one acquisition date."""
    from app.api.endpoints.archive import _iso_date

    acq_date = _iso_date(acq_date, "acq_date")
    try:
        rows = feature_store.rows_for_date(acq_date)
    except Exception:
        logger.exception("Feature store query failed for %s", acq_date)
        raise HTTPException(status_code=500, detail="Failed to query the feature store.")
    if not rows:
        raise HTTPException(
            status_code=404,
            detail={"error": "archive_date_not_available", "acq_date": acq_date},
        )
    hotspot_ids = [f"{row['h3_08']}_{acq_date}" for row in rows if row.get("h3_08")]
    try:
        return audit_service.get_state_for_date(acq_date, hotspot_ids)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Alert state replay failed for %s", acq_date)
        raise HTTPException(status_code=500, detail="Failed to derive alert states due to an internal server error.")


@router.get("/alerts/{hotspot_id}/history", response_model=AlertHistoryResponse)
def get_alert_history(hotspot_id: str):
    """Full append-only event history for one hotspot (oldest first)."""
    h3_08, acq_date = _split_hotspot_id(hotspot_id)
    _resolve_context(h3_08, acq_date)  # 404 when the prediction is absent
    try:
        events = audit_service.get_history(hotspot_id)
        return AlertHistoryResponse(hotspot_id=hotspot_id, total=len(events), events=events)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Alert history query failed for %s", hotspot_id)
        raise HTTPException(status_code=500, detail="Failed to retrieve alert history due to an internal server error.")
