"""Tests for the thermal-regime classifier (persistent vs new anomaly).

The regime is a mechanical read of trailing-activity features, deliberately
not a model output — these tests pin the thresholds, the honest-unknown
behavior on missing features, and the presence of the field on API responses.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.thermal_regime import (
    REGIME_INTERMITTENT,
    REGIME_NEW_ANOMALY,
    REGIME_PERSISTENT,
    classify_regime,
)


def _cell(d7: float, d30: float, d90: float | None = 60.0) -> dict:
    cell = {"active_days_7d": d7, "active_days_30d": d30}
    if d90 is not None:
        cell["active_days_90d"] = d90
    return cell


class TestClassifyRegime:
    def test_persistent_gas_flare(self):
        regime, basis = classify_regime(_cell(d7=7, d30=28))
        assert regime == REGIME_PERSISTENT
        assert "7 of last 7" in basis and "28 of last 30" in basis
        assert "continuous operation" in basis

    def test_persistent_requires_both_windows(self):
        # 80% of the month but quiet this week -> fading, not persistent.
        regime, _ = classify_regime(_cell(d7=2, d30=26))
        assert regime != REGIME_PERSISTENT

    def test_new_anomaly_recent_onset(self):
        regime, basis = classify_regime(_cell(d7=5, d30=6))
        assert regime == REGIME_NEW_ANOMALY
        assert "Newly active" in basis

    def test_single_pass_blip_is_not_an_anomaly(self):
        # One detection day in the week is a blip, not an onset burst.
        regime, _ = classify_regime(_cell(d7=1, d30=4))
        assert regime != REGIME_NEW_ANOMALY

    def test_busy_month_disqualifies_new_anomaly(self):
        # Active this week but the month was already busy: established source.
        regime, _ = classify_regime(_cell(d7=6, d30=20))
        assert regime == REGIME_INTERMITTENT

    def test_sporadic_stubble_pattern(self):
        regime, basis = classify_regime(_cell(d7=1, d30=12))
        assert regime == REGIME_INTERMITTENT
        assert "Sporadic" in basis

    def test_missing_features_return_unknown_never_guess(self):
        assert classify_regime({}) == (None, None)
        assert classify_regime({"active_days_7d": 5}) == (None, None)
        assert classify_regime({"active_days_7d": "6", "active_days_30d": 3}) == (None, None)

    def test_basis_includes_90d_window_when_present(self):
        _, basis = classify_regime(_cell(d7=6, d30=27, d90=85))
        assert "85 of last 90" in basis

    def test_basis_omits_90d_window_when_absent(self):
        _, basis = classify_regime(_cell(d7=6, d30=27, d90=None))
        assert "last 90" not in basis


class TestRegimeOnApiResponses:
    """The regime must ride along on serving responses (live + archive)."""

    def test_viewport_predictions_carry_regime(self):
        import pytest
        from fastapi.testclient import TestClient

        from app.core.config import settings
        from app.main import app
        from app.services.feature_store import feature_store

        if not (Path(settings.MODEL_PATH).exists() and Path(settings.OSMWRI_PARQUET).exists()):
            pytest.skip("Requires model bundle and OSM/WRI parquet")
        latest = feature_store.available_dates()[-1]
        with TestClient(app) as client:
            res = client.get(
                "/api/v1/predictions",
                params={
                    "min_lat": 21.5,
                    "max_lat": 25.5,
                    "min_lon": 83.0,
                    "max_lon": 87.5,
                    "acq_date": latest,
                },
            )
            assert res.status_code == 200
            preds = res.json()["predictions"]
            assert preds, "expected detections in test viewport"
            with_regime = [p for p in preds if p["thermal_regime"]]
            assert with_regime, "activity features exist for served cells; regime must be derivable"
            for p in with_regime:
                assert p["thermal_regime"] in ("persistent", "new_anomaly", "intermittent")
                assert p["thermal_regime_basis"]
