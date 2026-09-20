import logging
import logging.handlers
import os
import threading
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.api.api_router import api_router, require_feature_store
from app.api.endpoints.health import build_health_payload
from app.core.config import settings
from app.schemas.prediction import (
    CellPredictionDetailResponse,
    ExplanationResponse,
    HealthResponse,
    ViewportPredictionsResponse,
)
from app.services.feature_store import FeatureStoreUnavailableError, feature_store
from app.services.model_service import model_service

logger = logging.getLogger("uvicorn.startup")


def _route_ingestion_logs_into_uvicorn() -> None:
    """Mirror ingestion.* log records into uvicorn's handlers.

    uvicorn replaces the root logging config, so the startup-hook messages
    ("skipping, data current" vs "running background ingestion") would
    otherwise be invisible at boot. Pointing the ingestion loggers at the
    uvicorn.error handler keeps them on the console without double printing
    via the root logger.
    """
    uvicorn_handler = logging.getLogger("uvicorn.error").handlers[0] if logging.getLogger("uvicorn.error").handlers else None
    for name in ("ingestion", "uvicorn.startup"):
        lg = logging.getLogger(name)
        if uvicorn_handler is not None and uvicorn_handler not in lg.handlers:
            lg.handlers.append(uvicorn_handler)
        lg.propagate = False
        lg.setLevel(logging.INFO)


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
    _route_ingestion_logs_into_uvicorn()
    try:
        feature_store.load()
    except FeatureStoreUnavailableError as err:
        # Fresh clone without the serving parquets: boot degraded (fail-closed)
        # instead of crashing. /health reports it; data routes answer 503.
        logger.error("[STARTUP] Serving data store unavailable; booting in degraded mode. %s", err.detail)
    model_service.load_model()
    threading.Thread(target=_background_ingestion, name="firms-ingestion", daemon=True).start()
    yield
    print("[SHUTDOWN] Shutting down NASA FIRMS Geospatial AI Backend.")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="NASA FIRMS thermal hotspot classification and geospatial intelligence platform (SIH 2026, PS26162).",
    lifespan=lifespan
)

# Enable CORS for Deck.gl / WebGL Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOW_ORIGINS,
    allow_origin_regex=settings.CORS_ALLOW_ORIGIN_REGEX,
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
    return build_health_payload()

@app.get("/predictions", response_model=ViewportPredictionsResponse, dependencies=[Depends(require_feature_store)])
def get_predictions_root(
    min_lat: float = Query(..., ge=-90.0, le=90.0),
    max_lat: float = Query(..., ge=-90.0, le=90.0),
    min_lon: float = Query(..., ge=-180.0, le=180.0),
    max_lon: float = Query(..., ge=-180.0, le=180.0),
    acq_date: str = Query(...),
    zoom: float = Query(8.0, ge=1.0, le=20.0),
):
    return model_service.get_viewport_predictions(min_lat, max_lat, min_lon, max_lon, acq_date, zoom)

def _map_cell_lookup_error(err: ValueError) -> HTTPException:
    """Same contract as the v1 handlers (classify.py): an unknown H3-day cell
    must surface as 404, not 500, on every path style."""
    status = 404 if "No H3-day features found" in str(err) else 400
    return HTTPException(status_code=status, detail=str(err))


@app.get("/predictions/{cell_id}/explain", response_model=ExplanationResponse, dependencies=[Depends(require_feature_store)])
def get_prediction_cell_explanation_root(cell_id: str, acq_date: str = Query(...)):
    try:
        detail = model_service.get_cell_detail(cell_id, acq_date)
        return model_service.explain(detail.context)
    except HTTPException:
        raise
    except ValueError as ve:
        raise _map_cell_lookup_error(ve)
    except Exception:
        raise HTTPException(status_code=500, detail="Cell explanation failed due to an internal server error.")

@app.get("/predictions/{cell_id}", response_model=CellPredictionDetailResponse, dependencies=[Depends(require_feature_store)])
def get_prediction_cell_detail_root(cell_id: str, acq_date: str = Query(...)):
    try:
        return model_service.get_cell_detail(cell_id, acq_date)
    except HTTPException:
        raise
    except ValueError as ve:
        raise _map_cell_lookup_error(ve)
    except Exception:
        raise HTTPException(status_code=500, detail="Cell detail query failed due to an internal server error.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
