import json
import math
import sys
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
import pytest
from catboost import CatBoostClassifier, Pool
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
from app.main import app
from app.services.feature_store import STATIC_COLUMNS, feature_store
from app.services.model_service import (
    classify_mining_subtype,
    classify_persistence,
    model_service,
)

EXPECTED_CLASSES = {"industrial", "mining", "agricultural_burn", "wildfire"}
MODEL_EXISTS = Path(settings.MODEL_PATH).exists()
PARQUET_EXISTS = Path(settings.OSMWRI_PARQUET).exists()


def test_classify_persistence_precedence():
    assert classify_persistence({"is_static_land": 1, "active_days_7d": 0})["event_type"] == "persistent_source"
    assert classify_persistence({"is_static_land": -1, "active_days_7d": 0})["event_type"] == "unknown_provenance"
    assert classify_persistence({"is_static_land": None, "active_days_7d": 0, "active_days_30d": 0})["event_type"] == "unknown_provenance"
    assert classify_persistence({"is_static_land": np.nan, "active_days_7d": 0, "active_days_30d": 0})["event_type"] == "unknown_provenance"
    assert classify_persistence({"is_static_land": 0, "active_days_7d": 1, "active_days_30d": 3})["event_type"] == "new_event"
    assert classify_persistence({"is_static_land": 0, "active_days_7d": None, "active_days_30d": None})["event_type"] == "new_event"
    assert classify_persistence({"is_static_land": 0, "active_days_7d": 2, "active_days_30d": 3})["event_type"] == "ambiguous"
    assert classify_persistence({"is_static_land": 0})["event_type"] == "new_event"


def test_classify_mining_subtype():
    assert classify_mining_subtype({"dist_osm_mineshaft_km": 1.2, "dist_osm_adit_km": 2.0, "dist_osm_quarry_km": 3.0}) == {
        "subtype": "underground",
        "nearest_km": 1.2,
    }
    assert classify_mining_subtype({"dist_osm_mineshaft_km": 5.0, "dist_osm_adit_km": 6.0, "dist_osm_quarry_km": 2.0}) == {
        "subtype": "surface",
        "nearest_km": 2.0,
    }
    assert classify_mining_subtype({"dist_osm_mineshaft_km": None, "dist_osm_adit_km": None, "dist_osm_quarry_km": None}) is None


@pytest.mark.skipif(not (MODEL_EXISTS and PARQUET_EXISTS), reason="Requires real serving model and parquet")
def test_real_mining_explanation_includes_subtype():
    model_service.load_model()
    row = feature_store.get_cell("883ca83005fffff", "2026-09-08")
    assert row is not None

    prediction = model_service.predict(row)
    assert prediction.predicted_class == "mining"

    explanation = model_service.explain(row)
    assert explanation.predicted_class == "mining"
    assert explanation.mining_subtype is not None
    assert explanation.mining_subtype["subtype"] in {"underground", "surface"}
    assert isinstance(explanation.mining_subtype["nearest_km"], float)


def _calendar_features(acq_date: str) -> dict[str, float]:
    dt = pd.to_datetime(acq_date)
    doy = dt.dayofyear
    return {
        "acq_month": int(dt.month),
        "doy_sin": math.sin(2 * math.pi * doy / 365.25),
        "doy_cos": math.cos(2 * math.pi * doy / 365.25),
    }


def _sample_h3_day_row() -> dict:
    df = pd.read_parquet(settings.OSMWRI_PARQUET)
    row = df.dropna(subset=["h3_08", "acq_date", "h3_lat", "h3_lon"]).iloc[0]
    payload = row.to_dict()
    payload["acq_date"] = str(pd.to_datetime(payload["acq_date"]).date())
    # The shipped parquets predate the v3 contract; the calendar features are
    # derived at seed time in the store, so mirror that here.
    payload.update(_calendar_features(payload["acq_date"]))
    return payload


def _pool_from_row(row: dict) -> Pool:
    frame = pd.DataFrame([{col: row[col] for col in settings.MODEL_FEATURES}], columns=settings.MODEL_FEATURES)
    for col in settings.CAT_FEATURES:
        frame[col] = frame[col].astype("string").fillna("missing").astype(str)
    for col in frame.columns:
        if col not in settings.CAT_FEATURES:
            frame[col] = pd.to_numeric(frame[col], errors="coerce")
    return Pool(frame, cat_features=settings.CAT_FEATURES)


@pytest.mark.skipif(not MODEL_EXISTS, reason=f"Model artifact not found at {settings.MODEL_PATH}")
def test_real_model_contract():
    model = CatBoostClassifier()
    model.load_model(settings.MODEL_PATH)

    assert settings.H3_RESOLUTION == 8
    assert list(model.feature_names_) == settings.MODEL_FEATURES
    assert [model.feature_names_[idx] for idx in model.get_cat_feature_indices()] == settings.CAT_FEATURES
    assert {str(cls) for cls in model.classes_} == EXPECTED_CLASSES


