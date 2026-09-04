import logging
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

SAMPLE_FIRMS_RECORD = {
    "latitude": 12.97,
    "longitude": 77.59,
    "bright_ti4": 340.5,
    "bright_ti5": 295.1,
    "scan": 0.4,
    "track": 0.4,
    "acq_date": "2024-05-15",
    "acq_time": "1330",
    "satellite": "N",
    "daynight": "D",
    "frp": 15.2,
    "confidence": "high",
}

SAMPLE_AUDIT_OVERRIDE = {
    "hotspot_id": "8861892695fffff_2024-05-15",
    "analyst_id": "NTRO_ANALYST_01",
    "override_class": "industrial",
    "justification": "Verified industrial flare anomaly against imagery archive",
    "confidence_rating": 5,
}

SENSITIVE_LEAK_STRING = "Database failure at /var/secret/db_credentials.sqlite: SELECT * FROM secret_table"


@pytest.fixture
def client():
    with (
        patch("app.main.feature_store.load"),
        patch("app.main.model_service.load_model"),
        TestClient(app, raise_server_exceptions=False) as test_client,
    ):
        yield test_client


def test_classify_hotspot_error_sanitization(client, caplog):
    with patch("app.api.endpoints.classify.model_service.predict_single") as mock_predict:
        mock_predict.side_effect = RuntimeError(SENSITIVE_LEAK_STRING)
        with caplog.at_level(logging.ERROR):
            response = client.post("/api/v1/classify", json=SAMPLE_FIRMS_RECORD)

        assert response.status_code == 500
        detail = response.json()["detail"]
        assert SENSITIVE_LEAK_STRING not in detail
        assert "/var/secret/" not in detail
        assert "SELECT" not in detail
        assert detail == "Inference failed due to an internal server error."
        assert SENSITIVE_LEAK_STRING in caplog.text


def test_classify_batch_error_sanitization(client, caplog):
    with patch("app.api.endpoints.classify.model_service.predict_single") as mock_predict:
        mock_predict.side_effect = RuntimeError(SENSITIVE_LEAK_STRING)
        with caplog.at_level(logging.ERROR):
            response = client.post("/api/v1/classify/batch", json=[SAMPLE_FIRMS_RECORD])

        assert response.status_code == 500
        detail = response.json()["detail"]
        assert SENSITIVE_LEAK_STRING not in detail
        assert detail == "Batch classification failed due to an internal server error."
        assert SENSITIVE_LEAK_STRING in caplog.text


def test_explain_hotspot_error_sanitization(client, caplog):
    with patch("app.api.endpoints.classify.model_service.explain_single") as mock_explain:
        mock_explain.side_effect = RuntimeError(SENSITIVE_LEAK_STRING)
        with caplog.at_level(logging.ERROR):
            response = client.post("/api/v1/explain", json=SAMPLE_FIRMS_RECORD)

        assert response.status_code == 500
        detail = response.json()["detail"]
        assert SENSITIVE_LEAK_STRING not in detail
        assert detail == "Explainability computation failed due to an internal server error."
        assert SENSITIVE_LEAK_STRING in caplog.text


def test_predictions_viewport_error_sanitization(client, caplog):
    with patch("app.api.endpoints.classify.model_service.get_viewport_predictions") as mock_vp:
        mock_vp.side_effect = RuntimeError(SENSITIVE_LEAK_STRING)
        params = {
            "min_lat": 10.0,
            "max_lat": 15.0,
            "min_lon": 75.0,
            "max_lon": 80.0,
            "acq_date": "2024-05-15",
        }
        with caplog.at_level(logging.ERROR):
            response = client.get("/api/v1/predictions", params=params)

        assert response.status_code == 500
        detail = response.json()["detail"]
        assert SENSITIVE_LEAK_STRING not in detail
        assert detail == "Viewport prediction failed due to an internal server error."
        assert SENSITIVE_LEAK_STRING in caplog.text


def test_cell_explanation_error_sanitization(client, caplog):
    with patch("app.api.endpoints.classify.model_service.get_cell_detail") as mock_cell:
        mock_cell.side_effect = RuntimeError(SENSITIVE_LEAK_STRING)
        params = {"acq_date": "2024-05-15"}
        with caplog.at_level(logging.ERROR):
            response = client.get("/api/v1/predictions/cell_123/explain", params=params)

        assert response.status_code == 500
        detail = response.json()["detail"]
        assert SENSITIVE_LEAK_STRING not in detail
        assert detail == "Cell explanation failed due to an internal server error."
        assert SENSITIVE_LEAK_STRING in caplog.text


def test_cell_detail_error_sanitization(client, caplog):
    with patch("app.api.endpoints.classify.model_service.get_cell_detail") as mock_cell:
        mock_cell.side_effect = RuntimeError(SENSITIVE_LEAK_STRING)
        params = {"acq_date": "2024-05-15"}
        with caplog.at_level(logging.ERROR):
            response = client.get("/api/v1/predictions/cell_123", params=params)

        assert response.status_code == 500
        detail = response.json()["detail"]
        assert SENSITIVE_LEAK_STRING not in detail
        assert detail == "Cell detail query failed due to an internal server error."
        assert SENSITIVE_LEAK_STRING in caplog.text


def test_audit_override_error_sanitization(client, caplog):
    with patch("app.api.endpoints.audit.audit_service.log_override") as mock_log:
        mock_log.side_effect = RuntimeError(SENSITIVE_LEAK_STRING)
        with caplog.at_level(logging.ERROR):
            response = client.post("/api/v1/audit/override", json=SAMPLE_AUDIT_OVERRIDE)

        assert response.status_code == 500
        detail = response.json()["detail"]
        assert SENSITIVE_LEAK_STRING not in detail
        assert detail == "Failed to record audit override due to an internal server error."
        assert SENSITIVE_LEAK_STRING in caplog.text


def test_audit_logs_error_sanitization(client, caplog):
    with patch("app.api.endpoints.audit.audit_service.get_logs") as mock_logs:
        mock_logs.side_effect = RuntimeError(SENSITIVE_LEAK_STRING)
        with caplog.at_level(logging.ERROR):
            response = client.get("/api/v1/audit/logs")

        assert response.status_code == 500
        detail = response.json()["detail"]
        assert SENSITIVE_LEAK_STRING not in detail
        assert detail == "Failed to retrieve audit trail logs due to an internal server error."
        assert SENSITIVE_LEAK_STRING in caplog.text
