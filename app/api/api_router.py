from fastapi import APIRouter

from app.api.endpoints import audit, classify

api_router = APIRouter()

# Canonical H3-day prediction routes (+ legacy classify aliases kept for compatibility)
api_router.include_router(classify.router, tags=["Classification & Predictions"])
# Audit trail remains available under /api/v1/audit/*
api_router.include_router(audit.router, tags=["NTRO Audit Trail"])
# Legacy ingest/spatial point-level routes removed from default router (pre-H3-day contract).
