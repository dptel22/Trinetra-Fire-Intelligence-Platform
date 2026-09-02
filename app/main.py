from contextlib import asynccontextmanager
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.api_router import api_router
from app.services.model_service import model_service
from app.services.feature_store import feature_store
from app.schemas.prediction import CellPredictionDetailResponse, ExplanationResponse, HealthResponse, ViewportPredictionsResponse

@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"[STARTUP] Initializing {settings.PROJECT_NAME} (v{settings.VERSION})...")
    feature_store.load()
    model_service.load_model()
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
