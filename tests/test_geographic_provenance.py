"""Geographic generalization provenance tests.

All-India inference with the unchanged CatBoost bundle: predictions outside
the original 10-state train/eval partition must be served with calibrated
probabilities intact, but forced into analyst review with the explicit
geographic caveat. No returned prediction may sit outside Indian territory
(the ingestion polygon mask rejects Sri Lanka / open water cells).
"""

import json
import math
import sys
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
from app.main import app
from app.services.model_service import (
    GEO_OUTSIDE_TRAINING,
    GEO_TRAINING,
    model_service,
)

MODEL_EXISTS = Path(settings.MODEL_PATH).exists()
PARQUET_EXISTS = Path(settings.OSMWRI_PARQUET).exists()
GEO_CAVEAT = settings.CAVEAT_MANIFEST["outside_training_geography"]


def _sample_h3_day_row() -> dict:
    df = pd.read_parquet(settings.OSMWRI_PARQUET)
    row = df.dropna(subset=["h3_08", "acq_date", "h3_lat", "h3_lon"]).iloc[0]
    payload = row.to_dict()
    payload["acq_date"] = str(pd.to_datetime(payload["acq_date"]).date())
    dt = pd.to_datetime(payload["acq_date"])
    doy = dt.dayofyear
    payload["acq_month"] = int(dt.month)
    payload["doy_sin"] = math.sin(2 * math.pi * doy / 365.25)
    payload["doy_cos"] = math.cos(2 * math.pi * doy / 365.25)
    return payload


@pytest.mark.skipif(not (MODEL_EXISTS and PARQUET_EXISTS), reason="Requires model artifact and OSM/WRI parquet")
def test_prediction_inside_training_geography_is_not_flagged():
    payload = _sample_h3_day_row()
    payload["state"] = "Maharashtra"
    prediction = model_service.predict(payload)
    assert prediction.geography == GEO_TRAINING
    assert prediction.state == "Maharashtra"


@pytest.mark.skipif(not (MODEL_EXISTS and PARQUET_EXISTS), reason="Requires model artifact and OSM/WRI parquet")
def test_prediction_outside_training_geography_forces_review_and_caveat():
    payload = _sample_h3_day_row()
    payload["state"] = "Odisha"
    prediction = model_service.predict(payload)
    assert prediction.geography == GEO_OUTSIDE_TRAINING
    assert prediction.needs_review is True
    assert prediction.caveat_flag is not None
    assert GEO_CAVEAT in prediction.caveat_flag
    # Calibrated probabilities are preserved untouched — the flag is metadata
    # outside the model feature vector, never a probability edit.
    assert math.isclose(sum(p.probability for p in prediction.probabilities), 1.0, rel_tol=1e-3)


@pytest.mark.skipif(not (MODEL_EXISTS and PARQUET_EXISTS), reason="Requires model artifact and OSM/WRI parquet")
def test_explain_preserves_geographic_caveat():
    payload = _sample_h3_day_row()
    payload["state"] = "Odisha"
    explanation = model_service.explain(payload)
    assert explanation.caveat_flag is not None
    assert GEO_CAVEAT in explanation.caveat_flag


@pytest.mark.skipif(not (MODEL_EXISTS and PARQUET_EXISTS), reason="Requires model artifact and OSM/WRI parquet")
def test_cell_detail_carries_geographic_caveat():
    """get_cell_detail reads the store's real cell, so pick a cell the store
    actually places outside the training geography."""
    df = pd.read_parquet(settings.OSMWRI_PARQUET, columns=["h3_08", "acq_date", "state"])
    outside = df[~df["state"].isin(model_service.training_geography_states)].sort_values("h3_08")
    if outside.empty:
        pytest.skip("serving artifact has no outside-training-geography cells; live nationwide data is unavailable")
    row = outside.iloc[0]
    h3_id = str(row["h3_08"])
    acq = str(pd.to_datetime(row["acq_date"]).date())
    detail = model_service.get_cell_detail(h3_id, acq)
    assert detail.state == row["state"]
    assert detail.geography == GEO_OUTSIDE_TRAINING
    assert detail.needs_review is True
    assert GEO_CAVEAT in (detail.caveat_flag or "")


@pytest.mark.skipif(not MODEL_EXISTS, reason="Requires model bundle")
def test_training_geography_loads_from_bundle_metadata():
    """The runtime training partition must come from the bundle's
    model_metadata.json (bundle parent dir), not only from the config
    fallback — a missing/renamed metadata file must never silently change
    provenance labels."""
    import json
    from pathlib import Path as _Path

    meta_path = _Path(settings.INFERENCE_BUNDLE_DIR).parent / "model_metadata.json"
    assert meta_path.exists(), (
        f"model_metadata.json missing at {meta_path} — provenance would fall "
        "back to the locked config list"
    )
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    expected = {
        s for key in ("train_states", "test_a_states", "test_b_states") for s in meta.get(key, [])
    }
    assert expected, "model_metadata.json carries no train/eval state partition"
    assert model_service.training_geography_states == expected


@pytest.mark.skipif(not PARQUET_EXISTS, reason="Requires OSM/WRI parquet")
def test_health_reports_ingestion_provenance():
    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200
        body = health.json()
        ingestion = body.get("ingestion")
        assert ingestion is not None, "/health must carry the ingestion provenance block"
        if ingestion.get("available"):
            assert ingestion["last_run_ok"] is True
            assert "states_served" in ingestion
            assert "outside_india_rejected" in ingestion
            assert "outside_training_geography_rows" in ingestion


def test_health_provenance_keeps_last_success_after_failed_attempt(tmp_path, monkeypatch):
    from ingestion import run_ingestion

    history_path = tmp_path / "history.json"
    history_path.write_text(json.dumps({"runs": [
        {"ok": True, "target_date": "2026-09-10", "fetch": {"mode": "live_firms"}},
        {"ok": False, "target_date": "2026-09-10", "error": "network"},
    ]}), encoding="utf-8")
    monkeypatch.setattr(run_ingestion, "RUN_HISTORY_PATH", history_path)
    provenance = run_ingestion.ingestion_provenance()
    assert provenance["available"] is True
    assert provenance["target_date"] == "2026-09-10"
    assert provenance["latest_attempt_ok"] is False


@pytest.mark.skipif(not (MODEL_EXISTS and PARQUET_EXISTS), reason="Requires model artifact and OSM/WRI parquet")
def test_viewport_predictions_stay_inside_indian_territory():
    """Nationwide query on the newest ingested day: every returned cell must
    sit inside the India bbox and never inside the Sri Lanka box — the
    polygon-mask contract."""
    from app.services.feature_store import feature_store

    acq_date = feature_store.latest_acq_date()
    if not acq_date:
        pytest.skip("no ingested dates available")
    with TestClient(app) as client:
        res = client.get(
            "/predictions",
            params={
                "min_lat": 6.75, "max_lat": 37.10,
                "min_lon": 68.03, "max_lon": 97.42,
                "acq_date": acq_date,
            },
        )
        assert res.status_code == 200
        body = res.json()
        for prediction in body["predictions"]:
            lat, lon = prediction["latitude"], prediction["longitude"]
            assert 6.0 <= lat <= 37.5 and 67.5 <= lon <= 98.0, f"cell outside India bbox: {lat}, {lon}"
            assert not (lat <= 9.85 and lon >= 80.0), f"Sri Lanka coordinate leaked: {lat}, {lon}"
            if prediction.get("geography") == GEO_OUTSIDE_TRAINING:
                assert prediction["needs_review"] is True
                assert GEO_CAVEAT in (prediction["caveat_flag"] or "")
