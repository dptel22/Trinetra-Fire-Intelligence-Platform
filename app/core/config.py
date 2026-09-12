"""Runtime configuration for the PS26162 backend contract."""

from __future__ import annotations

import os
from pathlib import Path
from typing import ClassVar

_BASE_DIR = Path(__file__).resolve().parent.parent.parent
_DATA_DIR = _BASE_DIR / "data"


def _load_dotenv(path: Path) -> None:
    """Populate os.environ from a .env file without overriding existing vars.

    Real environment variables (Docker `environment:`, CI, shell exports)
    always win over the file, so deployment overrides keep working. The repo
    has no python-dotenv dependency; this covers the flat KEY=VALUE subset.
    """
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        # Strip one matched pair of surrounding quotes only, so a value that
        # legitimately ends in a quote character survives intact.
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("\"", "'"):
            value = value[1:-1]
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv(_BASE_DIR / ".env")

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
    RAW_ARCHIVE_DIR = os.environ.get("RAW_ARCHIVE_DIR", str(_DATA_DIR / "archive" / "firms"))
    TIMELINE_DIR = os.environ.get("TIMELINE_DIR", str(_DATA_DIR / "processed" / "timeline"))
    # Name of the sidecar manifest written next to the materialized timeline
    # layers. It records materialized_at/version/date-range so the serving layer
    # can prove freshness instead of guessing from file mtimes.
    TIMELINE_MANIFEST_FILE = "materialization_manifest.json"
    # Provenance version stamped into the manifest whenever the timeline layers
    # are (re)materialized. Bump when the materialization logic changes shape.
    TIMELINE_MATERIALIZATION_VERSION = os.environ.get(
        "TIMELINE_MATERIALIZATION_VERSION", "timeline_v1"
    )
    # Staleness thresholds (in hours) per materialized layer. A layer is "stale"
    # when its manifest ``materialized_at`` is older than the threshold for the
    # requested granularity, which fails the request closed (HTTP 503) unless
    # TIMELINE_ALLOW_FALLBACK=1 is explicitly set.
    #
    # DAILY is intentionally TIGHT: 48h = 2x the daily FIRMS NRT pull (day_range
    # 1-5, nominal 1 run/day), so exactly one missed ingestion cycle is tolerated
    # before we fail loud. This is deliberate — week-old evidence must NEVER be
    # served as "current". Do NOT raise this number to paper over a broken
    # ingestion job; fix the job instead.
    #
    # MONTHLY/YEARLY are rollups that re-aggregate far less often than raw
    # ingestion, so they get progressively looser placeholder windows (weekly /
    # ~monthly) to avoid false-stale 503s on the aggregate layers. Retune these
    # against the real rollup cadence once a scheduled job exists.
    _TIMELINE_MAX_AGE_DEFAULTS: ClassVar[dict[str, float]] = {
        "day": 48.0,
        "month": 168.0,
        "year": 744.0,
    }
    _TIMELINE_MAX_AGE_ENV: ClassVar[dict[str, str]] = {
        "day": "TIMELINE_MAX_AGE_HOURS_DAILY",
        "month": "TIMELINE_MAX_AGE_HOURS_MONTHLY",
        "year": "TIMELINE_MAX_AGE_HOURS_YEARLY",
    }

    def timeline_max_age_hours(self, granularity: str) -> float:
        """Staleness threshold (hours) for the layer backing this granularity."""
        default = self._TIMELINE_MAX_AGE_DEFAULTS.get(granularity, 48.0)
        raw = os.environ.get(self._TIMELINE_MAX_AGE_ENV.get(granularity, ""))
        if raw in (None, ""):
            return default
        try:
            return float(raw)
        except ValueError:
            return default

    def timeline_allow_fallback(self) -> bool:
        """True only when TIMELINE_ALLOW_FALLBACK is explicitly enabled.

        Defaults to OFF everywhere (prod, tests, Docker). The raw h3_daily
        fallback is a development escape hatch, never a silent production path.
        """
        raw = os.environ.get("TIMELINE_ALLOW_FALLBACK", "0")
        return str(raw).strip().lower() in {"1", "true", "yes", "on"}

    def timeline_seasonal_gate_override(self) -> bool:
        """True only when TIMELINE_SEASONAL_GATE_OVERRIDE is explicitly enabled.

        Fail-closed escape hatch for the Sep-Dec seasonal comparability gate in
        pipeline.timeline_validation. Using it REQUIRES an AGENT_LOG entry
        justifying the override; the validation report records it either way.
        """
        raw = os.environ.get("TIMELINE_SEASONAL_GATE_OVERRIDE", "0")
        return str(raw).strip().lower() in {"1", "true", "yes", "on"}

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
    # Vite falls back to 5174, 5175, ... whenever 5173 is already taken, so a
    # port-pinned allowlist silently breaks the dev origin. Any localhost dev
    # port is allowed; production must override via CORS_ALLOW_ORIGINS.
    _DEFAULT_CORS_ORIGIN_REGEX: ClassVar[str] = r"^http://(localhost|127\.0\.0\.1):\d+$"

    @property
    def CORS_ALLOW_ORIGINS(self) -> list[str]:
        raw = os.environ.get("CORS_ALLOW_ORIGINS")
        if raw:
            parsed = [origin.strip() for origin in raw.split(",") if origin.strip()]
            if parsed:
                return parsed
        return list(self._DEFAULT_CORS_ORIGINS)

    @property
    def CORS_ALLOW_ORIGIN_REGEX(self) -> str | None:
        raw = os.environ.get("CORS_ALLOW_ORIGIN_REGEX")
        if raw is not None:
            return raw or None
        if os.environ.get("CORS_ALLOW_ORIGINS"):
            # Explicit production origins were provided: no dev-port wildcard.
            return None
        return self._DEFAULT_CORS_ORIGIN_REGEX

    TARGET_CLASSES: ClassVar[list[str]] = TARGET_CLASSES
    CAT_FEATURES: ClassVar[list[str]] = CAT_FEATURES
    MODEL_FEATURES: ClassVar[list[str]] = MODEL_FEATURES
    H3_DAILY_FEATURES: ClassVar[list[str]] = H3_DAILY_FEATURES


settings = Settings()
