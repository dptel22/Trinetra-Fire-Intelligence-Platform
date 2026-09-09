# PS26162 Project Map and Clone-and-Run Runbook

This is the canonical setup guide for Trinetra. An AI coding agent should read this file, `AGENTS.md`, and the latest `AGENT_LOG.md` entry before changing the repository.

## System map

```text
NASA FIRMS -> ingestion -> H3 cell/day features -> OSM/WRI enrichment
           -> serving parquets -> DuckDB -> CatBoost/calibration
           -> FastAPI -> React/MapLibre/Deck.gl/PMTiles
```

The prediction unit is `(h3_08, acq_date)`. H3 resolution is 8. Trained classes are `industrial`, `mining`, `agricultural_burn`, and `wildfire`; `unclassified` is optional abstention, not a fifth trained class.

## Repository map

| Path | Responsibility |
| --- | --- |
| `app/` | FastAPI, configuration, model service, DuckDB feature store, audit API |
| `ingestion/` | FIRMS download, H3 aggregation, temporal features, OSM/WRI enrichment |
| `pipeline/` | Supporting feature/data utilities |
| `models/PS26162_catboost_final/inference_bundle/` | Tracked serving model contract |
| `data/raw/` | FIRMS, OSM, WRI, and boundary inputs; ignored |
| `data/processed/` | Serving parquets, caches, run history, and runtime databases; ignored |
| `frontend/src/` | React application and API client |
| `frontend/public/tiles/` | Optional local PMTiles basemap; ignored |
| `tests/` | Backend, ingestion, data-plane, and model parity tests |
| `docs/` | Architecture and operating documentation |
| `AGENT_LOG.md` | Append-only changes, verification, errors, and handoffs |

Ownership and coordination rules are in `AGENTS.md`. Preserve unrelated changes and never rewrite old log entries.

## Prerequisites

- Windows PowerShell
- Python 3.12 (`.python-version`)
- Node.js 18+ and npm
- 8 GB RAM minimum for UI/demo; 16 GB+ recommended for live OSM enrichment
- 10 GB free disk for normal development
- Java 21+ and more temporary disk for Planetiler/PMTiles
- NASA FIRMS map key for live ingestion
- Docker is optional

## Fast setup

From the repository root:

```powershell
.\scripts\setup.ps1 -Mode demo
.\scripts\verify.ps1
```

Start the services in separate PowerShell windows:

```powershell
# backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8000

# frontend
cd frontend
npm run dev
```

Open `http://localhost:5173`.

## Demo and live modes

Demo mode requires no FIRMS key. It still requires the two serving parquets for real backend predictions:

```text
data/processed/sih2026_h3_daily_features_firms.parquet
data/processed/sih2026_h3_daily_features_with_osm_wri.parquet
```

If those files are absent, the frontend may use its explicitly marked mock/offline mode for UI work. The backend never fabricates predictions.

Live mode:

```powershell
copy .env.example .env
# edit .env and set FIRMS_MAP_KEY
.\scripts\setup.ps1 -Mode live -RunIngestion
```

Live ingestion also requires:

```text
data/raw/<india extract>.osm.pbf
data/raw/globalpowerplantdatabasev130/global_power_plant_database.csv
data/raw/india_state_boundary/India_State_Boundary.{shp,shx,dbf,prj}
```

The boundary source is pinned and hash-checked by `ingestion/osm_wri_load.py`. The PBF must be an India extract. Missing inputs fail loudly before writes.

## Data pipeline

`ingestion.run_ingestion` fetches SNPP and NOAA-20 FIRMS data, splits long ranges into API-safe chunks, aggregates to H3 cell/day rows, recomputes temporal history for affected cells, enriches new cells with WRI distances/counts and OSM distances/counts, applies the locked serving-state filter, and atomically writes both serving parquets.

```powershell
.\.venv\Scripts\python.exe -m ingestion.run_ingestion
.\.venv\Scripts\python.exe -m ingestion.run_ingestion --date 2026-09-08 --day-range 1 --no-gap-fill
.\.venv\Scripts\python.exe -m ingestion.run_ingestion --force-osm-rebuild
```

Use `FIRMS_MAP_KEY`, not `FIRMS_API_KEY`. Same-day reruns upsert by `(h3_08, acq_date)`. Run history is written to `data/processed/ingestion_run_history.json`.

## Model contract

Required tracked files:

```text
models/PS26162_catboost_final/inference_bundle/
  catboost_hotspot_classifier.cbm
  calibrators.joblib
  feature_schema.json
  review_thresholds.json
  runtime_versions.json
```

