import os
import time
import pandas as pd
import numpy as np
from catboost import CatBoostClassifier, Pool
from typing import Dict, Any, List, Tuple
from app.core.config import settings
from pipeline.feature_engineering import engineer_features, latlng_to_h3
from app.services.feature_store import feature_store
from app.schemas.prediction import HotspotPredictionResponse, ClassProbability, ExplanationResponse, FeatureAttribution

class CatBoostModelService:
    """
    Inference & SHAP Explainability service for NTRO Hotspot Classification.
    """
    def __init__(self, model_path: str = settings.MODEL_PATH):
        self.model_path = model_path
        self.model: CatBoostClassifier = None
        self.is_loaded = False
        self._load_model()

    def _load_model(self):
        if os.path.exists(self.model_path):
            self.model = CatBoostClassifier()
            self.model.load_model(self.model_path)
            self.is_loaded = True
            print(f"[Model Service] Loaded CatBoost model from {self.model_path}")
        else:
            print(f"[Model Service] Warning: Model file {self.model_path} not found. Needs training.")

    def predict_single(self, record_dict: Dict[str, Any]) -> HotspotPredictionResponse:
        """Run real-time inference with sub-50ms latency target."""
        start_time = time.time()
        
        # 1. Convert to DataFrame and compute H3 index
        df_raw = pd.DataFrame([record_dict])
        lat = float(record_dict["latitude"])
        lon = float(record_dict["longitude"])
        h3_idx = latlng_to_h3(lat, lon, settings.H3_RESOLUTION)
        
        # 2. Enrich with pre-computed spatial context from DuckDB
        context = feature_store.get_context_for_h3(h3_idx)
        for k, v in context.items():
            df_raw[k] = v
            
        # 3. Engineer features
        df_feat = engineer_features(df_raw)
        feature_cols = settings.CAT_FEATURES + settings.NUM_FEATURES
        X = df_feat[feature_cols]

        if not self.is_loaded:
            # Fallback heuristic if model not yet trained
            predicted_idx = 0
            probs = [1.0 if i == 0 else 0.0 for i in range(len(settings.TARGET_CLASSES))]
        else:
            pool = Pool(X, cat_features=settings.CAT_FEATURES)
            prob_matrix = self.model.predict_proba(pool)[0]
            predicted_idx = int(np.argmax(prob_matrix))
            probs = [float(p) for p in prob_matrix]

        predicted_class = settings.TARGET_CLASSES[predicted_idx]
        confidence = round(probs[predicted_idx] * 100, 2)
        latency_ms = round((time.time() - start_time) * 1000, 2)

        prob_list = [
            ClassProbability(class_name=settings.TARGET_CLASSES[i], probability=round(probs[i], 4))
            for i in range(len(settings.TARGET_CLASSES))
        ]

        return HotspotPredictionResponse(
            hotspot_id=str(record_dict.get("hotspot_id", f"H3-{h3_idx}")),
            latitude=lat,
            longitude=lon,
            h3_index=h3_idx,
            predicted_class=predicted_class,
            confidence=confidence,
            probabilities=prob_list,
            latency_ms=latency_ms,
            context=context
        )

    def explain_single(self, record_dict: Dict[str, Any]) -> ExplanationResponse:
        """Compute on-demand per-instance SHAP feature attributions."""
        df_raw = pd.DataFrame([record_dict])
        lat = float(record_dict["latitude"])
        lon = float(record_dict["longitude"])
        h3_idx = latlng_to_h3(lat, lon, settings.H3_RESOLUTION)
        
        context = feature_store.get_context_for_h3(h3_idx)
        for k, v in context.items():
            df_raw[k] = v

        df_feat = engineer_features(df_raw)
        feature_cols = settings.CAT_FEATURES + settings.NUM_FEATURES
        X = df_feat[feature_cols]

        if not self.is_loaded:
            return ExplanationResponse(
                hotspot_id=str(record_dict.get("hotspot_id", f"H3-{h3_idx}")),
                predicted_class="Wildfire",
                base_value=0.0,
                feature_attributions=[],
                summary_statement="Model not yet trained."
            )

        pool = Pool(X, cat_features=settings.CAT_FEATURES)
        probs = self.model.predict_proba(pool)[0]
        predicted_idx = int(np.argmax(probs))
        predicted_class = settings.TARGET_CLASSES[predicted_idx]

        # Compute SHAP values for tree-based CatBoost
        # Shape: (1, n_features + 1, n_classes) or (1, n_features + 1)
        shap_raw = self.model.get_feature_importance(type="ShapValues", data=pool)
        
        if len(shap_raw.shape) == 3:
            # Multi-class output: select slice for predicted class
            class_shap = shap_raw[0, :, predicted_idx]
        else:
            class_shap = shap_raw[0, :]

        base_value = float(class_shap[-1]) # Expected value is in last position
        feature_shap = class_shap[:-1]

        # Construct attributions
        attributions = []
        for feat_name, s_val in zip(feature_cols, feature_shap):
            feat_val_str = str(X[feat_name].iloc[0])
            attributions.append(FeatureAttribution(
                feature_name=feat_name,
                feature_value=feat_val_str,
                shap_value=round(float(s_val), 4),
                contribution="Increases Risk" if s_val > 0 else "Decreases Risk"
            ))

        # Sort by absolute SHAP impact
        attributions.sort(key=lambda x: abs(x.shap_value), reverse=True)

        top_drivers = [f"{a.feature_name} ({a.feature_value})" for a in attributions[:3] if a.shap_value > 0]
        drivers_str = ", ".join(top_drivers) if top_drivers else "standard contextual baseline"
        summary = f"This thermal anomaly was classified as '{predicted_class}' primarily driven by: {drivers_str}."

        return ExplanationResponse(
            hotspot_id=str(record_dict.get("hotspot_id", f"H3-{h3_idx}")),
            predicted_class=predicted_class,
            base_value=round(base_value, 4),
            feature_attributions=attributions,
            summary_statement=summary
        )

model_service = CatBoostModelService()
