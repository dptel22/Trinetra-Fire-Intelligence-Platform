from fastapi import APIRouter, HTTPException
from typing import List
from app.schemas.firms import FIRMSRecord
from app.schemas.prediction import HotspotPredictionResponse, BatchPredictionResponse, ExplanationResponse
from app.services.model_service import model_service
import numpy as np

router = APIRouter()

@router.post("/classify", response_model=HotspotPredictionResponse)
def classify_hotspot(record: FIRMSRecord):
    """
    Sub-50ms real-time classification of NASA FIRMS thermal anomaly
    into 6 distinct NTRO classes using CatBoost + DuckDB H3 context.
    """
    try:
        payload = record.model_dump()
        return model_service.predict_single(payload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference failed: {str(e)}")

@router.post("/classify/batch", response_model=BatchPredictionResponse)
def classify_batch(records: List[FIRMSRecord]):
    """Batch classification for multi-hotspot ingestion."""
    results = []
    latencies = []
    for rec in records:
        pred = model_service.predict_single(rec.model_dump())
        results.append(pred)
        latencies.append(pred.latency_ms)

    avg_lat = round(float(np.mean(latencies)), 2) if latencies else 0.0
    return BatchPredictionResponse(
        total_predictions=len(results),
        predictions=results,
        average_latency_ms=avg_lat
    )

@router.post("/explain", response_model=ExplanationResponse)
def explain_hotspot(record: FIRMSRecord):
    """
    On-Demand Defense-Grade SHAP TreeExplainer Local Attribution.
    Computes exact game-theoretic feature contributions for analyst auditing.
    """
    try:
        payload = record.model_dump()
        return model_service.explain_single(payload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Explainability computation failed: {str(e)}")
