from __future__ import annotations

import hashlib
import time
from pathlib import Path
from threading import Lock
from typing import Any

import h3 as h3lib
import numpy as np
import pandas as pd
from catboost import CatBoostClassifier, Pool

from app.core.config import settings
from app.schemas.prediction import (
    CellPredictionDetailResponse,
    ClassProbability,
    ExplanationResponse,
    FeatureAttribution,
    PredictionResponse,
    ViewportPredictionsResponse,
)
from app.services.explanation import (
    active_caveats,
    humanize_feature,
    top_human_features,
)
from app.services.feature_store import feature_store
from pipeline.feature_engineering import latlng_to_h3


class CatBoostModelService:
    """Inference service for Dhruv's real PS26162 H3-day CatBoost model."""

    def __init__(self, model_path: str = settings.MODEL_PATH):
        self.model_path = model_path
        self.model: CatBoostClassifier | None = None
        self.is_loaded = False
        self.model_version = settings.FEATURE_SCHEMA_VERSION
        self.startup_latency_ms: float | None = None
        self.model_classes: list[str] = []
        self._lock = Lock()

    def load_model(self) -> None:
        with self._lock:
            if self.is_loaded:
                return
            started = time.time()
            path = Path(self.model_path)
            if not path.exists():
                raise FileNotFoundError(f"Missing CatBoost model artifact: {path}")

            model = CatBoostClassifier()
            model.load_model(str(path))
            self._assert_contract(model)
            self.model = model
            self.model_classes = [str(cls) for cls in model.classes_]
            self.is_loaded = True
            self.startup_latency_ms = round((time.time() - started) * 1000, 2)

    def _assert_contract(self, model: CatBoostClassifier) -> None:
        feature_names = list(model.feature_names_)
        if feature_names != settings.MODEL_FEATURES:
            raise ValueError(
                f"Model feature contract mismatch: expected {len(settings.MODEL_FEATURES)} exact features, "
                f"got {len(feature_names)}"
            )

        cat_names = [feature_names[idx] for idx in model.get_cat_feature_indices()]
        if cat_names != settings.CAT_FEATURES:
            raise ValueError(f"Model categorical contract mismatch: expected {settings.CAT_FEATURES}, got {cat_names}")

        model_classes = [str(cls) for cls in model.classes_]
        if set(model_classes) != set(settings.TARGET_CLASSES) or len(model_classes) != 4:
            raise ValueError(f"Model class contract mismatch: expected {settings.TARGET_CLASSES}, got {model_classes}")

    def _schema_hash(self) -> str:
        joined = "\n".join(settings.MODEL_FEATURES + settings.CAT_FEATURES + settings.TARGET_CLASSES)
        return hashlib.sha256(joined.encode("utf-8")).hexdigest()[:16]

    def _prepare_pool(self, features: dict[str, Any]) -> Pool:
        missing = [col for col in settings.MODEL_FEATURES if col not in features]
        if missing:
            raise ValueError(f"Missing model features: {missing[:8]}")

        row = {col: features[col] for col in settings.MODEL_FEATURES}
        frame = pd.DataFrame([row], columns=settings.MODEL_FEATURES)
        for col in settings.CAT_FEATURES:
            frame[col] = frame[col].astype("string").fillna("missing").astype(str)

        for col in frame.columns:
            if col in settings.CAT_FEATURES:
                continue
            if frame[col].dtype == bool:
                frame[col] = frame[col].astype("int8")
            else:
                frame[col] = pd.to_numeric(frame[col], errors="coerce")

        numeric = frame.drop(columns=settings.CAT_FEATURES)
        if np.isinf(numeric.to_numpy(dtype=float, na_value=np.nan)).any():
            raise ValueError("Model features contain +/-inf values")

        return Pool(frame, cat_features=settings.CAT_FEATURES)

    def _coordinates(self, features: dict[str, Any]) -> tuple[float, float]:
        if features.get("h3_lat") is not None and features.get("h3_lon") is not None:
            return float(features["h3_lat"]), float(features["h3_lon"])
        return tuple(float(v) for v in h3lib.cell_to_latlng(str(features["h3_08"])))

    def _apply_confidence_policy(self, predicted_class: str, confidence: float) -> tuple[str, str | None]:
        if settings.UNCLASSIFIED_THRESHOLD is not None and confidence < settings.UNCLASSIFIED_THRESHOLD:
            return "unclassified", f"Low confidence below configured UNCLASSIFIED_THRESHOLD={settings.UNCLASSIFIED_THRESHOLD:.3f}"
        if predicted_class == "mining":
            return predicted_class, settings.CAVEAT_MANIFEST["mining_low_support"]
        return predicted_class, None

    def _probabilities(self, prob_row: np.ndarray) -> list[ClassProbability]:
        return [
            ClassProbability(class_name=class_name, probability=round(float(prob), 6))
            for class_name, prob in zip(self.model_classes, prob_row)
        ]

    def predict(self, cell_features: dict[str, Any]) -> PredictionResponse:
        self.load_model()
        started = time.time()
        pool = self._prepare_pool(cell_features)
        prob_row = self.model.predict_proba(pool)[0]
        predicted_idx = int(np.argmax(prob_row))
        raw_class = self.model_classes[predicted_idx]
        confidence = float(prob_row[predicted_idx])
        predicted_class, caveat = self._apply_confidence_policy(raw_class, confidence)
        lat, lon = self._coordinates(cell_features)

        return PredictionResponse(
            cell_id=str(cell_features["h3_08"]),
            latitude=lat,
            longitude=lon,
            h3_index=str(cell_features["h3_08"]),
            predicted_class=predicted_class,
            probabilities=self._probabilities(prob_row),
            confidence=round(confidence, 6),
            caveat_flag=caveat,
            latency_ms=round((time.time() - started) * 1000, 2),
        )

    def explain(self, cell_features: dict[str, Any], predicted_class: str | None = None) -> ExplanationResponse:
        self.load_model()
        started = time.time()
        pool = self._prepare_pool(cell_features)
        prob_row = self.model.predict_proba(pool)[0]
        predicted_idx = int(np.argmax(prob_row))
        raw_class = self.model_classes[predicted_idx]
        if predicted_class in self.model_classes:
            predicted_idx = self.model_classes.index(predicted_class)
            raw_class = predicted_class
        confidence = float(prob_row[predicted_idx])
        final_class, policy_caveat = self._apply_confidence_policy(raw_class, confidence)
        active_list = active_caveats(final_class)
        if policy_caveat:
            caveat_list = [policy_caveat] + [c for c in active_list if c != policy_caveat]
        else:
            caveat_list = active_list
        caveat_str = " | ".join(caveat_list) if caveat_list else None
        shap_values = self.model.get_feature_importance(type="ShapValues", data=pool)

        if shap_values.ndim == 3 and shap_values.shape[1] == len(self.model_classes):
            class_shap = shap_values[0, predicted_idx, :]
        elif shap_values.ndim == 3:
            class_shap = shap_values[0, :, predicted_idx]
        else:
            class_shap = shap_values[0, :]

        base_value = float(class_shap[-1])
        attributions = []
        for feature_name, shap_value in zip(settings.MODEL_FEATURES, class_shap[:-1]):
            feature_value = cell_features.get(feature_name)
            description = humanize_feature(feature_name, feature_value)
            attributions.append(
                FeatureAttribution(
                    feature_name=feature_name,
                    feature_value=str(feature_value),
                    shap_value=round(float(shap_value), 6),
                    contribution="increases" if shap_value > 0 else "decreases",
                    description=description,
                )
            )
        attributions.sort(key=lambda attr: abs(attr.shap_value), reverse=True)
        top_features = top_human_features(attributions, top_n=3)

        return ExplanationResponse(
            cell_id=str(cell_features["h3_08"]),
            h3_index=str(cell_features["h3_08"]),
            predicted_class=final_class,
            confidence=round(confidence, 6),
            probabilities=self._probabilities(prob_row),
            base_value=round(base_value, 6),
            feature_attributions=attributions[:3],
            top_features=top_features,
            caveat_flag=caveat_str,
            summary_statement=f"Top drivers for {final_class}: {', '.join(top_features)}.",
            latency_ms=round((time.time() - started) * 1000, 2),
        )

    def health(self) -> dict[str, Any]:
        return {
            "model_loaded": self.is_loaded,
            "schema_version": settings.FEATURE_SCHEMA_VERSION,
            "schema_hash": self._schema_hash(),
            "model_path": self.model_path,
            "startup_latency_ms": self.startup_latency_ms,
            "target_classes": settings.TARGET_CLASSES,
        }

    def predict_single(self, record_dict: dict[str, Any]) -> PredictionResponse:
        h3_index = record_dict.get("h3_08") or record_dict.get("h3_index")
        if not h3_index and "latitude" in record_dict and "longitude" in record_dict:
            h3_index = latlng_to_h3(float(record_dict["latitude"]), float(record_dict["longitude"]), settings.H3_RESOLUTION)
        acq_date = str(record_dict.get("acq_date", ""))[:10]
        cell = feature_store.get_cell(str(h3_index), acq_date) if h3_index and acq_date else None
        if not cell:
            raise ValueError(f"No H3-day features found for h3_08={h3_index}, acq_date={acq_date}")
        return self.predict(cell)

    def explain_single(self, record_dict: dict[str, Any]) -> ExplanationResponse:
        h3_index = record_dict.get("h3_08") or record_dict.get("h3_index")
        if not h3_index and "latitude" in record_dict and "longitude" in record_dict:
            h3_index = latlng_to_h3(float(record_dict["latitude"]), float(record_dict["longitude"]), settings.H3_RESOLUTION)
        acq_date = str(record_dict.get("acq_date", ""))[:10]
        cell = feature_store.get_cell(str(h3_index), acq_date) if h3_index and acq_date else None
        if not cell:
            raise ValueError(f"No H3-day features found for h3_08={h3_index}, acq_date={acq_date}")
        return self.explain(cell)

    def get_cell_detail(self, cell_id: str, acq_date: str) -> CellPredictionDetailResponse:
        cell = feature_store.get_cell(cell_id, acq_date)
        if not cell:
            raise ValueError(f"No H3-day features found for h3_08={cell_id}, acq_date={acq_date}")
        prediction = self.predict(cell)
        explanation = self.explain(cell, predicted_class=prediction.predicted_class)
        pred_dict = prediction.model_dump()
        pred_dict["caveat_flag"] = explanation.caveat_flag
        return CellPredictionDetailResponse(
            **pred_dict,
            feature_attributions=explanation.feature_attributions,
            top_features=explanation.top_features,
            context=cell,
        )

    def get_viewport_predictions(
        self,
        min_lat: float,
        max_lat: float,
        min_lon: float,
        max_lon: float,
        acq_date: str,
        zoom: float = 8.0,
    ) -> ViewportPredictionsResponse:
        mode = "aggregated_macro" if (max_lat - min_lat > 20.0 or max_lon - min_lon > 20.0) else "detailed_hexagons"
        rows = feature_store.query_bbox(min_lat, max_lat, min_lon, max_lon, acq_date)
        predictions = [self.predict(row) for row in rows]
        return ViewportPredictionsResponse(
            mode=mode,
            zoom=zoom,
            total_predictions=len(predictions),
            predictions=predictions,
        )


model_service = CatBoostModelService()
