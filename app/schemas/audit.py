from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class AnalystOverrideRequest(BaseModel):
    hotspot_id: str = Field(..., description="Target Hotspot ID")
    analyst_id: str = Field(..., description="Authenticated Analyst Identifier")
    original_prediction: str = Field(..., description="Original CatBoost ML prediction")
    override_class: str = Field(..., description="Analyst assigned ground-truth / corrected class")
    justification: str = Field(..., min_length=5, description="Defense-grade forensic justification reasoning")
    confidence_rating: Optional[int] = Field(5, ge=1, le=5, description="Analyst confidence rating 1-5")

class AuditLogEntry(BaseModel):
    event_id: str
    timestamp: str
    hotspot_id: str
    analyst_id: str
    original_prediction: str
    override_class: str
    justification: str
    confidence_rating: int

class AuditLogResponse(BaseModel):
    total_logs: int
    logs: List[AuditLogEntry]