@pytest.mark.skipif(not (MODEL_EXISTS and PARQUET_EXISTS), reason="Requires model artifact and OSM/WRI parquet")
def test_real_model_predict_proba_and_shap_shape():
    model = CatBoostClassifier()
    model.load_model(settings.MODEL_PATH)
    row = _sample_h3_day_row()
    pool = _pool_from_row(row)

    probs = model.predict_proba(pool)[0]
    assert len(probs) == 4
    assert np.isclose(float(np.sum(probs)), 1.0)

    shap_values = model.get_feature_importance(type="ShapValues", data=pool)
    assert shap_values.shape == (1, 4, len(settings.MODEL_FEATURES) + 1)


@pytest.mark.skipif(not PARQUET_EXISTS, reason=f"OSM/WRI parquet not found at {settings.OSMWRI_PARQUET}")
def test_feature_store_cell_and_bbox_contract():
    row = _sample_h3_day_row()
    feature_store.load()

    cell = feature_store.get_cell(row["h3_08"], row["acq_date"])
    assert cell is not None
    assert cell["h3_08"] == row["h3_08"]
    for feature in settings.MODEL_FEATURES:
        assert feature in cell

    bbox_rows = feature_store.query_bbox(
        row["h3_lat"] - 0.01,
        row["h3_lat"] + 0.01,
        row["h3_lon"] - 0.01,
        row["h3_lon"] + 0.01,
        row["acq_date"],
    )
    assert any(item["h3_08"] == row["h3_08"] for item in bbox_rows)


@pytest.mark.skipif(not (MODEL_EXISTS and PARQUET_EXISTS), reason="Requires model artifact and OSM/WRI parquet")
def test_health_predictions_and_explain_endpoints():
    row = _sample_h3_day_row()
    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200
        health_json = health.json()
        assert health_json["model_loaded"] is True
        assert health_json["schema_version"] == settings.FEATURE_SCHEMA_VERSION
        assert health_json["calibrators_loaded"] is True
        assert health_json["bundle_dir"]
        assert set(health_json["review_thresholds"]) == EXPECTED_CLASSES

        list_res = client.get(
            "/predictions",
            params={
                "min_lat": row["h3_lat"] - 0.01,
                "max_lat": row["h3_lat"] + 0.01,
                "min_lon": row["h3_lon"] - 0.01,
                "max_lon": row["h3_lon"] + 0.01,
                "acq_date": row["acq_date"],
            },
        )
        assert list_res.status_code == 200
        list_json = list_res.json()
        assert list_json["total_predictions"] >= 1
        prediction = list_json["predictions"][0]
        assert prediction["predicted_class"] in EXPECTED_CLASSES | {"unclassified"}
        assert len(prediction["probabilities"]) == 4
        assert "calibrated" in prediction and isinstance(prediction["calibrated"], bool)
        assert "needs_review" in prediction
        assert math.isclose(sum(p["probability"] for p in prediction["probabilities"]), 1.0, rel_tol=1e-3)

        detail = client.get(f"/predictions/{row['h3_08']}", params={"acq_date": row["acq_date"]})
        assert detail.status_code == 200
        detail_json = detail.json()
        assert detail_json["cell_id"] == row["h3_08"]
        assert detail_json["caveat_flag"] is not None
        assert settings.CAVEAT_MANIFEST["pseudo_label_circularity"] in detail_json["caveat_flag"]
        if detail_json.get("needs_review"):
            assert settings.CAVEAT_MANIFEST["low_confidence_review"] in detail_json["caveat_flag"]

        explain = client.get(f"/predictions/{row['h3_08']}/explain", params={"acq_date": row["acq_date"]})
        assert explain.status_code == 200
        explain_json = explain.json()
        assert len(explain_json["feature_attributions"]) == 3
        assert explain_json["predicted_class"] in EXPECTED_CLASSES | {"unclassified"}
        assert explain_json["persistence"]["event_type"] in {
            "persistent_source",
            "unknown_provenance",
            "new_event",
            "ambiguous",
        }
        assert "mining_subtype" in explain_json
        if explain_json["predicted_class"] != "mining":
            assert explain_json["mining_subtype"] is None
        if explain_json["persistence"]["event_type"] != "ambiguous":
            assert explain_json["persistence"]["description"] in explain_json["summary_statement"]
        assert explain_json["caveat_flag"] is not None
        assert settings.CAVEAT_MANIFEST["pseudo_label_circularity"] in explain_json["caveat_flag"]


@pytest.mark.skipif(not MODEL_EXISTS, reason="Requires model bundle")
def test_inference_bundle_contract():
    model_service.load_model()
    schema = json.loads((Path(settings.INFERENCE_BUNDLE_DIR) / "feature_schema.json").read_text(encoding="utf-8"))
    assert schema["feature_cols"] == settings.MODEL_FEATURES == list(model_service.model.feature_names_)
    assert len(settings.MODEL_FEATURES) == 55
    assert schema["cat_features"] == settings.CAT_FEATURES
    assert set(schema["target_classes"]) == EXPECTED_CLASSES
    assert set(model_service.calibrators) == EXPECTED_CLASSES
    assert set(model_service.review_thresholds) <= EXPECTED_CLASSES