The current bundle contains 55 features, categorical features `h3_08` and `daynight`, and four classes. Runtime versions are recorded in `runtime_versions.json` (CatBoost 1.2.10, Python 3.12, NumPy 2.0.2, pandas 2.3.3, scikit-learn 1.6.1). Review thresholds are wildfire 0.70, industrial 0.70, mining 0.85, and agricultural-burn 1.01, so agricultural-burn always needs review.

## Backend contract

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Important routes:

```text
GET  /health
GET  /api/v1/health
GET  /api/v1/predictions?min_lat=&max_lat=&min_lon=&max_lon=&acq_date=&zoom=
GET  /api/v1/predictions/{cell_id}?acq_date=
GET  /api/v1/predictions/{cell_id}/explain?acq_date=
POST /api/v1/audit/override
GET  /api/v1/audit/logs
```

Health exposes `latest_acq_date`; clients must query that date rather than the browser calendar date. Prediction responses are capped at 2500 server-side, so the frontend tiles wide viewports. SHAP runs only for a selected cell.

## Frontend and map

```powershell
cd frontend
npm ci
npm run dev
```

The frontend uses React/Vite, MapLibre GL, `react-map-gl/maplibre`, Deck.gl, `h3-js`, and `pmtiles`. Configure `VITE_API_BASE_URL=http://localhost:8000/api/v1`.

The optional basemap must be exactly:

```text
frontend/public/tiles/india.pmtiles
```

Set `VITE_PMTILES_URL=/tiles/india.pmtiles`. Without it, the map uses a dark fallback but still renders fire data. Build instructions are in `docs/PMTILES_BUILD.md`; the build needs Java 21+, an India PBF, and substantial disk/RAM.

## Docker

```powershell
docker compose up --build backend
```

The image copies the model and serving parquets from the build context. Compose seeds missing files into the writable `sih2026-data` volume. The host `./data/processed:/data:ro` mount can shadow baked-in image data, so an empty host directory can cause missing-artifact failures. Check `/health` after startup.

## Verification

```powershell
.\scripts\verify.ps1
.\.venv\Scripts\python.exe -m pytest -m "not live"
cd frontend
npm run lint
npm run build
```

Acceptance requires: model loaded; non-null latest date when data exists; prediction/detail/explanation requests work; frontend map and alerts use the backend date; PMTiles absence affects only the basemap; audit writes are readable; Docker health is green.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Missing serving parquet | Generate live data or provide both ignored parquets |
| Missing OSM/WRI input | Place the exact raw files under `data/raw/` |
| FIRMS key error | Set `FIRMS_MAP_KEY` in `.env`; never commit it |
| Empty alerts with HTTP 200 | Query `latest_acq_date` from health |
| Dark map | Build `frontend/public/tiles/india.pmtiles`; this is only a basemap issue |
| CORS error | Set `CORS_ALLOW_ORIGINS=http://localhost:5173` |
| DuckDB lock | Stop uvicorn before data-plane tests |
| Model mismatch | Restore the tracked bundle and use Python 3.12 |
| Offline banner | Check port 8000, `/health`, and `VITE_API_BASE_URL` |

## Artifact inventory

| Artifact | Source | Git | Action | Consumer |
| --- | --- | --- | --- | --- |
| `.cbm`, calibrators, schema, thresholds, manifest | inference bundle | tracked | none | model service |
| FIRMS serving parquet | NASA + ingestion | ignored | generate/download | feature store |
| OSM/WRI serving parquet | PBF + WRI + ingestion | ignored | generate | feature store |
| OSM feature cache | India PBF | ignored | generate once | ingestion |
| PMTiles | India PBF + Planetiler | ignored | optional generate | MapLibre |
| DuckDB files | backend/runtime | ignored | automatic | backend/audit |

## Current project state

The reconciled agent history records a verified 55-feature model contract, real OSM/WRI enrichment, live FIRMS ingestion, 64 backend tests plus one opt-in live test, Docker boot verification, and frontend build/lint verification. Historical entries mentioning 52 features, the old model path, or the old `parts` NameError are superseded by later entries. Live setup still depends on user-supplied raw inputs and `FIRMS_MAP_KEY`; PMTiles remains optional.

## Agent protocol

Read `AGENTS.md`, this runbook, and the latest `AGENT_LOG.md` entries before work. Every meaningful change appends one log entry containing timestamp/agent, scope, files, interface impact, verification results, errors/blockers, and handoff items. Never rewrite old entries.

