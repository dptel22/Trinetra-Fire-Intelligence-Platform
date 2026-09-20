# Claims & Evidence Registry — PS26162

**Last verified:** 2026-09-10 on the current checkout (working tree with the
2026-09-10 audit-remediation diff applied). Verification commands and raw
results are recorded at the bottom of this file.

## Purpose

This is the gate for every factual statement made anywhere in the repository
documentation or the SIH pitch. A claim may only appear in docs or on a slide
if it has a row here with status `VERIFIED` or `REPRODUCIBLE` (with the
qualifier the row requires). If a number or capability is not in this
registry, it must not be presented as fact — say `UNKNOWN` instead.

## Status definitions

| Status | Meaning |
|---|---|
| `VERIFIED` | Checked directly against a git-tracked artifact, code path, or a test/run executed on the current checkout (date noted). |
| `REPRODUCIBLE` | Not re-executed today, but backed by an executable test, script, or build step in the repo that anyone can run. |
| `HISTORICAL` | True of an earlier project state only; must never be presented as current. |
| `UNSUPPORTED` | No repository evidence. Must not be claimed. |
| `UNKNOWN` | Genuinely undetermined; the honest answer until evidence exists. |

## Registry

| ID | Claim | Category | Evidence | Status | Safe wording |
|---|---|---|---|---|---|
| C-01 | Model is a CatBoost multiclass classifier (`CatBoostClassifier`), trained once, served read-only. | model | `models/PS26162_catboost_final/model_metadata.json` (`"model": "CatBoostClassifier"`); `app/services/model_service.py:137-153` loads the `.cbm` | VERIFIED | "A CatBoost multiclass classifier." |
| C-02 | Model artifact is `models/PS26162_catboost_final/inference_bundle/catboost_hotspot_classifier.cbm` with tracked companions (`calibrators.joblib`, `feature_schema.json`, `review_thresholds.json`, `runtime_versions.json`). | model | Directory listing of `models/PS26162_catboost_final/inference_bundle/` (2026-09-10); all five files present and git-tracked | VERIFIED | State the exact bundle path. |
| C-03 | The model consumes exactly **55 features** in a fixed order; contract is enforced three-way (artifact `feature_schema.json` ↔ `app/core/config.py` `MODEL_FEATURES` ↔ loaded model `feature_names_`) and startup fails closed on mismatch. | model | Full JSON parse of `feature_schema.json` (55 `feature_cols`, 2026-09-10); `app/core/config.py:15-71`; `app/services/model_service.py:155-164, 259-269` | VERIFIED | "55 features in a contract-checked fixed order." Never say 52 (superseded). |
| C-04 | Categorical features are `h3_08` and `daynight`. | model | `model_metadata.json` `categorical_features`; `feature_schema.json`; `app/core/config.py:13` | VERIFIED | — |
| C-05 | Target classes are exactly `industrial`, `mining`, `agricultural_burn`, `wildfire` (4 trained classes). | model | `model_metadata.json` `classes`; `app/core/config.py:12` | VERIFIED | "Four trained classes." Never say six, and never add a 5th trained class. |
| C-06 | `unclassified` is a post-training abstention label (env `UNCLASSIFIED_THRESHOLD`): calibrated confidence below the threshold emits it. **Enabled by default at 0.65**; `off`/`none`/`false`/`0` disables. | model | `app/core/config.py:247-250` (default `"0.65"`, sentinel values → `None`); `app/services/model_service.py:310-313` (threshold application) | VERIFIED 2026-09-20 (row updated 2026-09-20; previously recorded as default-off, which was stale) | "Abstention is ON by default at 0.65." Never call it a trained class; never hardcode the cutoff client-side. |
| C-07 | Review thresholds: wildfire 0.70, industrial 0.70, mining 0.85, agricultural_burn 1.01 → agricultural_burn is mechanically always `needs_review=true`. | model | `inference_bundle/review_thresholds.json` (read directly 2026-09-10); gate at `app/services/model_service.py:333-340` | VERIFIED | "agricultural_burn always routes to analyst review (threshold 1.01 is mechanical, not a bug)." |
| C-08 | Probabilities are calibrated with per-class one-vs-rest isotonic regression, then renormalized; `calibrated` reports per-row success. | model | `inference_bundle/calibrators.joblib` + loader `app/services/model_service.py:168-179, 316-331` | VERIFIED | — |
| C-09 | Explanations are CatBoost-native SHAP values, served on demand as top-3 attributions (plus persistence and mining-subtype context). | model | `app/services/model_service.py:425-448`; `app/services/explanation.py`; explain endpoint `app/api/api_router.py` | VERIFIED | "On-demand CatBoost SHAP, top-3 drivers." |
| C-10 | Internal-validation macro-F1 0.9970; geographic test-A 0.9744; test-B 0.9944; **ablated** test-A 0.8194 / test-B 0.8222. These estimate geographic generalization of the pseudo-labeling scheme, **not independent ground-truth accuracy**. | performance | `model_metadata.json` metrics + verbatim `pseudo_label_caveat` ("Phase 6 labels are bootstrap/pseudo-labels derived partly from the same FIRMS/OSM/WRI feature family consumed by the model. Metrics therefore estimate geographic generalization of the labeling scheme, not independent ground-truth accuracy.") | VERIFIED (with mandatory caveat) | Always present with: (a) the ablated ~0.82 numbers, (b) the pseudo-label caveat verbatim. **Never** say "99% accurate". Never cite 0.99 without the ablation context. |
| C-11 | Blind-test policy: Test A (Gujarat, Tamil Nadu) and Test B (Jharkhand, Rajasthan) were consumed only after the final refit — no tuning/early-stopping/feature-selection on them. | model | `model_metadata.json` `blind_test_policy`; `test_a_states`/`test_b_states` | VERIFIED | "Held-out states evaluated only after the final refit." |
| C-12 | Class balance in internal validation: industrial 44,207 / mining 4,886 / agricultural_burn 1,762 / wildfire 8,056 of 58,911 validation rows. | data | `model_metadata.json` `internal_validation.validation_class_counts` | VERIFIED | Mining and agricultural_burn have thin support — state it. |
| C-13 | Training data: 222,893 train / 58,911 validation rows; geographic split TRAIN = MH/KA/MP/PB/AP/TS, internal validation = deterministic H3-parent (res 6) hash fold with zero H3 overlap. | data | `model_metadata.json` `internal_validation`, `train_states` | VERIFIED | "Geographic, leakage-controlled split." |
| C-14 | Prediction unit is one `(h3_08, acq_date)` cell-day at H3 resolution 8; `zoom` on `/predictions` is echoed but decorative (no server-side downsampling). | architecture | `app/core/config.py:153` (`H3_RESOLUTION=8`); `app/schemas/prediction.py` zoom description; `app/services/model_service.py:666` mode logic | VERIFIED | "One H3-res-8 hex per UTC day." |
| C-15 | FIRMS ingestion uses **only** VIIRS SNPP + NOAA-20 NRT area API sources; no MODIS anywhere in the serving path; day-range ceiling 5 per request. | data | `ingestion/firms_pull.py:46-62` (`SOURCES`, `MAX_DAY_RANGE = 5`) | VERIFIED | "VIIRS 375 m from Suomi-NPP and NOAA-20 NRT." Do not claim NOAA-21 or MODIS coverage. |
| C-16 | OSM/WRI enrichment: WRI Global Power Plant Database v1.3.0 (per-fuel nearest distance + count within 10 km) and OSM tag extraction (6 filters, counts within 5 km); state assignment via pinned, hash-verified shapefile with point-in-polygon + nearest-boundary tie-break. | data | `ingestion/osm_wri_load.py:96-110, 183-203, 462-535` | VERIFIED | — |
| C-17 | Temporal leakage control: history features use shift(1) before 7d/30d/90d rolling per cell; regression-gated by a test. | data | `ingestion/aggregate.py:147-210`; `tests/test_aggregation.py::test_shift_before_rolling_no_leakage_of_current_day` (passed 2026-09-10) | VERIFIED | "Current-day information never enters its own history features." |
| C-18 | Serving is **all-India by design**: the historical 10-state serving filter is retired; there is no state restriction in the serving path. The current artifact contains **459,972 static cells across 20 states/UTs** where the ingested FIRMS corpus has detections, 2024-08-01 → 2026-09-10, all `within` (459,358) or `nearest_boundary_tie_break` (614) assignment, zero outside-India cells. | data | Direct parquet read 2026-09-10 (`sih2026_h3_daily_features_with_osm_wri.parquet`); `ingestion/run_ingestion.py:1-17, 445-468`; `tests/test_data_plane.py::test_serving_parquets_are_nationwide_not_10_state_only` (passes on current artifact) | VERIFIED (scope-qualified) | "Inference runs all-India; the current serving artifact covers the 20 states/UTs with ingested detections. States absent from the artifact are an ingestion-coverage gap, not a serving filter." **Never** claim nationwide coverage as achieved. |
| C-19 | GEO-001 remediation: a prior artifact labeled 3,051 outside-India (Sri Lanka box) rows as Tamil Nadu; the feature store now filters static staging to valid assignment methods, and the current artifact contains zero outside-India cells. | data | `app/services/feature_store.py` staging filter (working tree); direct parquet read 2026-09-10 (no outside-India states, no `nearest_unmatched`); `docs/WHOLE_SYSTEM_AUDIT.md` GEO-001 | VERIFIED | "A labeling defect was found and fixed; the current artifact has zero outside-India cells." |
| C-20 | Backend: FastAPI + uvicorn, fail-closed startup (missing bundle → process dies), no model training at startup, no fallback/fabricated predictions; startup ingestion hook is optional and failure-tolerant. | architecture | `app/main.py:63-71`; `app/services/model_service.py:137-153` | VERIFIED | — |
| C-21 | Storage is **DuckDB (3 files) + Parquet only**. There is no PostgreSQL, PostGIS, Redis, WebSocket, or SQLite anywhere in the stack. | architecture | `docker-compose.yml:1-5` ("Legacy Postgres/Redis/backend_legacy/ml-worker services were removed in the 2026-09-02 cleanup"); repo-wide grep = zero code hits | VERIFIED | State DuckDB + Parquet. Postgres/Redis may only be mentioned as removed history. |
| C-22 | Endpoints: `GET /health`; `GET /predictions` (bbox + one `acq_date`, server-side `LIMIT 2500`, no offset/cursor); `GET /predictions/{cell_id}`; `GET /predictions/{cell_id}/explain`; root aliases without `/api/v1`; plus `/api/v1`: `POST /classify`, `POST /classify/batch`, `POST /explain`, archive (`/archive/dates`, `/archive/predictions`, `/archive/summary` with 31-day cap, `/archive/runs`, `/archive/evidence`), alerts (`/alerts/{id}/actions`, `/alerts/states`, `/alerts/{id}/history`), audit (`/audit/override`, `/audit/logs`). | architecture | `app/main.py`; `app/api/api_router.py`; `app/services/feature_store.py:216` (`LIMIT 2500`) | VERIFIED | — |
| C-23 | Backend test suite: **135 passed, 1 deselected** (the opt-in live FIRMS test), 2 known deprecation warnings — executed 2026-09-10 on the current checkout (`.venv`, Python 3.12.13). | validation | `uv`-free run: `.venv/Scripts/python.exe -m pytest tests/ -q` → "135 passed, 1 deselected, 2 warnings in 280.99s" | VERIFIED | "135 backend tests pass; the single live-network test is deselected by default." |
| C-24 | Frontend verification: `npm run lint` (oxlint) 0 warnings / 0 errors on 22 files; `npm run build` passes. There is **no frontend unit-test script**. | validation | Executed 2026-09-10 (exit 0 both) | VERIFIED | "Lint-clean, production build passes; no frontend test suite exists." |
| C-25 | Frontend stack: React 19 + Vite, MapLibre GL via `react-map-gl/maplibre`, deck.gl layers via `MapboxOverlay`, PMTiles protocol + h3-js; detections render as per-class icon layers. `react-leaflet`/`leaflet` remain in `package.json` but have **zero imports** (dead weight). | frontend | `frontend/src/components/FireMapPage.jsx:27-75, 349-431`; `grep -rn "react-leaflet" frontend/src` → 0 hits | VERIFIED | "MapLibre + deck.gl + self-hosted tiles." Do not describe the map as React-Leaflet. |
| C-26 | NASA Blue Marble raster tiles (z0–z6) ship in `frontend/public/tiles/bluemarble/` and work offline. When the optional OpenMapTiles PMTiles archive is absent, Streets and Topographic use disclosed public raster fallbacks; the PMTiles build remains the fully offline vector path. | frontend | Directory listing (0 `*.pmtiles` files, 2026-09-11); `frontend/src/services/basemapStyles.js` (`PMTILES_AVAILABLE`); browser verification of all three styles | VERIFIED | "Blue Marble works offline; Streets and Topographic work with public raster tiles until the optional local vector pack is built." |
| C-27 | Mock/demo mode: any failed live fetch flips the UI to mock data where every row carries `is_synthetic: true`, shown via a persistent OfflineBanner, "SIMULATED" labels, and a DEMO status pill; strict endpoints (detail, archive mutations, alert actions) throw rather than mock. | frontend | `frontend/src/services/api.js` (`forceMockMode`, `generateMockPredictions`, `is_synthetic`); `OfflineBanner.jsx`; `FireAlertsPage.jsx` `StatusBadge` | VERIFIED | "Mock data is always visibly labeled; nothing silently impersonates a prediction." |
| C-28 | Deployment: single-service Docker backend (python:3.12-slim, bundle + parquets baked, writable volume seeded on first boot); compose runs one `backend` service; no frontend Docker image. | deployment | Root `Dockerfile`; `docker-compose.yml` | VERIFIED | "One containerized backend; frontend runs via Vite." |
| C-29 | Runbook: `scripts/setup.ps1 -Mode demo [-DownloadServingData]`, uvicorn on :8000, `scripts/verify.ps1`, `npm run dev`. Referenced artifacts (bundle files, serving parquets) exist in the repo checkout. | deployment | `scripts/setup.ps1`, `scripts/verify.ps1`; artifact existence check 2026-09-10 (C-02, C-18) | VERIFIED (script existence + inputs; a full fresh-setup run was not executed today) | "The runbook is grounded in artifacts present in the repo." Do not claim "fresh-clone demo verified today." |
| C-30 | Example `latency_ms: 8.2` in API docs is an illustrative sample value from a past response, **not** a benchmark. | performance | Appears as a literal example in `BACKEND_DOCUMENTATION.md` / `FRONTEND_INTEGRATION_GUIDE.md` | REPRODUCIBLE (sample only) | Label as "example value". No latency SLA claims. |
| C-31 | Official SIH problem statement text (PS26162): **not present in the repository.** `docs/problem-statement.md` previously held a placeholder. Metadata from the team concept note: PS ID SIH26162, Software category, submission window closes 20 Sep 2026. | problem | Repo-wide search (2026-09-10): no verbatim text anywhere; `docs/decisions/SIH26162_Project_Document.docx` is the team's own concept note | UNKNOWN | "The verbatim problem statement is not checked in; our scope is the repository interpretation." |
| C-32 | "Client: NTRO" and problem-statement identity (SIH 2026, PS26162). | problem | `README.md`, `AGENTS.md`, `docs/decisions/SIH26162_Project_Document.docx` | REPRODUCIBLE (as recorded project context) | State as project context. Do **not** extend to "NTRO requirements", "NTRO-compliant", "defense-grade", or "deployed by NTRO" — those are project interpretations with no official source (see C-33). |
| C-33 | "NTRO compliance", "defense-grade explainability", "national-scale/real-time alerting", "zero-downtime", "100% secure", "fully automated", "production-ready": **no repository evidence for any of these.** | governance | Adversarial grep 2026-09-10: hits exist only in superseded research essays (`docs/archive/research/Final model.md`, `docs/Beyond SNPP-Only…md`, `docs/archive/research/demo-script.md`) | UNSUPPORTED | Never use in docs or pitch. The honest differentiator is the built-in honesty/provenance machinery (C-07, C-27, C-19), not adjectives. |
| C-34 | Historical docs claiming XGBoost, H3 res 7, risk tiers (`high_risk`/`medium_risk`/`low_risk`/`no_fire`), six classes, 52 features, Postgres/Redis/WebSocket, AUC 0.87, "<1 ms inference", "ML worker retrains daily": all describe removed systems or never-built plans. | history | `docs/archive/research/demo-script.md` (deprecated banner), `docs/architecture.md` (superseded — being rewritten), `docs/archive/research/0001-model-choice.md` (superseded banner), `docs/archive/research/eda-findings.md` (early exploration) | HISTORICAL | Only inside documents explicitly bannered as historical/superseded. |
| C-35 | Training/serving feature parity is regression-gated: order parity config↔schema and per-value parity against the labeled training artifact, with real serving-key intersections. | validation | `tests/test_training_serving_parity.py` (3 tests, passed 2026-09-10, fixtures intersected with actual serving keys per MODEL-001 remediation) | VERIFIED | "Parity is an enforced test, not an assertion." |
| C-36 | Archive provenance: every served day is classified `live` / `historical` / `offline` / `failed` / `plausibility_warning` / `no_run_record` from the ingestion run manifest — nothing fabricates demo data; raw FIRMS evidence is archived immutably before harmonization. | architecture | `app/services/archive_service.py:6-16, 91-116`; `ingestion/raw_archive.py`; `tests/test_archive.py` (26 tests, passed 2026-09-10) | VERIFIED | — |
| C-37 | "Live bench: 2026-09-09" in README refers to the dated live-ingestion run recorded in AGENT_LOG (12,692 detections pull; since superseded by the 2026-09-10 all-India refresh serving 2024-08-01→2026-09-10). | data | `AGENT_LOG.md` entries 2026-09-09/10; C-18 parquet check (max acq_date 2026-09-10) | VERIFIED | Quote the refresh, not just the bench date. |

