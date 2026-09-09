from fastapi import APIRouter

from app.api.endpoints import archive, audit, classify, health

api_router = APIRouter()

# System health check under /api/v1/health
api_router.include_router(health.router, tags=["System Health"])
# Canonical H3-day prediction routes (+ legacy classify aliases kept for compatibility)
api_router.include_router(classify.router, tags=["Classification & Predictions"])
# Historical H3-day archive browsing + provenance under /api/v1/archive/*
api_router.include_router(archive.router, tags=["Archive & Historical"])
# Audit trail remains available under /api/v1/audit/*
api_router.include_router(audit.router, tags=["NTRO Audit Trail"])
# Legacy ingest/spatial point-level routes removed from default router (pre-H3-day contract).
