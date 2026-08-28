import os
import sys
from pathlib import Path
import numpy as np
import pandas as pd
from catboost import CatBoostClassifier, Pool
from sklearn.metrics import classification_report, accuracy_score, f1_score

# Ensure project root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
from pipeline.feature_engineering import engineer_features
from pipeline.spatial_cv import SpatialKFold
from data.mock_generator import generate_mock_firms_data, init_duckdb_feature_store

def train_model():
    print("=" * 70)
    print("[NTRO NASA FIRMS Hotspot Classifier: CatBoost Training Pipeline]")
    print("=" * 70)
    
    # 1. Load or Generate Dataset
    data_file = settings.DATA_DIR / "sample_firms.csv"
    if not os.path.exists(data_file):
        print("Creating synthetic spatial FIRMS dataset...")
        raw_df = generate_mock_firms_data(n_samples=2500)
        raw_df.to_csv(data_file, index=False)
        init_duckdb_feature_store(raw_df)
    else:
        raw_df = pd.read_csv(data_file)
        
    print(f"Loaded {len(raw_df)} FIRMS hotspot records.")
    
    # 2. Feature Engineering & Preprocessing
    df = engineer_features(raw_df)
    
    feature_cols = settings.CAT_FEATURES + settings.NUM_FEATURES
    X = df[feature_cols]
    y = df["target_label"].astype(int)
    coords = df[["latitude", "longitude"]].values
    
    print(f"Features: {feature_cols}")
    print(f"Categorical Features (passed as raw strings without OHE): {settings.CAT_FEATURES}")
    
    # 3. Spatial Cross-Validation (SCV) to prevent spatial autocorrelation leakage
    print("\n--- Running 5-Fold Spatial Cross-Validation (Min Distance Buffer: 50km) ---")
    skf = SpatialKFold(n_splits=5, min_distance_km=50.0, random_state=42)
    
    cv_scores = []
    for fold, (train_idx, val_idx) in enumerate(skf.split(X.values, coords)):
        X_train, y_train = X.iloc[train_idx], y.iloc[train_idx]
        X_val, y_val = X.iloc[val_idx], y.iloc[val_idx]
        
        train_pool = Pool(X_train, y_train, cat_features=settings.CAT_FEATURES)
        val_pool = Pool(X_val, y_val, cat_features=settings.CAT_FEATURES)
        
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
        fold_model.fit(train_pool, eval_set=val_pool, early_stopping_rounds=40, verbose=False)
        
        preds = fold_model.predict(val_pool)
        acc = accuracy_score(y_val, preds)
        f1 = f1_score(y_val, preds, average="macro")
        cv_scores.append((acc, f1))
        print(f"  Fold {fold + 1}: Spatial Val Accuracy = {acc:.4f} | Macro F1 = {f1:.4f} (Val Points: {len(val_idx)})")

    mean_acc = np.mean([s[0] for s in cv_scores])
    mean_f1 = np.mean([s[1] for s in cv_scores])
    print(f"\n[INFO] Spatial CV Mean Accuracy: {mean_acc:.4f} | Mean Macro F1: {mean_f1:.4f}")
    
    # 4. Train Final Model on Full Dataset
    print("\n--- Training Final CatBoost Model ---")
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
    print(f"\n[SUCCESS] Model successfully saved to {settings.MODEL_PATH}")
    
    # 6. Verify SHAP Explainability on sample
    print("\n--- Verifying SHAP TreeExplainer Local Attribution ---")
    sample_pool = Pool(X.iloc[:5], cat_features=settings.CAT_FEATURES)
    shap_values = final_model.get_feature_importance(type="ShapValues", data=sample_pool)
    print(f"SHAP Values Shape: {shap_values.shape} (Samples x Features+1 x Classes)")
    print("[SUCCESS] SHAP Explainability Engine verified.")

if __name__ == "__main__":
    train_model()