## Do Not Use as Current Pitch Evidence

| Source | Why |
|---|---|
| `docs/archive/research/demo-script.md` (body) | Describes the removed XGBoost/Postgres demo; metrics (AUC 0.87, F1 0.72, <1 ms) were never reproducible in the current repo. |
| `docs/architecture.md` (pre-2026-09-10 version) | Era-0 plan (XGBoost, res 7, Postgres/Redis/WebSocket) — superseded by the rewrite; kept only as history. |
| `docs/archive/research/eda-findings.md` | Early exploration: risk-tier taxonomy and res-7 recommendation superseded; area figures partially wrong. |
| `docs/archive/research/0001-model-choice.md` | Bannered superseded (XGBoost era). |
| `docs/decisions/SIH26162-Implementation-Plan.docx` | Early plan: 5 classes incl. `gas_flare`, XGBoost, abstention cutoff 0.45 — none shipped. |
| `docs/archive/research/Final model.md`, `docs/Beyond SNPP-Only…md`, and the research PDFs | Rationale essays; assume 6 classes; "NTRO compliance"/"defense-grade" framing is project interpretation, not an official requirement. |
| `docs/archive/internal/backend-rebuild-coordination.md` (body) | Historical coordination log; only its final reconciliation appendix matched current truth, now superseded by `docs/CURRENT_PROJECT_TRUTH.md`. |
| `TRAINING_SERVING_SKEW_TEST_REPORT.md` | Historical report; its fixed sample cells were replaced by serving-key intersections (MODEL-001 remediation); `.venv-pinned` no longer exists. |
| Any AGENT_LOG entry older than the latest | Append-only history; the current checkout is authoritative. |
| "99% macro-F1" cited without ablation + pseudo-label caveat | Misleading by omission; see C-10. |

## Verification record (2026-09-10)

```text
.venv/Scripts/python.exe -m pytest tests/ -q -p no:cacheprovider
  → 135 passed, 1 deselected, 2 warnings in 280.99s   (Python 3.12.13)

cd frontend
npm run lint   → Found 0 warnings and 0 errors (22 files)
npm run build  → pass (exit 0)

Artifacts: all 5 inference-bundle files present; both serving parquets present
(17.7 MB / 101.3 MB); 3 DuckDB stores present.
Serving parquet: 459,972 unique cells; 20 states/UTs; acq 2024-08-01→2026-09-10;
methods: within=459,358, nearest_boundary_tie_break=614; 0 outside-India cells.
Bundle JSON parse: 55 feature_cols; thresholds 0.7/0.7/0.85/1.01; classes
[agricultural_burn, industrial, mining, wildfire] (set); CatBoost 1.2.10,
scikit-learn 1.6.1, Python 3.12.
```
