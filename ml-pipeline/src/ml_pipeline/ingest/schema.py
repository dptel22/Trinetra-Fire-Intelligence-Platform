"""
Pydantic schemas for raw and harmonized FIRMS fire records.
"""
from datetime import date, time, datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field, field_validator


class FireRecordRaw(BaseModel):
    """Raw FIRMS CSV record - flexible to handle schema variations across sources."""
    latitude: float
    longitude: float
    bright_ti4: float
    scan: float
    track: float
    acq_date: str  # YYYY-MM-DD
    acq_time: int  # HHMM
    satellite: str
    confidence: str
    version: str
    bright_ti5: float
    frp: float
    daynight: str
    # Optional columns that vary by source
    instrument: Optional[str] = None
    type: Optional[int] = None

    @field_validator("confidence", mode="before")
    @classmethod
    def normalize_confidence(cls, v: str) -> str:
        v_lower = v.lower().strip()
        if v_lower in ("l", "low"):
            return "low"
        elif v_lower in ("n", "nominal"):
            return "nominal"
        elif v_lower in ("h", "high"):
            return "high"
        return v_lower

    @field_validator("daynight", mode="before")
    @classmethod
    def normalize_daynight(cls, v: str) -> str:
        v_upper = v.upper().strip()
        if v_upper in ("D", "DAY"):
            return "D"
        elif v_upper in ("N", "NIGHT"):
            return "N"
        return v_upper


class FireRecordHarmonized(BaseModel):
    """Harmonized fire record with derived fields, ready for feature engineering."""
    latitude: float
    longitude: float
    bright_ti4: float
    scan: float
    track: float
    acq_date: date
    acq_time: time
    satellite: Literal["N", "S", "A", "T"]
    instrument: Literal["VIIRS", "MODIS"]
    confidence: Literal["low", "nominal", "high"]
    version: str
    bright_ti5: float
    frp: float
    daynight: Literal["D", "N"]
    type: Optional[int] = None
    # Derived fields
    h3_cell_7: str
    h3_cell_8: str
    acquired_at: datetime

    @property
    def lat_lng(self) -> tuple[float, float]:
        return (self.latitude, self.longitude)


# Satellite to instrument mapping
SATELLITE_TO_INSTRUMENT = {
    "N": "VIIRS",  # NOAA-20 / Suomi-NPP
    "S": "VIIRS",  # Suomi-NPP
    "A": "MODIS",  # Aqua
    "T": "MODIS",  # Terra
}


def infer_instrument(satellite: str) -> Literal["VIIRS", "MODIS"]:
    """Infer instrument from satellite code."""
    return SATELLITE_TO_INSTRUMENT.get(satellite.upper(), "VIIRS")