from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Literal
from datetime import datetime

class FIRMSRecord(BaseModel):
    """
    Harmonized NASA FIRMS / VIIRS point observation schema.

    Field names follow the actual VIIRS C2 column names as documented in
    docs/eda-findings.md (main branch). Do NOT use old MODIS names like
    'brightness' or 'bright_t31' — this backend targets VIIRS data only.
    """
    hotspot_id: Optional[str] = Field(None, description="Unique identifier for the observation (generated if absent)")

    # Core spatial fields
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Latitude in decimal degrees")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Longitude in decimal degrees")

    # VIIRS brightness channels (VIIRS I4 and I5, not MODIS Band 21/31)
    bright_ti4: float = Field(..., gt=0, description="VIIRS I4 channel brightness temperature (Kelvin)")
    bright_ti5: float = Field(..., gt=0, description="VIIRS I5 channel brightness temperature (Kelvin)")

    # Pixel geometry
    scan: float = Field(..., gt=0, description="Scan direction pixel size (km)")
    track: float = Field(..., gt=0, description="Track direction pixel size (km)")

    # Acquisition metadata
    acq_date: str = Field(..., description="Acquisition date (YYYY-MM-DD)")
    acq_time: str = Field(..., description="Acquisition time (HHMM UTC)")
    satellite: str = Field("N", description="Satellite identifier: N (NOAA-20), S (Suomi-NPP), T (Terra), A (Aqua)")
    daynight: Literal["D", "N"] = Field("D", description="Day (D) or Night (N) flag")

    # Fire Radiative Power
    frp: float = Field(..., ge=0, description="Fire Radiative Power (MW)")

    # Confidence: VIIRS C2 uses string categories, NOT a float 0-100
    confidence: Literal["low", "nominal", "high"] = Field("nominal", description="Detection confidence: low | nominal | high")

    # Optional temporal persistence fields
    persistence_90d: Optional[int] = Field(0, ge=0, description="Raw detection count in 90-day window for this H3 cell")
    observed_days_in_90d: Optional[int] = Field(90, ge=1, le=90, description="Valid observation days in 90-day window (accounts for cloud/sensor gaps)")

    # Optional FIRMS type field (only in viirs-snpp_2024 source)
    type: Optional[int] = Field(None, description="FIRMS type: 0=vegetation, 1=volcano, 2=static land source, 3=offshore")


class IngestionBatchRequest(BaseModel):
    records: List[FIRMSRecord]


class IngestionBatchResponse(BaseModel):
    total_received: int
    total_valid: int
    total_quarantined_dlq: int
    message: str
    quarantined_errors: List[dict] = []
