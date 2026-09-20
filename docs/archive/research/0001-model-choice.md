> ## ⚠️ HISTORICAL / SUPERSEDED DECISION RECORD
>
> **This document is retained as history only.** It records an early decision to use **XGBoost** with a `high / medium / low / no_fire` risk-tier taxonomy. The **current locked project decision** (see `SIH_2026_26162_Technical_Findings_and_Backend_Summary_updated.docx`) supersedes it: the model is **CatBoost**, and the trained taxonomy is **`industrial`, `mining`, `agricultural_burn`, `wildfire`** (with `unclassified` as a post-training confidence fallback). Do **not** treat this file as the current model/taxonomy decision.
>
> ---


# Decision 0001: Model Choice — XGBoost vs Alternatives

**Date**: 2026-08-28
**Status**: Accepted
**Deciders**: ML Lead

## Context
Need a classification model for wildfire risk prediction (4 classes: high/medium/low/no_fire) on tabular satellite data with ~1.19M rows, 15-20 features, significant class imbalance (~3% high-risk).

## Options Considered

### 1. XGBoost (Chosen)
**Pros:**
- Proven champion on tabular data (Kaggle, industry)
- Handles class imbalance via `scale_pos_weight` or class weights
- Fast training & inference (< 1ms/batch on CPU)
- Native handling of missing values
- Feature importance built-in
- Mature, well-tested, minimal dependencies
- GPU support available if needed

**Cons:**
- Less interpretable than linear models
- Can overfit on noisy features (mitigated by regularization)

### 2. LightGBM
**Pros:**
- Faster training on large datasets
- Lower memory usage
- Better categorical feature handling

**Cons:**
- Similar performance to XGBoost on this data scale
- Slightly more sensitive to hyperparameters
- Team more familiar with XGBoost

### 3. Random Forest
**Pros:**
- Robust, hard to overfit
- Good out-of-box performance
- Parallel training

**Cons:**
- Slower inference (ensemble of deep trees)
- Larger model size
- Less effective on high-cardinality categorical (H3 cells)

### 4. Isolation Forest / One-Class SVM (Anomaly Detection)
**Pros:**
- Designed for rare event detection
- No need for labeled "high-risk" examples

**Cons:**
- We have labeled data (rule-based labels)
- Harder to calibrate probabilities
- Less actionable for multi-class risk tiers

### 5. Neural Network (MLP / TabTransformer)
**Pros:**
- Can learn complex interactions
- Embeddings for H3 cells

**Cons:**
- Overkill for tabular data at this scale
- Requires more tuning, data, compute
- Harder to debug/explain
- XGBoost matches or beats NN on tabular (per "ResNet Strikes Back" / benchmark studies)

### 6. SMOTE + Any Classifier
**Pros:**
- Addresses class imbalance directly

**Cons:**
- Synthetic samples in spatial domain may not be realistic
- Adds complexity, potential leakage
- Class weights in XGBoost achieve same goal simpler

## Decision
**Use XGBoost** with:
- `objective='multi:softprob'` for 4-class probabilities
- `scale_pos_weight` per class (inverse frequency)
- `tree_method='hist'` for CPU speed
- `max_depth=6`, `eta=0.1`, `subsample=0.8`, `colsample_bytree=0.8`
- Early stopping on validation AUC
- Temporal split (train on Jan-Sep 2024, validate Oct-Dec 2024)

## Consequences
- Model artifact: `model.xgb` (native XGBoost binary format)
- Inference: Load via `xgboost.Booster`, predict via `.predict(dmatrix)`
- Retraining: Daily cron job, ~2-3 min on CPU
- Monitoring: Track validation AUC, class-wise F1, prediction drift

## Alternatives Revisited If
- AUC < 0.8 → Try LightGBM, feature engineering
- Inference latency > 10ms → Quantize, ONNX export, or model server
- Need explainability → SHAP values, feature importance plots
