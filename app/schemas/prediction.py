"""Pydantic schemas for the PS26162 H3-day prediction API."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ClassProbability(BaseModel):
    class_name: str
    probability: float = Field(..., ge=0.0, le=1.0)


class FeatureAttribution(BaseModel):
    feature_name: str
    feature_value: str
    shap_value: float
    contribution: str
    description: str | None = None


class PredictionResponse(BaseModel):
    cell_id: str
    latitude: float
    longitude: float
    h3_index: str
    predicted_class: str
    probabilities: list[ClassProbability]
    confidence: float = Field(..., ge=0.0, le=1.0)
    calibrated: bool = True
    needs_review: bool = False
    caveat_flag: str | None = None
    latency_ms: float


class HotspotPredictionResponse(PredictionResponse):
    """Compatibility name for older classify route imports."""


class BatchPredictionResponse(BaseModel):
    total_predictions: int
    predictions: list[PredictionResponse]
    average_latency_ms: float


class ExplanationResponse(BaseModel):
    cell_id: str
    h3_index: str
    predicted_class: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    probabilities: list[ClassProbability]
    base_value: float
    feature_attributions: list[FeatureAttribution]
    top_features: list[str] = Field(default_factory=list)
    caveat_flag: str | None = None
    summary_statement: str
    latency_ms: float


class CellPredictionDetailResponse(PredictionResponse):
    feature_attributions: list[FeatureAttribution] = Field(default_factory=list)
    top_features: list[str] = Field(default_factory=list)
    context: dict[str, Any] = Field(default_factory=dict)


class ViewportPredictionsResponse(BaseModel):
    mode: str = Field(
        ...,
        description=(
            "Viewport rendering mode: 'detailed_hexagons' (bbox span <= 20 deg) or "
            "'aggregated_macro' (wide overview, bbox span > 20 deg). Note: H3 cells are always "
            "returned at native resolution 8; mode and zoom are informative metadata echoed "
            "from the query and do not downsample or coarse-aggregate geometries server-side."
        ),
    )
    zoom: float = Field(
        8.0,
        description="Echoed client viewport zoom level (informative/decorative; does not alter native H3 resolution).",
    )
    total_predictions: int
    predictions: list[PredictionResponse]


class HealthResponse(BaseModel):
    status: str
    database: str
    model_loaded: bool
    schema_version: str
    schema_hash: str
    model_path: str
    bundle_dir: str = ""
    calibrators_loaded: bool = False
    review_thresholds: dict[str, float] | None = None
    startup_latency_ms: float | None = None
    target_classes: list[str]

