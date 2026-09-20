from fastapi import APIRouter, Depends

from app.api.endpoints import alerts, archive, audit, classify, evidence, health, timeline
from app.services.feature_store import feature_store


def require_feature_store() -> None:
    """Fail closed with HTTP 503 when the serving data store is not loaded.

    Re-attempts ``load()`` on every request, so a degraded boot (fresh clone,
    parquets not fetched yet) recovers as soon as the data appears.
    """
    feature_store.load()


api_router = APIRouter()
_needs_store = [Depends(require_feature_store)]

# System health check under /api/v1/health
api_router.include_router(health.router, tags=["System Health"])
# Canonical H3-day prediction routes (+ legacy classify aliases kept for compatibility)
api_router.include_router(classify.router, tags=["Classification & Predictions"], dependencies=_needs_store)
# Historical H3-day archive browsing + provenance under /api/v1/archive/*
api_router.include_router(archive.router, tags=["Archive & Historical"], dependencies=_needs_store)
# Raw FIRMS evidence + ingestion run manifests under /api/v1/archive/*
api_router.include_router(evidence.router, tags=["Raw Evidence & Run Manifests"])
# Materialized timeline layers are independent of the DuckDB store; only the opt-in
# fallback path reads it (and re-raises FeatureStoreUnavailableError as 503).
api_router.include_router(timeline.router, tags=["Historical FIRMS Timeline"])
# Alert lifecycle (analyst review actions) under /api/v1/alerts/*
api_router.include_router(alerts.router, tags=["Alert Lifecycle"], dependencies=_needs_store)
# Audit trail remains available under /api/v1/audit/*
api_router.include_router(audit.router, tags=["NTRO Audit Trail"])
# Legacy ingest/spatial point-level routes removed from default router (pre-H3-day contract).
