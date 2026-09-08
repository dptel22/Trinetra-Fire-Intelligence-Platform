from fastapi import APIRouter

from app.schemas.prediction import HealthResponse
from app.services.model_service import model_service

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health_check():
    """
    v1 Health Check endpoint alias.
    Provides identical health contract to the root /health endpoint,
    including DuckDB connection, model status, and review thresholds.
    """
    return {"status": "healthy", "database": "connected", **model_service.health()}
