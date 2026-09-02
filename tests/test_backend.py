import sys
from pathlib import Path

import numpy as np
import pandas as pd
from catboost import CatBoostClassifier, Pool
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
from app.main import app
from app.services.feature_store import feature_store


EXPECTED_CLASSES = {"industrial", "mining", "agricultural_burn", "wildfire"}


def _sample_h3_day_row() -> dict:
    df = pd.read_parquet(settings.OSMWRI_PARQUET)
    row = df.dropna(subset=["h3_08", "acq_date", "h3_lat", "h3_lon"]).iloc[0]
    payload = row.to_dict()
    payload["acq_date"] = str(pd.to_datetime(payload["acq_date"]).date())
    return payload


def _pool_from_row(row: dict) -> Pool:
    frame = pd.DataFrame([{col: row[col] for col in settings.MODEL_FEATURES}], columns=settings.MODEL_FEATURES)
    for col in settings.CAT_FEATURES:
        frame[col] = frame[col].astype("string").fillna("missing").astype(str)
    for col in frame.columns:
        if col not in settings.CAT_FEATURES:
            frame[col] = pd.to_numeric(frame[col], errors="coerce")
    return Pool(frame, cat_features=settings.CAT_FEATURES)


def test_real_model_contract():
    model = CatBoostClassifier()
    model.load_model(settings.MODEL_PATH)

    assert settings.H3_RESOLUTION == 8
    assert list(model.feature_names_) == settings.MODEL_FEATURES
    assert [model.feature_names_[idx] for idx in model.get_cat_feature_indices()] == settings.CAT_FEATURES
    assert set(str(cls) for cls in model.classes_) == EXPECTED_CLASSES


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


def test_health_predictions_and_explain_endpoints():
    row = _sample_h3_day_row()
    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200
        health_json = health.json()
        assert health_json["model_loaded"] is True
        assert health_json["schema_version"] == settings.FEATURE_SCHEMA_VERSION

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

        detail = client.get(f"/predictions/{row['h3_08']}", params={"acq_date": row["acq_date"]})
        assert detail.status_code == 200
        assert detail.json()["cell_id"] == row["h3_08"]

        explain = client.get(f"/predictions/{row['h3_08']}/explain", params={"acq_date": row["acq_date"]})
        assert explain.status_code == 200
        explain_json = explain.json()
        assert len(explain_json["feature_attributions"]) == 3
        assert explain_json["predicted_class"] in EXPECTED_CLASSES | {"unclassified"}
