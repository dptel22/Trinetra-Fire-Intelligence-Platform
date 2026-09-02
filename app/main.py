import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.api_router import api_router
from app.services.model_service import model_service

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure DuckDB feature store and CatBoost model are loaded
    print(f"[STARTUP] Initializing {settings.PROJECT_NAME} (v{settings.VERSION})...")
    if not model_service.is_loaded:
        print("[WARNING] CatBoost model not found at startup. Running automatic pipeline training...")
        try:
            from pipeline.train_catboost import train_model
            train_model()
            model_service._load_model()
        except Exception as e:
            print(f"Model auto-train error: {e}")
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

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "model_ready": model_service.is_loaded,
        "database": "connected"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
