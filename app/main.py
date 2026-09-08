import logging
import os
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from app.api.api_router import api_router
from app.core.config import settings
from app.schemas.prediction import (
    CellPredictionDetailResponse,
    ExplanationResponse,
    HealthResponse,
    ViewportPredictionsResponse,
)
from app.services.feature_store import feature_store
from app.services.model_service import model_service

logger = logging.getLogger("uvicorn.startup")


def _background_ingestion() -> None:
    """Boot-time freshness check + ingestion, deliberately OFF the hot path.

    The freshness check itself is a millisecond JSON read and happens inline;
    the (potentially slow) FIRMS pull runs in this daemon thread so a demo
    restart never waits on NASA. On success the feature store is reloaded
    atomically; on failure the backend keeps serving the last good parquets.
    Disable with INGESTION_ON_STARTUP=0.
    """
    if os.environ.get("INGESTION_ON_STARTUP", "1") != "1":
        return
    try:
        from ingestion.run_ingestion import ensure_fresh_for_backend

        stats = ensure_fresh_for_backend()
        if stats is not None:
            logger.info("[STARTUP] Background ingestion refreshed serving data: %s rows", stats.get("final_daily_rows"))
    except Exception as err:  # noqa: BLE001 — stale data must never kill the API
        logger.warning("[STARTUP] Background ingestion failed; serving existing data. (%s)", err)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"[STARTUP] Initializing {settings.PROJECT_NAME} (v{settings.VERSION})...")
    feature_store.load()
    model_service.load_model()
    threading.Thread(target=_background_ingestion, name="firms-ingestion", daemon=True).start()
    yield
    print("[SHUTDOWN] Shutting down NASA FIRMS Geospatial AI Backend.")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="NTRO-Compliant NASA FIRMS Hotspot Classification and Defense-Grade Geospatial AI Platform.",
    lifespan=lifespan
)

# Enable CORS for Deck.gl / WebGL Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
def root():
    return {
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "online",
        "docs_url": "/docs",
        "model_loaded": model_service.is_loaded,
        "target_classes": settings.TARGET_CLASSES
    }

@app.get("/health", response_model=HealthResponse)
def health_check():
    return {"status": "healthy", "database": "connected", **model_service.health()}

@app.get("/predictions", response_model=ViewportPredictionsResponse)
def get_predictions_root(
    min_lat: float = Query(..., ge=-90.0, le=90.0),
    max_lat: float = Query(..., ge=-90.0, le=90.0),
    min_lon: float = Query(..., ge=-180.0, le=180.0),
    max_lon: float = Query(..., ge=-180.0, le=180.0),
    acq_date: str = Query(...),
    zoom: float = Query(8.0, ge=1.0, le=20.0),
):
    return model_service.get_viewport_predictions(min_lat, max_lat, min_lon, max_lon, acq_date, zoom)

@app.get("/predictions/{cell_id}/explain", response_model=ExplanationResponse)
def get_prediction_cell_explanation_root(cell_id: str, acq_date: str = Query(...)):
    detail = model_service.get_cell_detail(cell_id, acq_date)
    return model_service.explain(detail.context)

@app.get("/predictions/{cell_id}", response_model=CellPredictionDetailResponse)
def get_prediction_cell_detail_root(cell_id: str, acq_date: str = Query(...)):
    return model_service.get_cell_detail(cell_id, acq_date)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
