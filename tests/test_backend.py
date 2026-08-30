import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings
from pipeline.feature_engineering import engineer_features, latlng_to_h3
from pipeline.spatial_cv import SpatialKFold
import pandas as pd
import numpy as np

client = TestClient(app)

# ---------------------------------------------------------------------------
# Canonical four-class taxonomy (locked per docs/decisions)
# ---------------------------------------------------------------------------
EXPECTED_CLASSES = ["agricultural_burn", "industrial", "mining", "wildfire"]

# ---------------------------------------------------------------------------
# Canonical VIIRS sample payload (uses real VIIRS field names from EDA)
# ---------------------------------------------------------------------------
SAMPLE_VIIRS_PAYLOAD = {
    "hotspot_id": "FIRMS-TEST-001",
    "latitude": 22.05,
    "longitude": 79.12,
    "bright_ti4": 360.5,        # VIIRS I4 channel (K)
    "bright_ti5": 310.0,        # VIIRS I5 channel (K)
    "scan": 0.4,
    "track": 0.4,
    "acq_date": "2026-08-20",
    "acq_time": "1345",
    "satellite": "N",           # N = NOAA-20 (harmonized)
    "confidence": "high",       # String enum: low | nominal | high
    "frp": 85.5,
    "daynight": "D",
    "persistence_90d": 3,
    "observed_days_in_90d": 85
}


def test_h3_indexing():
    """H3 index generation at resolution 7 (project-locked default)."""
    h3_idx = latlng_to_h3(22.0, 79.0, resolution=settings.H3_RESOLUTION)
    assert isinstance(h3_idx, str)
    assert len(h3_idx) > 5
    assert settings.H3_RESOLUTION == 7, "H3 resolution must be 7 (project-locked)"


def test_feature_engineering_persistence_normalization():
    """
    Persistence normalization divides by observed days (not fixed 90).
    Validates missing-day gap handling per docs/eda-findings.md.
    """
    df = pd.DataFrame([{
        "latitude": 22.0,
        "longitude": 79.0,
        "persistence_90d": 18,
        "observed_days_in_90d": 79,       # 11 missing days
        "satellite": "N",
        "daynight": "D",
        "confidence": "nominal",           # String confidence
        "bright_ti4": 340.0,
        "bright_ti5": 295.0,
    }])
    feat_df = engineer_features(df)

    assert "persistence_90d_norm" in feat_df.columns
    expected_norm = 18.0 / 79.0
    assert abs(feat_df["persistence_90d_norm"].iloc[0] - expected_norm) < 1e-4

    # Confirm string categoricals remain strings (no label encoding)
    assert isinstance(feat_df["h3_index"].iloc[0], str)
    assert isinstance(feat_df["confidence"].iloc[0], str)
    assert feat_df["confidence"].iloc[0] == "nominal"


def test_spatial_cross_validation_split():
    """SpatialKFold creates geographically disjoint folds with no index overlap."""
    coords = np.array([
        [22.0, 79.0], [22.1, 79.1], [22.05, 79.05],
        [30.5, 75.8], [30.6, 75.9],
        [22.3, 73.2], [22.4, 73.3],
        [21.8, 85.3], [21.9, 85.4]
    ])
    X = np.zeros((len(coords), 5))
    skf = SpatialKFold(n_splits=3, min_distance_km=10.0, random_state=42)
    splits = list(skf.split(X, coords))
    assert len(splits) == 3
    for train_idx, val_idx in splits:
        assert len(set(train_idx).intersection(set(val_idx))) == 0


def test_api_root_and_health():
    """Root endpoint returns correct 4-class taxonomy."""
    res = client.get("/")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "online"
    # Must be exactly 4 trained classes — NOT 5 or 6
    assert len(data["target_classes"]) == 4
    for cls in EXPECTED_CLASSES:
        assert cls in data["target_classes"], f"Expected class '{cls}' missing from API response"


