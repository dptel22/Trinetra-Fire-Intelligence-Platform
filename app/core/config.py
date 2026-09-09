"""Runtime configuration for the PS26162 backend contract."""

from __future__ import annotations

import os
from pathlib import Path
from typing import ClassVar

_BASE_DIR = Path(__file__).resolve().parent.parent.parent
_DATA_DIR = _BASE_DIR / "data"

TARGET_CLASSES = ["industrial", "mining", "agricultural_burn", "wildfire"]
CAT_FEATURES = ["h3_08", "daynight"]

MODEL_FEATURES = [
    "h3_08",
    "frp_max",
    "frp_mean",
    "n_detections",
    "ti4_max",
    "is_saturated_max",
    "scan_mean",
    "track_mean",
    "confidence_high_any",
    "pct_high_confidence",
    "frp_max_night",
    "frp_max_day",
    "n_detections_night",
    "n_detections_day",
    "scan_max",
    "track_max",
    "daynight",
    "satellite_nunique",
    "frp_max_lag7",
    "active_days_7d",
    "frp_max_lag30",
    "active_days_30d",
    "active_days_90d",
    "acq_month",
    "doy_sin",
    "doy_cos",
    "is_first_observation",
    "dist_wri_solar_km",
    "n_wri_solar_10km",
    "dist_wri_coal_km",
    "n_wri_coal_10km",
    "dist_wri_wind_km",
    "n_wri_wind_10km",
    "dist_wri_gas_km",
    "n_wri_gas_10km",
    "dist_wri_hydro_km",
    "n_wri_hydro_10km",
    "dist_wri_biomass_km",
    "n_wri_biomass_10km",
    "dist_wri_oil_km",
    "n_wri_oil_10km",
    "dist_wri_nuclear_km",
    "n_wri_nuclear_10km",
    "dist_osm_industrial_km",
    "n_osm_industrial_5km",
    "dist_osm_quarry_km",
    "n_osm_quarry_5km",
    "dist_osm_farmland_km",
    "n_osm_farmland_5km",
    "dist_osm_mineshaft_km",
    "n_osm_mineshaft_5km",
    "dist_osm_adit_km",
    "n_osm_adit_5km",
    "dist_osm_power_infra_km",
    "n_osm_power_infra_5km",
]

H3_DAILY_FEATURES = [
    "h3_08",
    "acq_date",
    "frp_max",
    "frp_mean",
    "n_detections",
    "ti4_max",
    "is_saturated_max",
    "scan_mean",
    "track_mean",
    "confidence_high_any",
    "pct_high_confidence",
    "frp_max_night",
    "frp_max_day",
    "n_detections_night",
    "n_detections_day",
    "scan_max",
    "track_max",
    "daynight",
    "satellite_nunique",
    "frp_max_lag7",
    "active_days_7d",
    "frp_max_lag30",
    "active_days_30d",
    "active_days_90d",
    "acq_month",
    "doy_sin",
    "doy_cos",
    "is_first_observation",
]


class Settings:
    PROJECT_NAME = "NASA FIRMS Hotspot Geospatial AI Platform"
    VERSION = "2.0.0"
    API_PREFIX = "/predictions"
    API_V1_STR = "/api/v1"
    DATA_DIR = _DATA_DIR
    DUCKDB_PATH = os.environ.get("DUCKDB_PATH", str(_DATA_DIR / "feature_store.duckdb"))
    AUDIT_DB_PATH = os.environ.get("AUDIT_DB_PATH", str(_DATA_DIR / "audit_log.duckdb"))
    INGESTION_DB_PATH = os.environ.get("INGESTION_DB_PATH", str(_DATA_DIR / "ingestion.duckdb"))
    INFERENCE_BUNDLE_DIR = os.environ.get(
        "INFERENCE_BUNDLE_DIR",
        str(_BASE_DIR / "models" / "PS26162_catboost_final" / "inference_bundle"),
    )
    MODEL_PATH = os.environ.get(
        "MODEL_PATH",
        str(Path(INFERENCE_BUNDLE_DIR) / "catboost_hotspot_classifier.cbm"),
    )
    H3_DAILY_PARQUET = os.environ.get(
        "H3_DAILY_PARQUET",
        str(_DATA_DIR / "processed" / "sih2026_h3_daily_features_firms.parquet"),
    )
    OSMWRI_PARQUET = os.environ.get(
        "OSMWRI_PARQUET",
        str(_DATA_DIR / "processed" / "sih2026_h3_daily_features_with_osm_wri.parquet"),
    )
    CAVEAT_MANIFEST: ClassVar[dict[str, str]] = {
        "pseudo_label_circularity": "Labels derive partly from FIRMS/OSM/WRI features, so metrics are not independent ground truth.",
        "satellite_nunique_only": "Only satellite count is modeled, not satellite identity.",
        "mining_low_support": "Mining has lower labeled support and should be read cautiously.",
        "low_confidence_review": "Calibrated confidence is below the per-class review threshold; treat as provisional.",
        "outside_training_geography": "Outside validated training geography — analyst review required.",
    }
    # States the model was trained/evaluated on (bundle model_metadata.json
    # overrides at load time). Used only for provenance labeling — never to
    # exclude rows from serving.
    TRAINING_GEOGRAPHY_STATES: ClassVar[set[str]] = {
        "Maharashtra",
        "Karnataka",
        "Madhya Pradesh",
        "Punjab",
        "Andhra Pradesh",
        "Telangana",
        "Gujarat",
        "Tamil Nadu",
        "Jharkhand",
        "Rajasthan",
    }
    H3_RESOLUTION = int(os.environ.get("H3_RESOLUTION", "8"))
    UNCLASSIFIED_THRESHOLD: float | None = (
        float(os.environ["UNCLASSIFIED_THRESHOLD"])
        if os.environ.get("UNCLASSIFIED_THRESHOLD") not in (None, "")
        else None
    )
    FEATURE_SCHEMA_VERSION = "v3-h3-day-catboost"
    INGEST_MAX_BATCH_SIZE = 5000
    _DEFAULT_CORS_ORIGINS: ClassVar[list[str]] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    @property
    def CORS_ALLOW_ORIGINS(self) -> list[str]:
        raw = os.environ.get("CORS_ALLOW_ORIGINS")
        if raw:
            parsed = [origin.strip() for origin in raw.split(",") if origin.strip()]
            if parsed:
                return parsed
        return list(self._DEFAULT_CORS_ORIGINS)
    TARGET_CLASSES: ClassVar[list[str]] = TARGET_CLASSES
    CAT_FEATURES: ClassVar[list[str]] = CAT_FEATURES
    MODEL_FEATURES: ClassVar[list[str]] = MODEL_FEATURES
    H3_DAILY_FEATURES: ClassVar[list[str]] = H3_DAILY_FEATURES


settings = Settings()
