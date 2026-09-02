import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

class Settings:
    PROJECT_NAME: str = "NASA FIRMS Hotspot Geospatial AI Platform"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Storage Paths
    DATA_DIR: Path = BASE_DIR / "data"
    DUCKDB_PATH: str = str(DATA_DIR / "feature_store.duckdb")
    MODEL_PATH: str = str(DATA_DIR / "catboost_hotspot_model.cbm")
    AUDIT_DB_PATH: str = str(DATA_DIR / "audit_log.duckdb")
    INGESTION_DB_PATH: str = str(DATA_DIR / "ingestion.duckdb")
    
    # Spatial Config
    H3_RESOLUTION: int = 7  # Project-locked default (~1.2 km² cell)
    
    # Class Definitions are intentionally configurable while labeling policy evolves.
    DEFAULT_TRAINED_CLASSES: list = [
        "industrial",
        "mining",
        "agricultural_burn",
        "wildfire",
    ]
    TARGET_CLASSES: list = DEFAULT_TRAINED_CLASSES
    UNCLASSIFIED_THRESHOLD: float | None = None
    FEATURE_SCHEMA_VERSION: str = "v1-point-prototype"
    
    # CatBoost Categorical Feature Definitions
    CAT_FEATURES: list = ["h3_index", "satellite", "daynight", "confidence", "landuse_tag"]
    
    # Numerical Feature Definitions
    NUM_FEATURES: list = [
        "bright_ti4",
        "bright_ti5",
        "scan",
        "track",
        "frp",
        "persistence_90d_norm",
        "distance_to_water_km",
        "distance_to_road_km",
        "canopy_cover_pct",
        "is_static_source",
    ]
    INGEST_MAX_BATCH_SIZE: int = 5000
    CORS_ALLOW_ORIGINS: list = ["http://localhost:3000", "http://127.0.0.1:3000"]

settings = Settings()

# Ensure data directory exists
os.makedirs(settings.DATA_DIR, exist_ok=True)
