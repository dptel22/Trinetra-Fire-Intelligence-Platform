from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List


class AnalystOverrideRequest(BaseModel):
    """
    Analyst override request for the NTRO audit trail.

    NOTE: original_prediction is NOT accepted from the client.
    It is resolved server-side from the stored prediction record to
    maintain the evidentiary integrity of the audit chain.
    """
    hotspot_id: str = Field(..., description="Target Hotspot / H3-Day record ID")
    analyst_id: str = Field(..., description="Authenticated analyst identifier (e.g. NTRO_OFFICER_409)")
    override_class: str = Field(..., description="Analyst-assigned corrected class")
    justification: str = Field(..., min_length=10, description="Forensic justification for the override (mandatory, min 10 chars)")
    confidence_rating: Optional[int] = Field(5, ge=1, le=5, description="Analyst self-rated confidence: 1 (uncertain) to 5 (certain)")


class AuditLogEntry(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    event_id: str
    timestamp: str
    hotspot_id: str
    analyst_id: str
    model_prediction: str           # Resolved server-side — NOT client-supplied
    override_class: str
    justification: str
    confidence_rating: int
    model_version: str              # Model artifact version for provenance


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    total_logs: int
    logs: List[AuditLogEntry]
