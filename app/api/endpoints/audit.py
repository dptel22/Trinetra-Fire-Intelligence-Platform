from fastapi import APIRouter, HTTPException, Query
from app.schemas.audit import AnalystOverrideRequest, AuditLogEntry, AuditLogResponse
from app.services.audit_service import audit_service

router = APIRouter()

@router.post("/audit/override", response_model=AuditLogEntry)
def record_analyst_override(request: AnalystOverrideRequest):
    """
    Append-Only NTRO Audit Trail Endpoint.
    Captures human-in-the-loop analyst override decisions with tamper-resistant persistence.
    """
    try:
        return audit_service.log_override(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to record audit override: {str(e)}")

@router.get("/audit/logs", response_model=AuditLogResponse)
def get_audit_trail_logs(limit: int = Query(50, ge=1, le=500)):
    """Retrieve audit events for defense compliance inspection."""
    return audit_service.get_logs(limit=limit)
