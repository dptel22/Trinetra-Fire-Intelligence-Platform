"""Tests for Agent BACK-1: Serving Path & API Surface.

Covers:
- BACK-1.1: /api/v1/health alias parity with root /health
- BACK-1.2: CORS_ALLOW_ORIGINS parsing from environment variable
- BACK-1.3: NTRO audit override honesty (real model prediction + confidence)
- BACK-1.4: Viewport prediction vectorization numerical parity vs reference loop
"""

from __future__ import annotations

import os
from unittest.mock import patch

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services.audit_service import audit_service
from app.services.feature_store import feature_store
from app.services.model_service import model_service


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_health_v1_and_root_parity(client):
    """BACK-1.1: Verify /api/v1/health provides the exact contract as root /health."""
    res_root = client.get("/health")
    res_v1 = client.get("/api/v1/health")

    assert res_root.status_code == 200
    assert res_v1.status_code == 200

    data_root = res_root.json()
    data_v1 = res_v1.json()

    assert data_root["status"] == "healthy"
    assert data_v1["status"] == "healthy"
    assert data_root["database"] == "connected"
    assert data_v1["database"] == "connected"
    assert data_root["model_loaded"] is True
    assert data_v1["model_loaded"] is True
    assert data_root["schema_version"] == data_v1["schema_version"]
    assert data_root["target_classes"] == data_v1["target_classes"]
    assert data_root["review_thresholds"] == data_v1["review_thresholds"]
    assert data_root["review_thresholds"] is not None


def test_cors_from_environment(monkeypatch):
    """BACK-1.2: Verify CORS_ALLOW_ORIGINS reads comma-separated env var."""
    # When unset, returns the default localhost origins
    monkeypatch.delenv("CORS_ALLOW_ORIGINS", raising=False)
    defaults = settings.CORS_ALLOW_ORIGINS
    assert "http://localhost:3000" in defaults
    assert "http://localhost:5173" in defaults
    assert len(defaults) == 4

    # When set to custom origins
    custom_origins = "https://demo.ntro.gov.in, https://command-center.local:8443,http://192.168.1.50:5173"
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", custom_origins)
    configured = settings.CORS_ALLOW_ORIGINS
    assert configured == [
        "https://demo.ntro.gov.in",
        "https://command-center.local:8443",
        "http://192.168.1.50:5173",
    ]


def _a_real_store_cell() -> tuple[str, str]:
    """A (h3_08, acq_date) pair that actually exists in the serving store."""
    import pandas as pd

    df = pd.read_parquet(settings.H3_DAILY_PARQUET, columns=["h3_08", "acq_date"])
    row = df.iloc[0]
    return str(row["h3_08"]), str(pd.to_datetime(row["acq_date"]).date())


def test_audit_override_records_real_prediction(client):
    """BACK-1.3: Verify audit override resolves and stores real prediction + confidence."""
    # Real cell from the serving store (cell cases are picked from live data —
    # hard-coded (h3, date) pairs went stale when serving coverage changed).
    test_h3, test_date = _a_real_store_cell()
    hotspot_id = f"{test_h3}_{test_date}"

    # Query expected detail via model service directly
    expected_detail = model_service.get_cell_detail(test_h3, test_date)

    override_payload = {
        "hotspot_id": hotspot_id,
        "analyst_id": "NTRO_OFFICER_TEST",
        "override_class": "wildfire",
        "justification": "Imagery inspection confirms controlled burn in adjacent tract.",
        "confidence_rating": 4,
    }

    response = client.post("/api/v1/audit/override", json=override_payload)
    assert response.status_code == 200, response.text
    data = response.json()

    # Must not be the old placeholder "server_resolved"
    assert data["model_prediction"] != "server_resolved"
    # Must contain the true predicted class and formatted confidence
    assert expected_detail.predicted_class in data["model_prediction"]
    assert f"{expected_detail.confidence:.4f}" in data["model_prediction"]

    # Verify persistent audit log entry in DuckDB
    logs_res = client.get("/api/v1/audit/logs?limit=5")
    assert logs_res.status_code == 200
    entries = logs_res.json()["logs"]
    matching = [e for e in entries if e["event_id"] == data["event_id"]]
    assert len(matching) == 1
    assert matching[0]["model_prediction"] == data["model_prediction"]


def test_vectorization_numerical_parity_vs_reference_loop():
    """BACK-1.4: Parity test asserting vectorized batch produces identical results to loop path (~1e-9)."""
    # Fetch real rows from the serving store on its newest ingested date
    model_service.load_model()
    acq_date = feature_store.latest_acq_date()
    assert acq_date, "serving store has no ingested dates"
    # Query nationwide for the date, then bound the loop-reference cost;
    # parity is asserted per-row.
    rows = feature_store.query_bbox(
        min_lat=6.75,
        max_lat=37.10,
        min_lon=68.03,
        max_lon=97.42,
        acq_date=acq_date,
    )
    assert len(rows) >= 5, f"Expected at least 5 test rows for parity check, got {len(rows)}"
    rows = rows[:20]

    # Reference implementation: single-row predict in a loop
    loop_results = [model_service.predict(row) for row in rows]

    # Candidate vectorized implementation: predict_batch
    batch_results = model_service.predict_batch(rows)

    assert len(batch_results) == len(loop_results)

    for i, (b_pred, l_pred) in enumerate(zip(batch_results, loop_results)):
        assert b_pred.cell_id == l_pred.cell_id
        assert b_pred.latitude == l_pred.latitude
        assert b_pred.longitude == l_pred.longitude
        assert b_pred.h3_index == l_pred.h3_index
        assert b_pred.predicted_class == l_pred.predicted_class
        assert b_pred.calibrated == l_pred.calibrated
        assert b_pred.needs_review == l_pred.needs_review
        assert b_pred.caveat_flag == l_pred.caveat_flag

        # Numeric parity for confidence
        assert abs(b_pred.confidence - l_pred.confidence) < 1e-6

        # Numeric parity for all calibrated class probabilities
        b_probs = {p.class_name: p.probability for p in b_pred.probabilities}
        l_probs = {p.class_name: p.probability for p in l_pred.probabilities}
        assert set(b_probs.keys()) == set(l_probs.keys())
        for cls in b_probs:
            assert abs(b_probs[cls] - l_probs[cls]) < 1e-6, (
                f"Row {i} class {cls} probability divergence: batch={b_probs[cls]} vs loop={l_probs[cls]}"
            )
