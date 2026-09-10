import logging

from fastapi import APIRouter, HTTPException

from app.schemas.audit import AnalystOverrideRequest, AuditLogEntry, AuditLogResponse
from app.services.audit_service import audit_service
from app.services.model_service import model_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/audit/override", response_model=AuditLogEntry)
def record_analyst_override(request: AnalystOverrideRequest):
    """
    Append-Only NTRO Audit Trail Endpoint.

    The model's original prediction is resolved server-side using the stored
    hotspot_id lookup. In the demo, returns a placeholder since no prediction
    store is wired yet. In production, this would look up the cached prediction.
    """
    try:
        # Resolve real model prediction server-side for (cell_id, acq_date)
        model_prediction = "server_resolved"
        cell_id = request.hotspot_id
        acq_date = None
        if "_" in request.hotspot_id:
            cell_id, acq_date = request.hotspot_id.split("_", 1)

        if acq_date:
            try:
                detail = model_service.get_cell_detail(cell_id, acq_date)
                model_prediction = f"{detail.predicted_class} (confidence: {detail.confidence:.4f})"
            except Exception as exc:
                logger.warning("Could not resolve model prediction for hotspot %s: %s", request.hotspot_id, exc)
                model_prediction = "unresolved"

        return audit_service.log_override(
            req=request,
            model_prediction=model_prediction,
            model_version=model_service.model_version
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to record audit override")
        raise HTTPException(status_code=500, detail="Failed to record audit override due to an internal server error.")


@router.get("/audit/logs", response_model=AuditLogResponse)
def get_audit_trail_logs(limit: int = 50):
    """Retrieve audit events for defense compliance inspection (read-only)."""
    try:
        return audit_service.get_logs(limit=limit)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to retrieve audit trail logs")
        raise HTTPException(status_code=500, detail="Failed to retrieve audit trail logs due to an internal server error.")
