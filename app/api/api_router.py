from fastapi import APIRouter

from app.api.endpoints import alerts, archive, audit, classify, evidence, health, timeline

api_router = APIRouter()

# System health check under /api/v1/health
api_router.include_router(health.router, tags=["System Health"])
# Canonical H3-day prediction routes (+ legacy classify aliases kept for compatibility)
api_router.include_router(classify.router, tags=["Classification & Predictions"])
# Historical H3-day archive browsing + provenance under /api/v1/archive/*
api_router.include_router(archive.router, tags=["Archive & Historical"])
# Raw FIRMS evidence + ingestion run manifests under /api/v1/archive/*
api_router.include_router(evidence.router, tags=["Raw Evidence & Run Manifests"])
api_router.include_router(timeline.router, tags=["Historical FIRMS Timeline"])
# Alert lifecycle (analyst review actions) under /api/v1/alerts/*
api_router.include_router(alerts.router, tags=["Alert Lifecycle"])
# Audit trail remains available under /api/v1/audit/*
api_router.include_router(audit.router, tags=["NTRO Audit Trail"])
# Legacy ingest/spatial point-level routes removed from default router (pre-H3-day contract).