@pytest.mark.skipif(not PARQUET_EXISTS, reason="Requires OSM/WRI parquet")
def test_static_columns_available_in_parquet():
    df = pd.read_parquet(settings.OSMWRI_PARQUET)
    missing = [col for col in STATIC_COLUMNS if col not in df.columns]
    assert not missing, f"STATIC_COLUMNS not present in OSM/WRI parquet: {missing}"
    derived = {"acq_month", "doy_sin", "doy_cos"}
    assert derived.isdisjoint(STATIC_COLUMNS), "calendar features must not be treated as static OSM/WRI columns"


@pytest.mark.skipif(not (MODEL_EXISTS and PARQUET_EXISTS), reason="Requires model bundle and OSM/WRI parquet")
def test_review_gate_flags_low_confidence(monkeypatch):
    model_service.load_model()
    row = _sample_h3_day_row()
    # Pin a training-geography state: this test exercises the confidence gate,
    # not the geographic-generalization flag (which forces needs_review).
    row["state"] = "Maharashtra"

    monkeypatch.setattr(model_service, "review_thresholds", {cls: 1.01 for cls in settings.TARGET_CLASSES})
    flagged = model_service.predict(row)
    assert flagged.needs_review is True
    assert settings.CAVEAT_MANIFEST["low_confidence_review"] in (flagged.caveat_flag or "")

    monkeypatch.setattr(model_service, "review_thresholds", {cls: 0.0 for cls in settings.TARGET_CLASSES})
    unflagged = model_service.predict(row)
    assert unflagged.needs_review is False
    assert settings.CAVEAT_MANIFEST["low_confidence_review"] not in (unflagged.caveat_flag or "")


@pytest.mark.skipif(not (MODEL_EXISTS and PARQUET_EXISTS), reason="Requires model bundle and OSM/WRI parquet")
def test_cell_detail_merges_review_caveat_and_explanation_caveats(monkeypatch):
    """Test that get_cell_detail correctly merges review caveat and explanation caveats without duplication."""
    model_service.load_model()
    row = _sample_h3_day_row()
    monkeypatch.setattr(model_service, "review_thresholds", {cls: 1.01 for cls in settings.TARGET_CLASSES})
    client = TestClient(app)
    detail = client.get(f"/predictions/{row['h3_08']}", params={"acq_date": row["acq_date"]})
    assert detail.status_code == 200
    detail_json = detail.json()
    assert detail_json["needs_review"] is True
    assert detail_json["caveat_flag"] is not None
    assert settings.CAVEAT_MANIFEST["low_confidence_review"] in detail_json["caveat_flag"]
    assert settings.CAVEAT_MANIFEST["pseudo_label_circularity"] in detail_json["caveat_flag"]
    parts = [p.strip() for p in detail_json["caveat_flag"].split(" | ")]
    assert len(parts) == len(set(parts)), f"Duplicate caveat segments found: {parts}"


class _BrokenCalibrator:
    def predict(self, values):
        return [float("nan")] * len(list(values))


@pytest.mark.skipif(not (MODEL_EXISTS and PARQUET_EXISTS), reason="Requires model bundle and OSM/WRI parquet")
def test_calibrator_failure_falls_back_to_raw(monkeypatch):
    model_service.load_model()
    row = _sample_h3_day_row()
    monkeypatch.setattr(
        model_service,
        "calibrators",
        {cls: _BrokenCalibrator() for cls in model_service.model_classes},
    )
    response = model_service.predict(row)
    assert response.calibrated is False
    assert math.isclose(sum(p.probability for p in response.probabilities), 1.0, rel_tol=1e-6)
    assert response.predicted_class in EXPECTED_CLASSES | {"unclassified"}


def test_calendar_feature_parity_sql_vs_pandas():
    """The DuckDB seed derivation and the pandas aggregation formula must be
    numerically identical (1-indexed doy, 365.25-day period)."""
    dates = ["2024-01-01", "2024-03-28", "2024-12-31", "2025-03-01", "2025-07-15"]
    conn = duckdb.connect()
    try:
        sql_rows = conn.execute(
            """
            SELECT CAST(acq_date AS DATE) AS d,
                   month(CAST(acq_date AS DATE)) AS m,
                   sin(2 * pi() * dayofyear(CAST(acq_date AS DATE)) / 365.25) AS s,
                   cos(2 * pi() * dayofyear(CAST(acq_date AS DATE)) / 365.25) AS c
            FROM (SELECT unnest(?::DATE[]) AS acq_date)
            """,
            [dates],
        ).fetchall()
    finally:
        conn.close()
    for (d, m, s, c), date_str in zip(sql_rows, dates):
        expected = _calendar_features(date_str)
        assert int(m) == expected["acq_month"]
        assert np.isclose(float(s), expected["doy_sin"])
        assert np.isclose(float(c), expected["doy_cos"])
