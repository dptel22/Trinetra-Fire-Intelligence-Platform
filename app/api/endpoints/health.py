from typing import Any

from fastapi import APIRouter

from app.schemas.prediction import HealthResponse
from app.services.feature_store import feature_store
from app.services.model_service import model_service

router = APIRouter()


def build_health_payload() -> dict[str, Any]:
    """Health contract shared by ``/health`` and ``/api/v1/health``.

    ``status`` is ``healthy`` only when the model AND the serving data store are
    loaded; otherwise ``degraded`` (HTTP 200, so orchestrators still reach the
    container) with ``database`` = ``unavailable`` and the reason in
    ``database_detail``. It never reports a store it does not have.
    """
    from ingestion.run_ingestion import ingestion_provenance

    store_ok = feature_store.loaded
    return {
        "status": "healthy" if (store_ok and model_service.is_loaded) else "degraded",
        "database": "connected" if store_ok else "unavailable",
        "database_detail": None if store_ok else feature_store.load_error,
        **model_service.health(),
        "ingestion": ingestion_provenance(),
    }


@router.get("/health", response_model=HealthResponse)
def health_check():
    """
    v1 Health Check endpoint alias.
    Provides identical health contract to the root /health endpoint,
    including DuckDB connection, model status, review thresholds, and the
    ingestion data-quality/provenance block.
    """
    return build_health_payload()
