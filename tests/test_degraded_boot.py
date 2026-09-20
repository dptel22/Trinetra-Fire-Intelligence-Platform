"""Fresh-clone contract: with no serving parquets the API boots degraded, fail-closed.

Documented in README §7/§9, data/README.md and the Dockerfile: the backend must
start, ``/health`` must report the missing store, and data routes must answer
503 (never a 500, never invented predictions). Previously ``feature_store.load()``
in the lifespan raised ``FileNotFoundError`` and the process crashed, which also
broke the fresh-clone ``docker.yml`` smoke test.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services.feature_store import FeatureStoreUnavailableError, feature_store


@pytest.fixture()
def missing_store(monkeypatch, tmp_path):
    """Force the shared feature store back to 'unseeded' with no parquets on disk."""
    monkeypatch.setattr(settings, "H3_DAILY_PARQUET", str(tmp_path / "absent_daily.parquet"))
    monkeypatch.setattr(settings, "OSMWRI_PARQUET", str(tmp_path / "absent_static.parquet"))
    monkeypatch.setattr(feature_store, "loaded", False)
    monkeypatch.setattr(feature_store, "load_error", None)
    return tmp_path


def test_load_raises_503_class_error_not_bare_filenotfound(missing_store):
    with pytest.raises(FeatureStoreUnavailableError) as excinfo:
        feature_store.load()
    assert excinfo.value.status_code == 503
    assert "fetch_serving_data.py" in excinfo.value.detail
    assert feature_store.load_error and "absent_daily.parquet" in feature_store.load_error


def test_app_boots_degraded_and_health_reports_missing_store(missing_store):
    with TestClient(app) as client:  # runs the real lifespan; must not raise
        for path in ("/health", "/api/v1/health"):
            resp = client.get(path)
            assert resp.status_code == 200, path
            body = resp.json()
            assert body["status"] == "degraded"
            assert body["database"] == "unavailable"
            assert "absent_daily.parquet" in (body["database_detail"] or "")
            assert body["latest_acq_date"] is None
            # The model bundle is independent of the data store and still loads.
            assert body["model_loaded"] is True


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/predictions?min_lat=6&max_lat=38&min_lon=68&max_lon=98&acq_date=2026-09-01",
        "/api/v1/predictions/88209a2011fffff?acq_date=2026-09-01",
        "/api/v1/predictions/88209a2011fffff/explain?acq_date=2026-09-01",
        "/predictions?min_lat=6&max_lat=38&min_lon=68&max_lon=98&acq_date=2026-09-01",
        "/api/v1/archive/dates",
        "/api/v1/alerts/states?acq_date=2026-09-01",
    ],
)
def test_data_routes_fail_closed_with_503(missing_store, path):
    with TestClient(app) as client:
        resp = client.get(path)
    assert resp.status_code == 503, (path, resp.status_code, resp.text[:200])
    assert "Serving data store is not loaded" in resp.json()["detail"]
