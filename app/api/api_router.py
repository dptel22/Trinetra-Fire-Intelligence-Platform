from fastapi import APIRouter
from app.api.endpoints import classify, ingest, spatial, audit

api_router = APIRouter()

api_router.include_router(classify.router, tags=["Classification & SHAP"])
api_router.include_router(ingest.router, tags=["Ingestion Gateway & DLQ"])
api_router.include_router(spatial.router, tags=["Spatial & Viewport"])
api_router.include_router(audit.router, tags=["NTRO Audit Trail"])
