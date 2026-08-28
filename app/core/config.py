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
    
    # Spatial Config
    H3_RESOLUTION: int = 8  # Standard H3 hex resolution (~0.7 km2 area)
    
    # Class Definitions (6 distinct NTRO classes)
    TARGET_CLASSES: list = [
        "Wildfire",
        "Agricultural Burn",
        "Industrial/Gas Flare",
        "Mining Activity",
        "Urban/Infrastructure",
        "False Positive/Noise"
    ]
    
    # CatBoost Categorical Feature Definitions
    CAT_FEATURES: list = ["h3_index", "satellite", "daynight", "landuse_tag"]
    
    # Numerical Feature Definitions
    NUM_FEATURES: list = [
        "brightness",
        "scan",
        "track",
        "frp",
        "bright_t31",
        "confidence",
        "persistence_90d_norm",
        "distance_to_water_km",
        "distance_to_road_km",
        "canopy_cover_pct",
        "is_static_source"
    ]

settings = Settings()

# Ensure data directory exists
os.makedirs(settings.DATA_DIR, exist_ok=True)