def test_classify_and_explain_endpoints():
    """
    /classify returns a valid 4-class prediction with VIIRS schema payload.
    /explain returns SHAP attributions.
    """
    # 1. Classify
    res = client.post("/api/v1/classify", json=SAMPLE_VIIRS_PAYLOAD)
    assert res.status_code == 200
    pred = res.json()

    assert "predicted_class" in pred
    assert pred["predicted_class"] in EXPECTED_CLASSES, \
        f"Predicted class '{pred['predicted_class']}' not in 4-class taxonomy"
    assert pred["latency_ms"] >= 0
    # Must return exactly 4 probability entries
    assert len(pred["probabilities"]) == 4

    # 2. SHAP Explanation
    exp_res = client.post("/api/v1/explain", json=SAMPLE_VIIRS_PAYLOAD)
    assert exp_res.status_code == 200
    exp = exp_res.json()
    assert "feature_attributions" in exp
    assert len(exp["feature_attributions"]) > 0
    assert exp["predicted_class"] in EXPECTED_CLASSES


def test_ingestion_dead_letter_queue():
    """
    Batch ingestion quarantines schema-invalid records to DLQ
    without failing valid records.
    NOTE: DLQ is an in-memory Python list in this demo implementation.
    """
    payload = [
        # Valid VIIRS record
        {
            "hotspot_id": "FIRMS-VAL-01",
            "latitude": 22.0,
            "longitude": 79.0,
            "bright_ti4": 340.0,
            "bright_ti5": 295.0,
            "scan": 0.5,
            "track": 0.5,
            "acq_date": "2026-08-20",
            "acq_time": "1200",
            "satellite": "N",
            "confidence": "nominal",
            "frp": 30.0,
            "daynight": "D"
        },
        # Malformed record — latitude out of bounds
        {
            "hotspot_id": "FIRMS-INV-02",
            "latitude": 999.0,
            "longitude": 79.0,
            "bright_ti4": 340.0,
            "bright_ti5": 295.0,
            "scan": 0.5,
            "track": 0.5,
            "acq_date": "2026-08-20",
            "acq_time": "1200",
            "satellite": "N",
            "confidence": "nominal",
            "frp": 30.0,
            "daynight": "D"
        }
    ]
    res = client.post("/api/v1/ingest/batch", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["total_received"] == 2
    assert data["total_valid"] == 1
    assert data["total_quarantined_dlq"] == 1


def test_audit_override():
    """
    NTRO audit trail accepts analyst override and stores it with model_version.
    Verifies it appears in the /audit/logs response.
    NOTE: override endpoint now requires the original FIRMS record to resolve
    model_prediction server-side.
    """
    # Submit override — include the original record for server-side prediction resolution
    override_payload = {
        "request": {
            "hotspot_id": "FIRMS-TEST-001",
            "analyst_id": "NTRO_OFFICER_409",
            "override_class": "industrial",
            "justification": "Confirmed oil refinery gas flare via Sentinel-2 cross-reference.",
            "confidence_rating": 5
        },
        "record": SAMPLE_VIIRS_PAYLOAD
    }
    # Use simplified direct body for the current endpoint signature
    req_body = {
        "hotspot_id": "FIRMS-TEST-001",
        "analyst_id": "NTRO_OFFICER_409",
        "override_class": "industrial",
        "justification": "Confirmed oil refinery gas flare via Sentinel-2 cross-reference.",
        "confidence_rating": 5
    }
    res = client.post("/api/v1/audit/override", json=req_body)
    assert res.status_code == 200
    audit_data = res.json()
    assert "event_id" in audit_data
    assert audit_data["analyst_id"] == "NTRO_OFFICER_409"
    assert audit_data["override_class"] == "industrial"
    assert "model_version" in audit_data  # Provenance field must be present

    # Verify it appears in logs
    logs_res = client.get("/api/v1/audit/logs")
    assert logs_res.status_code == 200
    assert logs_res.json()["total_logs"] >= 1
