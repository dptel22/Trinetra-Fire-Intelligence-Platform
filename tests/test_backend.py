import pytest
import os
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings
from pipeline.feature_engineering import engineer_features, latlng_to_h3
from pipeline.spatial_cv import SpatialKFold
import pandas as pd
import numpy as np

client = TestClient(app)

def test_h3_indexing():
    """Verify lat/lon converts to valid H3 hexagon string at resolution 8."""
    h3_idx = latlng_to_h3(22.0, 79.0, resolution=settings.H3_RESOLUTION)
    assert isinstance(h3_idx, str)
    assert len(h3_idx) > 5

def test_feature_engineering_persistence_normalization():
    """Verify persistence normalization correctly divides by observed days."""
    df = pd.DataFrame([{
        "latitude": 22.0,
        "longitude": 79.0,
        "persistence_90d": 18,
        "observed_days_in_90d": 79, # 11 missing days
        "satellite": "SNPP",
        "daynight": "D"
    }])
    feat_df = engineer_features(df)
    assert "persistence_90d_norm" in feat_df.columns
    # 18 / 79 = 0.2278...
    expected_norm = 18.0 / 79.0
    assert abs(feat_df["persistence_90d_norm"].iloc[0] - expected_norm) < 1e-4
    # Check that H3 string type is maintained
    assert isinstance(feat_df["h3_index"].iloc[0], str)

def test_spatial_cross_validation_split():
    """Verify SpatialKFold creates geographically disjoint splits without overlap."""
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
        # Assert no intersection between train and val
        assert len(set(train_idx).intersection(set(val_idx))) == 0

def test_api_root_and_health():
    """Verify API root and health endpoints."""
    res = client.get("/")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "online"
    assert len(data["target_classes"]) == 6

def test_classify_and_explain_endpoints():
    """Test real-time /api/v1/classify and on-demand /api/v1/explain."""
    sample_payload = {
        "hotspot_id": "FIRMS-TEST-001",
        "latitude": 22.05,
        "longitude": 79.12,
        "brightness": 355.0,
        "scan": 0.4,
        "track": 0.4,
        "acq_date": "2026-08-20",
        "acq_time": "1345",
        "satellite": "SNPP",
        "confidence": 95.0,
        "bright_t31": 310.0,
        "frp": 85.5,
        "daynight": "D",
        "persistence_90d": 3,
        "observed_days_in_90d": 85
    }
    # 1. Classify
    res = client.post("/api/v1/classify", json=sample_payload)
    assert res.status_code == 200
    pred_data = res.json()
    assert "predicted_class" in pred_data
    assert pred_data["predicted_class"] in settings.TARGET_CLASSES
    assert pred_data["latency_ms"] >= 0
    assert len(pred_data["probabilities"]) == 6

    # 2. Explain (SHAP)
    exp_res = client.post("/api/v1/explain", json=sample_payload)
    assert exp_res.status_code == 200
    exp_data = exp_res.json()
    assert "feature_attributions" in exp_data
    assert len(exp_data["feature_attributions"]) > 0

def test_ingestion_dead_letter_queue():
    """Test batch ingestion with schema drift quarantine."""
    payload = [
        # Valid item
        {
            "hotspot_id": "FIRMS-VAL-01",
            "latitude": 22.0,
            "longitude": 79.0,
            "brightness": 330.0,
            "scan": 0.5,
            "track": 0.5,
            "acq_date": "2026-08-20",
            "acq_time": "1200",
            "satellite": "NOAA-20",
            "confidence": 85.0,
            "bright_t31": 290.0,
            "frp": 30.0,
            "daynight": "D"
        },
        # Malformed item (invalid latitude > 90)
        {
            "hotspot_id": "FIRMS-INV-02",
            "latitude": 999.0,
            "longitude": 79.0,
            "brightness": 330.0,
            "scan": 0.5,
            "track": 0.5,
            "acq_date": "2026-08-20",
            "acq_time": "1200",
            "confidence": 85.0,
            "bright_t31": 290.0,
            "frp": 30.0,
            "daynight": "D"
        }
    ]
    res = client.post("/api/v1/ingest/batch", json=payload)
    assert res.status_code == 200
    ingest_data = res.json()
    assert ingest_data["total_received"] == 2
    assert ingest_data["total_valid"] == 1
    assert ingest_data["total_quarantined_dlq"] == 1

def test_audit_override():
    """Test NTRO immutable audit logging."""
    override_payload = {
        "hotspot_id": "FIRMS-TEST-001",
        "analyst_id": "NTRO_OFFICER_409",
        "original_prediction": "Wildfire",
        "override_class": "Industrial/Gas Flare",
        "justification": "Confirmed oil refinery ground flare signature at known coordinate via high-res optical imagery cross-reference.",
        "confidence_rating": 5
    }
    res = client.post("/api/v1/audit/override", json=override_payload)
    assert res.status_code == 200
    audit_data = res.json()
    assert "event_id" in audit_data
    assert audit_data["analyst_id"] == "NTRO_OFFICER_409"
    assert audit_data["override_class"] == "Industrial/Gas Flare"

    # Verify retrieved in logs
    logs_res = client.get("/api/v1/audit/logs")
    assert logs_res.status_code == 200
    logs_data = logs_res.json()
    assert logs_data["total_logs"] >= 1
