from __future__ import annotations

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import timeline_service as timeline_module
from pipeline.timeline_materializer import build_materialized_layers


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def point_timeline_dir(monkeypatch):
    """Point the shared timeline service at an isolated directory per test."""

    def _apply(directory):
        monkeypatch.setattr(timeline_module.timeline_service, "timeline_dir", str(directory))

    return _apply


def _sample_daily() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {"h3_08": "cell-a", "acq_date": "2024-01-01", "frp_max": 10.0, "n_detections": 2, "n_detections_night": 1, "satellite_nunique": 1},
            {"h3_08": "cell-a", "acq_date": "2024-02-03", "frp_max": 20.0, "n_detections": 1, "n_detections_night": 0, "satellite_nunique": 1},
        ]
    )


def test_missing_layers_fail_closed_with_503(client, tmp_path, point_timeline_dir, monkeypatch):
    monkeypatch.delenv("TIMELINE_ALLOW_FALLBACK", raising=False)
    point_timeline_dir(tmp_path)  # empty directory: no manifest, no layers

    response = client.get("/api/v1/cells/cell-a/timeline", params={"granularity": "month"})

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["materialization_status"] == "missing"
    assert detail["fallback_used"] is False
    assert "materializ" in detail["message"].lower()


def test_fallback_only_with_explicit_env_flag(client, tmp_path, point_timeline_dir, monkeypatch):
    monkeypatch.setenv("TIMELINE_ALLOW_FALLBACK", "1")
    point_timeline_dir(tmp_path)  # layers still absent
    monkeypatch.setattr(
        timeline_module.timeline_service.feature_store,
        "rows_for_cell",
        lambda _h3, _start=None, _end=None: pd.DataFrame(
            [{"h3_08": "cell-a", "acq_date": "2024-01-01", "frp_max": 10.0, "n_detections": 1}]
        ),
    )

    response = client.get("/api/v1/cells/cell-a/timeline", params={"granularity": "month"})

    assert response.status_code == 200
    body = response.json()
    assert body["fallback_used"] is True
    assert body["materialization_status"] == "fallback_h3_daily"
    assert body["h3_index"] == "cell-a"


def test_materialized_layers_serve_normally(client, tmp_path, point_timeline_dir, monkeypatch):
    monkeypatch.delenv("TIMELINE_ALLOW_FALLBACK", raising=False)
    build_materialized_layers(_sample_daily(), tmp_path)
    point_timeline_dir(tmp_path)

    response = client.get("/api/v1/cells/cell-a/timeline", params={"granularity": "month"})

    assert response.status_code == 200
    body = response.json()
    assert body["materialization_status"] == "materialized"
    assert body["fallback_used"] is False
    assert body["materialized_at"] is not None
    assert body["materialization_version"] == "timeline_v1"
    assert body["context"]["historical_context_available"] is False
    assert body["model"]["prediction_scope"] == "historical_thermal_activity"


def test_stale_layers_fail_closed_with_503(client, tmp_path, point_timeline_dir, monkeypatch):
    monkeypatch.delenv("TIMELINE_ALLOW_FALLBACK", raising=False)
    build_materialized_layers(_sample_daily(), tmp_path)
    point_timeline_dir(tmp_path)
    # Force everything stale by making the staleness threshold effectively zero.
    monkeypatch.setenv("TIMELINE_MAX_AGE_HOURS_MONTHLY", "0")

    response = client.get("/api/v1/cells/cell-a/timeline", params={"granularity": "month"})

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["materialization_status"] == "stale"
    assert detail["layer"] == "monthly"


def test_cell_timeline_endpoint_rejects_unknown_granularity(client):
    response = client.get("/api/v1/cells/cell-a/timeline", params={"granularity": "quarter"})
    assert response.status_code == 422
