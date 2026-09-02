from pydantic import BaseModel, Field
from typing import Dict, List, Optional

class FeatureAttribution(BaseModel):
    feature_name: str
    feature_value: str
    shap_value: float
    contribution: str  # "Increases Risk" or "Decreases Risk"

class ClassProbability(BaseModel):
    class_name: str
    probability: float

class HotspotPredictionResponse(BaseModel):
    hotspot_id: str
    latitude: float
    longitude: float
    h3_index: str
    predicted_class: str
    confidence: float
    probabilities: List[ClassProbability]
    latency_ms: float
    context: Dict[str, Optional[float | str]] = Field(default_factory=dict)

class BatchPredictionResponse(BaseModel):
    total_predictions: int
    predictions: List[HotspotPredictionResponse]
    average_latency_ms: float

class ExplanationResponse(BaseModel):
    hotspot_id: str
    predicted_class: str
    base_value: float
    feature_attributions: List[FeatureAttribution]
    summary_statement: str
