from __future__ import annotations

import hashlib
import json
import logging
import time
from pathlib import Path
from threading import Lock
from typing import Any

import h3 as h3lib
import joblib
import numpy as np
import pandas as pd
from catboost import CatBoostClassifier, Pool
from sklearn.isotonic import IsotonicRegression

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

logger = logging.getLogger(__name__)

_BUNDLE_FILES = ("feature_schema.json", "calibrators.joblib", "review_thresholds.json")
# Values for PredictionResponse.geography (app.schemas.prediction.Geography).
GEO_TRAINING = "training_geography"
GEO_OUTSIDE_TRAINING = "india_outside_training"
GEO_OUTSIDE_INDIA = "outside_india"
_OUTSIDE_INDIA_STATE = "Outside India"  # matches ingestion.osm_wri_load.OUTSIDE_INDIA_STATE


def classify_persistence(cell_features: dict[str, Any]) -> dict[str, str | None]:
    """Classify recent persistence using upstream FIRMS and rolling features."""
    static_flag = cell_features.get("is_static_land", -1)
    if static_flag is None or (
        isinstance(static_flag, (float, np.floating)) and np.isnan(static_flag)
    ):
        static_flag = -1

    active_days_7d = cell_features.get("active_days_7d", 0)
    if active_days_7d is None or (
        isinstance(active_days_7d, (float, np.floating)) and np.isnan(active_days_7d)
    ):
        active_days_7d = 0

    active_days_30d = cell_features.get("active_days_30d", 0)
    if active_days_30d is None or (
        isinstance(active_days_30d, (float, np.floating)) and np.isnan(active_days_30d)
    ):
        active_days_30d = 0

    if static_flag == 1:
        return {
            "event_type": "persistent_source",
            "description": (
                "Recurring detection at this location (FIRMS static-source "
                "classification) — consistent with a flare, plant, or other "
                "continuously operating industrial heat source, not a discrete "
                "fire event."
            ),
        }

    if static_flag == -1:
        return {
            "event_type": "unknown_provenance",
            "description": "Static-source status unresolved for this detection.",
        }

    if (
        active_days_7d <= 1
        and active_days_30d <= 3
    ):
        return {
            "event_type": "new_event",
            "description": "Fresh activity, no recurring history at this location.",
        }

    return {"event_type": "ambiguous", "description": None}


def classify_mining_subtype(
    cell_features: dict[str, Any],
) -> dict[str, str | float] | None:
    """Classify mining context from nearest mapped underground/surface features."""
    mineshaft = cell_features.get("dist_osm_mineshaft_km")
    adit = cell_features.get("dist_osm_adit_km")
    quarry = cell_features.get("dist_osm_quarry_km")
    underground = [
        value
        for value in (mineshaft, adit)
        if value is not None and pd.notna(value)
    ]
    underground_dist = min(underground) if underground else None
    quarry_available = quarry is not None and pd.notna(quarry)

    if underground_dist is None and not quarry_available:
        return None
    if underground_dist is not None and (
        not quarry_available or underground_dist < quarry
    ):
        return {"subtype": "underground", "nearest_km": float(underground_dist)}
    return {"subtype": "surface", "nearest_km": float(quarry)}


