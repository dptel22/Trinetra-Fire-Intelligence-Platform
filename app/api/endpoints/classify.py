import logging

import numpy as np
from fastapi import APIRouter, HTTPException, Query

from app.schemas.firms import FIRMSRecord
from app.schemas.prediction import (
    BatchPredictionResponse,
    CellPredictionDetailResponse,
    ExplanationResponse,
    PredictionResponse,
    ViewportPredictionsResponse,
)
from app.services.model_service import model_service

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/classify", response_model=PredictionResponse)
def classify_hotspot(record: FIRMSRecord):
    """
    Sub-50ms real-time classification of NASA FIRMS thermal anomaly
    into the configured NTRO target classes using CatBoost + DuckDB H3 context.
    """
    try:
        payload = record.model_dump()
        return model_service.predict_single(payload)
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception:
        logger.exception("Inference failed")
        raise HTTPException(status_code=500, detail="Inference failed due to an internal server error.")

@router.post("/classify/batch", response_model=BatchPredictionResponse)
def classify_batch(records: list[FIRMSRecord]):
    """Batch classification for multi-hotspot ingestion."""
    try:
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
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception:
        logger.exception("Batch classification failed")
        raise HTTPException(status_code=500, detail="Batch classification failed due to an internal server error.")

@router.post("/explain", response_model=ExplanationResponse)
def explain_hotspot(record: FIRMSRecord):
    """
    On-Demand Defense-Grade SHAP TreeExplainer Local Attribution.
    Computes exact game-theoretic feature contributions for analyst auditing.
    """
    try:
        payload = record.model_dump()
        return model_service.explain_single(payload)
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception:
        logger.exception("Explainability computation failed")
        raise HTTPException(status_code=500, detail="Explainability computation failed due to an internal server error.")

@router.get("/predictions", response_model=ViewportPredictionsResponse)
def get_viewport_predictions(
    min_lat: float = Query(..., ge=-90.0, le=90.0),
    max_lat: float = Query(..., ge=-90.0, le=90.0),
    min_lon: float = Query(..., ge=-180.0, le=180.0),
    max_lon: float = Query(..., ge=-180.0, le=180.0),
    acq_date: str = Query(...),
    zoom: float = Query(8.0, ge=1.0, le=20.0),
):
    """
    Viewport-Culling spatial predictions query for frontend live-map rendering.
    """
    try:
        return model_service.get_viewport_predictions(min_lat, max_lat, min_lon, max_lon, acq_date, zoom)
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception:
        logger.exception("Viewport prediction failed")
        raise HTTPException(status_code=500, detail="Viewport prediction failed due to an internal server error.")


@router.get("/predictions/{cell_id}/explain", response_model=ExplanationResponse)
def get_prediction_cell_explanation(cell_id: str, acq_date: str = Query(...)):
    """
    Single-cell on-demand SHAP explanation.
    """
    try:
        cell = model_service.get_cell_detail(cell_id, acq_date)
        return model_service.explain(cell.context)
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=404 if "No H3-day features found" in str(ve) else 400, detail=str(ve))
    except Exception:
        logger.exception("Cell explanation failed")
        raise HTTPException(status_code=500, detail="Cell explanation failed due to an internal server error.")


@router.get("/predictions/{cell_id}", response_model=CellPredictionDetailResponse)
def get_prediction_cell_detail(cell_id: str, acq_date: str = Query(...)):
    """
    Single-cell prediction detail query for frontend side panel inspection.
    """
    try:
        return model_service.get_cell_detail(cell_id, acq_date)
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=404 if "No H3-day features found" in str(ve) else 400, detail=str(ve))
    except Exception:
        logger.exception("Cell detail query failed")
        raise HTTPException(status_code=500, detail="Cell detail query failed due to an internal server error.")
