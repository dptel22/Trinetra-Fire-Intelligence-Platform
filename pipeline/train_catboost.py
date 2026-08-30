"""
SYNTHETIC DEMO TRAINING PIPELINE
==================================
This script trains a CatBoost model on SYNTHETIC point-level data
for demo and API-testing purposes only.

IMPORTANT: This is NOT the production training pipeline.
The real training pipeline:
  - Uses 1.19M harmonized VIIRS rows (docs/eda-findings.md)
  - Applies the Phase 6 H3-day label bootstrap (52-column enriched schema)
  - Uses a state-based geographic train/test split
    (TRAIN: MH, KA, MP, PB, AP, TG | TEST A: GJ, TN | TEST B: JH, RJ)
  - Is managed by the ML Lead in a separate notebook/workspace.

This demo script: trains on synthetic 4-class point-level data only.
"""

import os
import sys
from pathlib import Path
import numpy as np
import pandas as pd
from catboost import CatBoostClassifier, Pool
from sklearn.metrics import accuracy_score, f1_score

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
from pipeline.feature_engineering import engineer_features
from pipeline.spatial_cv import SpatialKFold
from data.mock_generator import generate_mock_firms_data, init_duckdb_feature_store


def train_model():
    print("=" * 70)
    print("[SYNTHETIC DEMO] NTRO NASA FIRMS Hotspot Classifier")
    print("[SYNTHETIC DEMO] CatBoost Training Pipeline — 4-Class Taxonomy")
    print("=" * 70)

    # 1. Load or Generate Synthetic Dataset
    data_file = settings.DATA_DIR / "sample_firms.csv"
    if not os.path.exists(data_file):
        print("[SYNTHETIC DEMO] Creating synthetic FIRMS dataset...")
        raw_df = generate_mock_firms_data(n_samples=2500)
        raw_df.to_csv(data_file, index=False)
        init_duckdb_feature_store(raw_df)
    else:
        raw_df = pd.read_csv(data_file)

    print(f"Loaded {len(raw_df)} FIRMS records.")

    # 2. Feature Engineering
    df = engineer_features(raw_df)

    feature_cols = settings.CAT_FEATURES + settings.NUM_FEATURES
    X = df[feature_cols]
    y = df["target_label"].astype(int)
    coords = df[["latitude", "longitude"]].values

    print(f"\nTarget Classes: {settings.TARGET_CLASSES}")
    print(f"Categorical Features (raw strings, no OHE): {settings.CAT_FEATURES}")

    # 3. Spatial Cross-Validation (50km buffer demo approximation)
    #    NOTE: Real eval uses state-based geographic split — see ML Lead pipeline.
    print("\n--- 5-Fold Spatial CV (50km buffer, demo approximation) ---")
    skf = SpatialKFold(n_splits=5, min_distance_km=50.0, random_state=42)

    cv_scores = []
    for fold, (train_idx, val_idx) in enumerate(skf.split(X.values, coords)):
        X_train, y_train = X.iloc[train_idx], y.iloc[train_idx]
        X_val, y_val = X.iloc[val_idx], y.iloc[val_idx]

        fold_model = CatBoostClassifier(
            iterations=300,
            learning_rate=0.08,
            depth=6,
            loss_function="MultiClass",
            eval_metric="MultiClass",
            auto_class_weights="Balanced",
            random_seed=42,
            verbose=False
        )
        fold_model.fit(
            Pool(X_train, y_train, cat_features=settings.CAT_FEATURES),
            eval_set=Pool(X_val, y_val, cat_features=settings.CAT_FEATURES),
            early_stopping_rounds=40,
            verbose=False
        )
        preds = fold_model.predict(Pool(X_val, cat_features=settings.CAT_FEATURES))
        acc = accuracy_score(y_val, preds)
        f1 = f1_score(y_val, preds, average="macro")
        cv_scores.append((acc, f1))
        print(f"  Fold {fold+1}: Accuracy={acc:.4f} | Macro F1={f1:.4f} | Val Points={len(val_idx)}")

    print(f"\n[INFO] Spatial CV Mean Accuracy: {np.mean([s[0] for s in cv_scores]):.4f} | "
          f"Mean Macro F1: {np.mean([s[1] for s in cv_scores]):.4f}")

    # 4. Final Model on Full Synthetic Dataset
    print("\n--- Training Final CatBoost Model (4-class, synthetic data) ---")
    full_pool = Pool(X, y, cat_features=settings.CAT_FEATURES)

    final_model = CatBoostClassifier(
        iterations=500,
        learning_rate=0.06,
        depth=6,
        loss_function="MultiClass",
        eval_metric="MultiClass",
        auto_class_weights="Balanced",
        random_seed=42,
        verbose=100
    )
    final_model.fit(full_pool, verbose=100)

    # 5. Save Model Artifact
    final_model.save_model(settings.MODEL_PATH)
    print(f"\n[SUCCESS] Synthetic demo model saved to {settings.MODEL_PATH}")
    print("[REMINDER] This is NOT the production model. Real training is the ML Lead's responsibility.")

    # 6. Verify SHAP
    print("\n--- Verifying SHAP TreeExplainer ---")
    sample_pool = Pool(X.iloc[:5], cat_features=settings.CAT_FEATURES)
    shap_values = final_model.get_feature_importance(type="ShapValues", data=sample_pool)
    print(f"SHAP Values Shape: {shap_values.shape}")
    print("[SUCCESS] SHAP Explainability Engine verified.")


if __name__ == "__main__":
    train_model()