class CatBoostModelService:
    """Inference service for Dhruv's real PS26162 H3-day CatBoost model."""

    def __init__(self, model_path: str = settings.MODEL_PATH):
        self.model_path = model_path
        self.bundle_dir = settings.INFERENCE_BUNDLE_DIR
        self.model: CatBoostClassifier | None = None
        self.is_loaded = False
        self.model_version = settings.FEATURE_SCHEMA_VERSION
        self.startup_latency_ms: float | None = None
        self.model_classes: list[str] = []
        self.calibrators: dict[str, IsotonicRegression] | None = None
        self.review_thresholds: dict[str, float] = {}
        # States the bundle was trained/evaluated on (defaults to the config
        # constant; overridden from model_metadata.json at load time). Used
        # ONLY for provenance labeling — never to exclude rows from serving.
        self.training_geography_states: set[str] = set(settings.TRAINING_GEOGRAPHY_STATES)
        self._lock = Lock()

    def load_model(self) -> None:
        with self._lock:
            if self.is_loaded:
                return
            started = time.time()
            bundle = Path(self.bundle_dir)
            cbm_files = sorted(bundle.glob("*.cbm"))
            if not cbm_files:
                raise FileNotFoundError(f"No .cbm artifact found in inference bundle: {bundle}")
            missing = [name for name in _BUNDLE_FILES if not (bundle / name).exists()]
            if missing:
                raise FileNotFoundError(f"Missing inference bundle artifacts {missing} in {bundle}")

            model = CatBoostClassifier()
            model.load_model(str(cbm_files[0]))
            self.model_path = str(cbm_files[0])
            self._assert_contract(model)

            schema = json.loads((bundle / "feature_schema.json").read_text(encoding="utf-8"))
            schema_features = list(schema["feature_cols"])
            if not (schema_features == list(model.feature_names_) == settings.MODEL_FEATURES):
                raise ValueError(
                    "Three-way feature contract mismatch: model, feature_schema.json and "
                    "settings.MODEL_FEATURES must agree exactly"
                )
            # Enforce exact ordered match for categorical features across model, config, and schema
            if list(schema.get("cat_features", [])) != settings.CAT_FEATURES:
                raise ValueError(f"Bundle cat_features mismatch: expected {settings.CAT_FEATURES}, got {schema.get('cat_features')}")
            if set(schema.get("target_classes", [])) != set(settings.TARGET_CLASSES):
                raise ValueError(f"Bundle target_classes mismatch: {schema.get('target_classes')}")

            calibrators = joblib.load(bundle / "calibrators.joblib")
            # Trust boundary: calibrators.joblib is a first-party artifact from our
            # own Kaggle training run, loaded from the versioned bundle directory.
            # joblib.load must never be pointed at user-supplied files.
            if not isinstance(calibrators, dict) or set(calibrators) != set(settings.TARGET_CLASSES):
                raise ValueError(f"Calibrators must map every target class to an IsotonicRegression, got: {sorted(calibrators) if isinstance(calibrators, dict) else type(calibrators)}")
            probe = np.array([0.0, 0.5, 1.0])
            for cls, cal in calibrators.items():
                if not isinstance(cal, IsotonicRegression):
                    raise TypeError(f"Calibrator for {cls} is {type(cal).__name__}, expected IsotonicRegression")
                if not np.all(np.isfinite(cal.predict(probe))):
                    raise ValueError(f"Calibrator for {cls} returns non-finite output on [0,1] probe; check out_of_bounds setting")

            thresholds = json.loads((bundle / "review_thresholds.json").read_text(encoding="utf-8"))
            if not isinstance(thresholds, dict) or not thresholds:
                raise ValueError("review_thresholds.json must be a non-empty mapping")
            unknown = set(thresholds) - set(settings.TARGET_CLASSES)
            if unknown:
                raise ValueError(f"review_thresholds.json has unknown classes: {sorted(unknown)}")
            if not all(isinstance(v, (int, float)) for v in thresholds.values()):
                raise ValueError("review_thresholds.json values must be numeric")

            self._check_runtime_versions(bundle)
            self._load_training_geography(bundle)

            self.model = model
            self.model_classes = [str(cls) for cls in model.classes_]
            self.calibrators = calibrators
            self.review_thresholds = {k: float(v) for k, v in thresholds.items()}
            self.is_loaded = True
            self.startup_latency_ms = round((time.time() - started) * 1000, 2)

    def _load_training_geography(self, bundle: Path) -> None:
        """Read the train/eval state partition from the bundle metadata.

        The union of train/test_a/test_b states defines the geography the
        model's reported metrics actually cover. Missing metadata is warn-only:
        the config constant stays in force.
        """
        meta_path = bundle.parent / "model_metadata.json"
        if not meta_path.exists():
            logger.warning("model_metadata.json not found next to bundle %s — using config training states", bundle)
            return
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            states = {
                s for key in ("train_states", "test_a_states", "test_b_states") for s in meta.get(key, [])
            }
            if states:
                self.training_geography_states = states
        except (OSError, json.JSONDecodeError):
            logger.warning("Could not parse %s — using config training states", meta_path, exc_info=True)

    def _geography(self, cell_features: dict[str, Any]) -> str | None:
        state = cell_features.get("state")
        if not isinstance(state, str) or not state:
            return None
        if state == _OUTSIDE_INDIA_STATE:
            return GEO_OUTSIDE_INDIA
        return GEO_TRAINING if state in self.training_geography_states else GEO_OUTSIDE_TRAINING

    def _check_runtime_versions(self, bundle: Path) -> None:
        """Warn (never fail) when serving versions drift from the training runtime."""
        versions_file = bundle / "runtime_versions.json"
        if not versions_file.exists():
            return
        recorded = json.loads(versions_file.read_text(encoding="utf-8"))
        import sys

        import catboost
        import sklearn

        installed = {
            "python": ".".join(str(v) for v in sys.version_info[:2]),
            "catboost": catboost.__version__,
            "scikit-learn": sklearn.__version__,
        }
        for key, expected in recorded.items():
            actual = installed.get(key)
            if actual is None:
                continue
            if key == "python":
                # Compare major.minor to avoid false warnings across patch releases (e.g. 3.12.10 vs 3.12.13)
                actual_cmp = actual
                expected_cmp = ".".join(str(expected).split(".")[:2])
            else:
                actual_cmp = actual
                expected_cmp = str(expected)
            if actual_cmp != expected_cmp:
                logger.warning("Runtime version drift for %s: bundle=%s serving=%s", key, expected, actual)

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
        # Abstention policy, enabled via UNCLASSIFIED_THRESHOLD (.env is loaded
        # by app.core.config; unset disables abstention).
        if settings.UNCLASSIFIED_THRESHOLD is not None and confidence < settings.UNCLASSIFIED_THRESHOLD:
            return "unclassified", f"Low confidence below configured UNCLASSIFIED_THRESHOLD={settings.UNCLASSIFIED_THRESHOLD:.3f}"
        if predicted_class == "mining":
            return predicted_class, settings.CAVEAT_MANIFEST["mining_low_support"]
        return predicted_class, None

    def _calibrate(self, raw_row: np.ndarray) -> tuple[np.ndarray, bool]:
        """Map raw per-class probabilities through the bundle's isotonic calibrators.

        Per-class one-vs-rest isotonic outputs do not sum to 1, so they are
        renormalized. Falls back to the raw probabilities whenever the
        calibrated vector is non-finite or degenerate (isotonic with
        out_of_bounds='nan' can emit NaN for raw probs outside its fit range).
        """
        assert self.calibrators is not None
        calibrated = np.array(
            [float(self.calibrators[cls].predict([float(p)])[0]) for cls, p in zip(self.model_classes, raw_row)]
        )
        total = calibrated.sum()
        if not np.all(np.isfinite(calibrated)) or total <= 0.0:
            return raw_row.astype(float), False
        return calibrated / total, True

    def _needs_review(self, raw_class: str, confidence: float, final_class: str) -> bool:
        """Review gate is evaluated against the pre-policy class so that
        'unclassified' rows (which have no threshold entry) can never escape
        review via a .get() default."""
        if final_class == "unclassified":
            return True
        threshold = self.review_thresholds.get(raw_class)
        return threshold is not None and confidence < threshold

    def _compose_caveats(
        self, policy_caveat: str | None, needs_review: bool, outside_training: bool = False
    ) -> str | None:
        parts = []
        if outside_training:
            parts.append(settings.CAVEAT_MANIFEST["outside_training_geography"])
        if policy_caveat:
            parts.append(policy_caveat)
        if needs_review:
            parts.append(settings.CAVEAT_MANIFEST["low_confidence_review"])
        return " | ".join(parts) if parts else None

    def _probabilities(self, prob_row: np.ndarray) -> list[ClassProbability]:
        return [
            ClassProbability(class_name=class_name, probability=round(float(prob), 6))
            for class_name, prob in zip(self.model_classes, prob_row)
        ]

    def predict(self, cell_features: dict[str, Any]) -> PredictionResponse:
        self.load_model()
        started = time.time()
        pool = self._prepare_pool(cell_features)
        raw_row = self.model.predict_proba(pool)[0]
        prob_row, calibrated = self._calibrate(raw_row)
        predicted_idx = int(np.argmax(prob_row))
        raw_class = self.model_classes[predicted_idx]
        confidence = float(prob_row[predicted_idx])
        predicted_class, policy_caveat = self._apply_confidence_policy(raw_class, confidence)
        geography = self._geography(cell_features)
        outside_training = geography == GEO_OUTSIDE_TRAINING
        needs_review = self._needs_review(raw_class, confidence, predicted_class) or outside_training
        caveat = self._compose_caveats(policy_caveat, needs_review, outside_training)
        lat, lon = self._coordinates(cell_features)

        return PredictionResponse(
            cell_id=str(cell_features["h3_08"]),
            latitude=lat,
            longitude=lon,
            h3_index=str(cell_features["h3_08"]),
            predicted_class=predicted_class,
            probabilities=self._probabilities(prob_row),
            confidence=round(confidence, 6),
            calibrated=calibrated,
            needs_review=needs_review,
            caveat_flag=caveat,
            state=cell_features.get("state") if isinstance(cell_features.get("state"), str) else None,
            geography=geography,
            latency_ms=round((time.time() - started) * 1000, 2),
        )

    def explain(self, cell_features: dict[str, Any], predicted_class: str | None = None) -> ExplanationResponse:
        """Explain model prediction for a cell via SHAP values.

        Note: This intentionally re-runs inference for isolation and independence,
        allowing the explain endpoint to be invoked standalone without cached state.
        """
        self.load_model()
        started = time.time()
        pool = self._prepare_pool(cell_features)
        raw_row = self.model.predict_proba(pool)[0]
        prob_row, _ = self._calibrate(raw_row)
        predicted_idx = int(np.argmax(prob_row))
        raw_class = self.model_classes[predicted_idx]
        if predicted_class in self.model_classes:
            predicted_idx = self.model_classes.index(predicted_class)
            raw_class = predicted_class
        confidence = float(prob_row[predicted_idx])
        final_class, policy_caveat = self._apply_confidence_policy(raw_class, confidence)
        geography = self._geography(cell_features)
        outside_training = geography == GEO_OUTSIDE_TRAINING
        needs_review = self._needs_review(raw_class, confidence, final_class) or outside_training
        geo_caveat = settings.CAVEAT_MANIFEST["outside_training_geography"] if outside_training else None
        active_list = active_caveats(final_class)
        caveat_list = []
        for caveat in (
            geo_caveat,
            policy_caveat,
            settings.CAVEAT_MANIFEST["low_confidence_review"] if needs_review else None,
            *active_list,
        ):
            if caveat and caveat not in caveat_list:
                caveat_list.append(caveat)
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
        persistence = classify_persistence(cell_features)
        mining_subtype = (
            classify_mining_subtype(cell_features)
            if final_class == "mining"
            else None
        )
        summary_statement = f"Top drivers for {final_class}: {', '.join(top_features)}."
        if persistence["event_type"] != "ambiguous":
            summary_statement = f"{summary_statement} {persistence['description']}"

        return ExplanationResponse(
            cell_id=str(cell_features["h3_08"]),
            h3_index=str(cell_features["h3_08"]),
            predicted_class=final_class,
            confidence=round(confidence, 6),
            probabilities=self._probabilities(prob_row),
            base_value=round(base_value, 6),
            feature_attributions=attributions[:3],
            top_features=top_features,
            persistence=persistence,
            mining_subtype=mining_subtype,
            caveat_flag=caveat_str,
            summary_statement=summary_statement,
            latency_ms=round((time.time() - started) * 1000, 2),
        )

    def health(self) -> dict[str, Any]:
        try:
            latest_acq_date = feature_store.latest_acq_date()
        except Exception:
            logger.warning("health(): could not read latest acq_date (store not seeded?)", exc_info=True)
            latest_acq_date = None
        return {
            "model_loaded": self.is_loaded,
            "schema_version": settings.FEATURE_SCHEMA_VERSION,
            "schema_hash": self._schema_hash(),
            "model_path": self.model_path,
            "bundle_dir": self.bundle_dir,
            "calibrators_loaded": self.calibrators is not None,
            "review_thresholds": dict(self.review_thresholds) if self.review_thresholds else None,
            "startup_latency_ms": self.startup_latency_ms,
            "target_classes": settings.TARGET_CLASSES,
            "latest_acq_date": latest_acq_date,
        }

    def _with_state(self, cell_features: dict[str, Any]) -> dict[str, Any]:
        """Attach state provenance from the feature store side-map.

        query_bbox/get_cell rows carry only model features + coordinates; the
        (state, state_assignment_method) provenance lives in the store's
        side-map built from the same static parquet.
        """
        info = feature_store.get_state(str(cell_features.get("h3_08", "")))
        if info:
            cell_features.setdefault("state", info[0])
            cell_features.setdefault("state_assignment_method", info[1])
        return cell_features

    def predict_single(self, record_dict: dict[str, Any]) -> PredictionResponse:
        h3_index = record_dict.get("h3_08") or record_dict.get("h3_index")
        if not h3_index and "latitude" in record_dict and "longitude" in record_dict:
            h3_index = latlng_to_h3(float(record_dict["latitude"]), float(record_dict["longitude"]), settings.H3_RESOLUTION)
        acq_date = str(record_dict.get("acq_date", ""))[:10]
        cell = feature_store.get_cell(str(h3_index), acq_date) if h3_index and acq_date else None
        if not cell:
            raise ValueError(f"No H3-day features found for h3_08={h3_index}, acq_date={acq_date}")
        return self.predict(self._with_state(cell))

    def explain_single(self, record_dict: dict[str, Any]) -> ExplanationResponse:
        h3_index = record_dict.get("h3_08") or record_dict.get("h3_index")
        if not h3_index and "latitude" in record_dict and "longitude" in record_dict:
            h3_index = latlng_to_h3(float(record_dict["latitude"]), float(record_dict["longitude"]), settings.H3_RESOLUTION)
        acq_date = str(record_dict.get("acq_date", ""))[:10]
        cell = feature_store.get_cell(str(h3_index), acq_date) if h3_index and acq_date else None
        if not cell:
            raise ValueError(f"No H3-day features found for h3_08={h3_index}, acq_date={acq_date}")
        return self.explain(self._with_state(cell))

    def get_cell_detail(self, cell_id: str, acq_date: str) -> CellPredictionDetailResponse:
        cell = feature_store.get_cell(cell_id, acq_date)
        if not cell:
            raise ValueError(f"No H3-day features found for h3_08={cell_id}, acq_date={acq_date}")
        cell = self._with_state(cell)
        prediction = self.predict(cell)
        explanation = self.explain(cell, predicted_class=prediction.predicted_class)
        pred_dict = prediction.model_dump()
        # Merge rather than overwrite: the prediction may carry the review
        # caveat which must survive onto the detail endpoint.
        merged = []
        for caveat in (pred_dict["caveat_flag"], explanation.caveat_flag):
            if caveat:
                for part in caveat.split(" | "):
                    if part and part not in merged:
                        merged.append(part)
        pred_dict["caveat_flag"] = " | ".join(merged) if merged else None
        return CellPredictionDetailResponse(
            **pred_dict,
            feature_attributions=explanation.feature_attributions,
            top_features=explanation.top_features,
            context=cell,
        )

    def _prepare_batch_pool(self, rows: list[dict[str, Any]]) -> Pool:
        if not rows:
            return Pool(pd.DataFrame(columns=settings.MODEL_FEATURES), cat_features=settings.CAT_FEATURES)

        frame = pd.DataFrame(rows)
        missing = [col for col in settings.MODEL_FEATURES if col not in frame.columns]
        if missing:
            raise ValueError(f"Missing model features: {missing[:8]}")

        frame = frame[settings.MODEL_FEATURES].copy()
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

    def _calibrate_batch(self, raw_probs: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Vectorized calibration across all N rows."""
        assert self.calibrators is not None
        n_samples = raw_probs.shape[0]
        if n_samples == 0:
            return raw_probs.astype(float), np.zeros(0, dtype=bool)

        calibrated_cols = []
        for cls in self.model_classes:
            cal = self.calibrators[cls]
            col_idx = self.model_classes.index(cls)
            col_pred = cal.predict(raw_probs[:, col_idx])
            calibrated_cols.append(col_pred)

        calibrated_matrix = np.column_stack(calibrated_cols).astype(float)
        totals = np.sum(calibrated_matrix, axis=1)

        valid_mask = np.all(np.isfinite(calibrated_matrix), axis=1) & (totals > 0.0)

        out_probs = np.empty_like(raw_probs, dtype=float)
        is_calibrated = np.zeros(n_samples, dtype=bool)

        if np.any(valid_mask):
            out_probs[valid_mask] = calibrated_matrix[valid_mask] / totals[valid_mask, np.newaxis]
            is_calibrated[valid_mask] = True

        if np.any(~valid_mask):
            out_probs[~valid_mask] = raw_probs[~valid_mask].astype(float)
            is_calibrated[~valid_mask] = False

        return out_probs, is_calibrated

    def predict_batch(self, rows: list[dict[str, Any]]) -> list[PredictionResponse]:
        """Batched vector-accelerated prediction for viewport queries."""
        if not rows:
            return []
        self.load_model()
        started = time.time()

        pool = self._prepare_batch_pool(rows)
        raw_probs = self.model.predict_proba(pool)
        prob_matrix, calibrated_flags = self._calibrate_batch(raw_probs)

        batch_latency = round((time.time() - started) * 1000, 2)
        row_latency = round(batch_latency / len(rows), 2)

        predictions: list[PredictionResponse] = []
        for cell_features, prob_row, is_cal in zip(rows, prob_matrix, calibrated_flags):
            predicted_idx = int(np.argmax(prob_row))
            raw_class = self.model_classes[predicted_idx]
            confidence = float(prob_row[predicted_idx])
            predicted_class, policy_caveat = self._apply_confidence_policy(raw_class, confidence)
            geography = self._geography(cell_features)
            outside_training = geography == GEO_OUTSIDE_TRAINING
            needs_review = self._needs_review(raw_class, confidence, predicted_class) or outside_training
            caveat = self._compose_caveats(policy_caveat, needs_review, outside_training)
            lat, lon = self._coordinates(cell_features)

            predictions.append(
                PredictionResponse(
                    cell_id=str(cell_features["h3_08"]),
                    latitude=lat,
                    longitude=lon,
                    h3_index=str(cell_features["h3_08"]),
                    predicted_class=predicted_class,
                    probabilities=self._probabilities(prob_row),
                    confidence=round(confidence, 6),
                    calibrated=bool(is_cal),
                    needs_review=needs_review,
                    caveat_flag=caveat,
                    state=cell_features.get("state") if isinstance(cell_features.get("state"), str) else None,
                    geography=geography,
                    latency_ms=row_latency,
                )
            )

        return predictions

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
        rows = [self._with_state(row) for row in rows]
        predictions = self.predict_batch(rows)
        return ViewportPredictionsResponse(
            mode=mode,
            zoom=zoom,
            total_predictions=len(predictions),
            predictions=predictions,
        )


model_service = CatBoostModelService()
