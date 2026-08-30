# Backend Documentation — NASA FIRMS Thermal-Source Classification Backend

This document answers: **"What does the backend currently do?"** — not "what do we wish it did." Every capability is annotated with `STATUS: IMPLEMENTED / PARTIAL / PLANNED`.

> Overall status: **backend prototype/foundation.** Not production, not NTRO-certified, not benchmarked.

## Classification & Inference — STATUS: IMPLEMENTED (prototype)
- CatBoost integration exists; model artifact at `data/catboost_hotspot_model.cbm`.
- Model trained on **synthetic/demo sample data** (`data/sample_firms.csv`), not the real dataset.
- Prototype model uses **six labels**. **Locked taxonomy is four trained classes** (`industrial`, `mining`, `agricultural_burn`, `wildfire`) with `unclassified` as a post-training confidence fallback. The six-label prototype **diverges** and must be aligned.
- Real multiclass training **not** complete; real 4-class label column does not exist (executed Phase 9 target = `is_static_land` + `is_labeled`).
- Endpoints: `POST /api/v1/classify`, `POST /api/v1/classify/batch`.

## Explainability (SHAP) — STATUS: IMPLEMENTED (endpoint exists)
- On-demand per-instance endpoint: `POST /api/v1/explain`.
- SHAP via CatBoost `get_feature_importance(type="ShapValues")`.
- Do not imply a final validated model is trained when it is not.

## Feature Store — STATUS: PARTIAL (prototype context store)
- DuckDB in-process service exists (`h3_spatial_context`: landuse_tag, canopy_cover_pct, distance_to_road_km, distance_to_water_km).
- This is a **prototype context store**, not the real enriched H3-day feature store. Integration incomplete.

## Spatial / Viewport — STATUS: PARTIAL (endpoint exists)
- Endpoint: `GET /api/v1/spatial/viewport`.
- Geo filtering must be verified/fixed. Do not describe as production viewport culling until proven.

## Ingestion & DLQ — STATUS: PARTIAL
- Pydantic validation on batch ingestion (`POST /api/v1/ingest/batch`).
- Dead-letter queue is **in-memory only** (`GET /api/v1/ingest/dlq`).
- **Redis + Celery async ingestion not implemented**.

## Audit Trail — STATUS: PARTIAL
- Append-only application-level logging (`POST /api/v1/audit/override`, `GET /api/v1/audit/logs`) via DuckDB.
- **DB-enforced immutability not established.** Do not call it "immutable" in the DB-enforced sense unless proven.

## Current feature contract (prototype)
Categorical: `h3_index`, `satellite`, `daynight`, `landuse_tag`.
Numerical: `brightness`, `scan`, `track`, `frp`, `bright_t31`, `confidence`, `persistence_90d_norm`, `distance_to_water_km`, `distance_to_road_km`, `canopy_cover_pct`, `is_static_source`.

> These are the **prototype model's** features. The real pipeline's **H3-day enriched schema** (e.g. `frp_max`, `frp_mean`, `n_detections`, `ti4_max`, `is_saturated_max`, `scan_mean`, `track_mean`, `confidence_high_any`, `daynight`, `satellite_nunique`, `is_static_land`, `is_offshore`) is **not the same**; do not document them as identical.

## Known gaps (prototype vs. intended)
- Real-data 4-class training not executed.
- Redis/Celery async ingestion not implemented.
- Postgres/PostGIS authoritative storage not implemented.
- DB-enforced audit immutability not established.
- Viewport culling correctness unverified.
- No validated confidence threshold, calibrated probabilities, or measured latency benchmarks.
