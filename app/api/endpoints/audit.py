from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.schemas.audit import AnalystOverrideRequest, AuditLogEntry, AuditLogResponse
from app.services.audit_service import audit_service
from app.services.model_service import model_service

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
        # Resolve model prediction server-side (demo: mark as server-resolved)
        model_prediction = "server_resolved"

        return audit_service.log_override(
            req=request,
            model_prediction=model_prediction,
            model_version=model_service.model_version
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to record audit override: {str(e)}")


@router.get("/audit/logs", response_model=AuditLogResponse)
def get_audit_trail_logs(limit: int = 50):
    """Retrieve audit events for defense compliance inspection (read-only)."""
    return audit_service.get_logs(limit=limit)
