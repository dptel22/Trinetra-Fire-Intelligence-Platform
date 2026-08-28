from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class FIRMSRecord(BaseModel):
    """Raw NASA FIRMS Point Observation schema"""
    hotspot_id: Optional[str] = Field(None, description="Unique identifier for observation")
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Latitude in decimal degrees")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Longitude in decimal degrees")
    brightness: float = Field(..., gt=0, description="VIIRS/MODIS brightness temperature (Kelvin)")
    scan: float = Field(..., gt=0, description="Spatial resolution in scan direction (km)")
    track: float = Field(..., gt=0, description="Spatial resolution in track direction (km)")
    acq_date: str = Field(..., description="Acquisition date (YYYY-MM-DD)")
    acq_time: str = Field(..., description="Acquisition time (HHMM UTC)")
    satellite: str = Field("SNPP", description="Satellite sensor: SNPP, NOAA-20, Aqua, Terra")
    confidence: float = Field(..., ge=0.0, le=100.0, description="Detection confidence percentage")
    version: Optional[str] = Field("1.0", description="Algorithm version")
    bright_t31: float = Field(..., gt=0, description="VIIRS I5 / MODIS Band 31 channel temperature (Kelvin)")
    frp: float = Field(..., ge=0, description="Fire Radiative Power (MW)")
    daynight: str = Field("D", description="Day or Night flag (D or N)")
    observed_days_in_90d: Optional[int] = Field(90, ge=1, le=90, description="Valid observation days within 90d window")
    persistence_90d: Optional[int] = Field(0, ge=0, description="Raw counts of detections in 90-day window")
    type: Optional[int] = Field(0, description="Raw inferred type flag from FIRMS")

class IngestionBatchRequest(BaseModel):
    records: List[FIRMSRecord]

class IngestionBatchResponse(BaseModel):
    total_received: int
    total_valid: int
    total_quarantined_dlq: int
    message: str
    quarantined_errors: List[dict] = []
