# Served model artifact — PS26162 CatBoost inference bundle

`PS26162_catboost_final/inference_bundle/` is the **served contract**, tracked
in git: `catboost_hotspot_classifier.cbm`, `calibrators.joblib`,
`feature_schema.json`, `review_thresholds.json`, `runtime_versions.json`
(55 features, 4 trained classes, 2 categoricals).

Training provenance: [`notebooks/training/sih-catboost-training.ipynb`](../notebooks/training/sih-catboost-training.ipynb).

Model metadata (dataset SHA256, class support, validation splits) lives in
`PS26162_catboost_final/model_metadata.json` (one level above the bundle). Validation metrics there are internal
held-out/pseudo-label scores — they are **not** independent ground-truth
accuracy measurements; see [`../docs/CLAIMS_AND_EVIDENCE.md`](../docs/CLAIMS_AND_EVIDENCE.md).

Redistribution policy: the bundle is tracked because it is the deployed
contract; larger derived outputs (e.g. `deployment_tiered_predictions.csv`,
older `.cbm` versions) are attached to GitHub Releases instead — see
[`../docs/RELEASES.md`](../docs/RELEASES.md).
