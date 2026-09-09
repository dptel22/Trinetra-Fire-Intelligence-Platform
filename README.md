# 🛰️ PS26162 — Trinetra Fire Intelligence Platform (SIH 2026, NTRO)

End-to-end platform that ingests NASA FIRMS (VIIRS) thermal hotspots across India,
classifies each H3 resolution-8 cell-day into one of four fire classes with a CatBoost
model, and serves the results to a MapLibre/Deck.gl dashboard with honest confidence
caveats and an analyst audit trail.

> **Client:** NTRO · **Problem statement:** SIH 2026, PS26162 · **Live bench:** 2026-09-09
>
> Full backend API reference: [`BACKEND_DOCUMENTATION.md`](BACKEND_DOCUMENTATION.md) ·
> Frontend contract: [`FRONTEND_INTEGRATION_GUIDE.md`](FRONTEND_INTEGRATION_GUIDE.md)

Complete Windows clone-and-run guide, AI-agent setup instructions, artifact inventory,
map/PMTiles setup, demo/live modes, and verification: [`docs/PROJECT_SETUP.md`](docs/PROJECT_SETUP.md).

---

## 1. What this is

| Layer | Tech | Role |
|---|---|---|
| **Ingestion** | `ingestion/` (FIRMS pull + OSM/WRI static merge) | Pull VIIRS detections, build cell-day features |
| **Backend** | FastAPI (`app/`) + DuckDB + CatBoost | Serve `/api/v1` predictions, SHAP, audit |
| **Model** | CatBoost multiclass (4 classes, 52 features, 2 categoricals) | Classify each `(h3_08, acq_date)` cell-day |
| **Frontend** | React 19 + Vite, MapLibre GL + Deck.gl + pmtiles | Interactive India fire map + honesty UI |

**Prediction unit:** one `(h3_08, acq_date)` cell-day — an H3 resolution-8 hexagon
(~0.7 km²) aggregated over one UTC acquisition date.

**Classes:** `industrial`, `mining`, `agricultural_burn`, `wildfire` (plus
`unclassified` when optional abstention thresholding is enabled).

**Model artifacts** live in `models/PS26162_catboost_final/inference_bundle/`
(the served contract — tracked in git):
`catboost_hotspot_classifier.cbm`, `calibrators.joblib`, `feature_schema.json`,
`review_thresholds.json`, `runtime_versions.json`.

## 2. Repository layout

```text
SIH_2026/
├── app/                          # FastAPI backend (the /api/v1 service)
│   ├── api/endpoints/            # predictions, health, audit routes
│   ├── core/config.py            # Settings, MODEL_FEATURES, TARGET_CLASSES, paths
│   ├── schemas/                  # Pydantic request/response models
│   ├── services/                 # model_service, feature_store, explanation, audit
│   └── main.py                   # App entrypoint
├── ingestion/                    # Live FIRMS pull + OSM/WRI static features + state
├── pipeline/                     # H3 aggregation + feature engineering
├── models/
│   └── PS26162_catboost_final/inference_bundle/   # .cbm + calibrators + thresholds (tracked)
├── data/                         # Runtime DuckDB + processed parquets (gitignored)
├── frontend/                     # Vite + React + MapLibre/Deck.gl dashboard
├── tests/                        # pytest suite (backend + data-plane)
├── notebooks/                    # EDA + experiment provenance
├── docs/                         # Architecture, decisions, agent briefs
├── Dockerfile / docker-compose.yml
├── requirements.txt / pyproject.toml / uv.lock
└── *.md                          # README, AGENTS/CLAUDE, docs & integration guides
```

## 3. Architecture & data flow

```
NASA FIRMS (VIIRS) ──> ingestion/ ──> data/processed/*.parquet
                                          │ (DuckDB feature store, gitignored)
                                          ▼
                                    app/ (FastAPI) ── CatBoost inference ── TreeSHAP
                                          │  /api/v1/predictions · /health · /audit
                                          ▼
                        frontend/ (Vite · MapLibre + Deck.gl) ── analysts
```

- The backend seeds an in-process **DuckDB** feature store from processed parquets.
- SHAP is computed **on demand** per cell (CatBoost native TreeSHAP), never in list views.
- Audit overrides are append-only in `data/audit_log.duckdb`.

### Review thresholds (served from `inference_bundle/review_thresholds.json`)

| Class | Confidence threshold to be `needs_review=false` |
|---|---|
| `wildfire` | 0.70 |
| `industrial` | 0.70 |
| `mining` | 0.85 |
| `agricultural_burn` | 1.01 → **always `needs_review=true`** (mechanical) |

The backend fails loudly at startup if the configured `.cbm` does not match the
52-feature / 4-class contract; it never invents fallback predictions.

## 4. Prerequisites

- **Python 3.12** (see [`.python-version`](.python-version))
- **Node.js 18+** (Vite 8 requires a recent runtime)
- Docker (optional — container path)
- A **NASA FIRMS map key** (free Tier-1): https://firms.modaps.eosdis.nasa.gov/api/area/

## 5. Environment setup

Copy the template and add your keys:

```powershell
copy .env.example .env
# edit .env — set FIRMS_MAP_KEY
```

`.env` is gitignored. `.env.example` documents every variable the pipeline/backend
reads (mirror the real names — notably `FIRMS_MAP_KEY`, not `FIRMS_API_KEY`).

## 6. Backend — run it

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 1) Contract + data-plane tests (avoids hitting the live FIRMS API)
python -m pytest -m "not live"

# 2) Live-ingestion smoke tests (burns FIRMS transactions — opt-in)
python -m pytest -m live

# 3) Start the API
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- Swagger UI: http://localhost:8000/docs
- Health check: http://localhost:8000/health

### Serving data requirements

Before the API returns predictions you need the two processed parquets (gitignored) at
`data/processed/`:
`data/processed/sih2026_h3_daily_features_firms.parquet`
`data/processed/sih2026_h3_daily_features_with_osm_wri.parquet`
They are produced by `ingestion/` from a FIRMS pull. If you only need the UI to render,
start the frontend in mock/demo mode — it is visibly flagged (OfflineBanner), never silent.

## 7. Frontend — run it

```powershell
cd frontend
npm ci
npm run dev        # Vite dev server (default :5173)
```

- `npm run lint` — oxlint
- `npm run build` — production build
- `npm run preview` — serve the production build
- The frontend expects the backend at `http://localhost:8000/api/v1` (set
  `VITE_API_BASE_URL` if you run it elsewhere).

Frontend notes:
- The map is **MapLibre GL** via `react-map-gl/maplibre` + self-hosted **pmtiles** base
  tiles, with a **Deck.gl `H3HexagonLayer`** overlay (`@deck.gl/mapbox` `MapboxOverlay`)
  and `h3-js` v4.5.0.
- `frontend/src/services/api.js` implements the full contract: 2500-cap 2×2 bbox tiling,
  `CORS` via config defaults, `unclassified` shown only when the batch actually contains
  it, and backend `caveat_flag` text rendered verbatim (never a fabricated accuracy number).

## 8. Docker — run it

```powershell
docker compose up backend        # builds + boots the API on :8000
# or
docker build -t sih2026-backend .
```

- The image bakes in `models/PS26162_catboost_final/inference_bundle/` and the processed
  parquets, and on first boot seeds a writable volume. A `./app:/app/app` mount gives
  dev-mode reload; `./data/processed:/data:ro` lets fresh host parquets shadow the baked ones.
- The compose file has a single `backend` service (legacy Postgres/Redis/ml-worker services
  were removed in the 2026-09-02 cleanup).

## 9. API summary

Base path `http://localhost:8000/api/v1` (root prediction aliases also exposed without the prefix).

| Endpoint | Purpose |
| :--- | :--- |
| `GET /health` | Model load state, schema version/hash, artifact path, target classes |
| `GET /predictions?min_lat&max_lat&min_lon&max_lon&acq_date` | Cell-day predictions in a bbox (cap 2500 → tile client-side) |
| `GET /predictions/{cell_id}?acq_date=` | One cell: class, confidence, probabilities, context |
| `GET /predictions/{cell_id}/explain?acq_date=` | On-demand TreeSHAP, top-3 drivers |
| `POST /audit/override` · `GET /audit/logs` | Analyst override + audit retrieval |

Example `PredictionResponse` (detail):

```json
{
  "cell_id": "88209a2011fffff",
  "latitude": 34.353099,
  "longitude": 73.794692,
  "h3_index": "88209a2011fffff",
  "predicted_class": "wildfire",
  "probabilities": [
    { "class_name": "agricultural_burn", "probability": 0.01 },
    { "class_name": "industrial", "probability": 0.02 },
    { "class_name": "mining", "probability": 0.03 },
    { "class_name": "wildfire", "probability": 0.94 }
  ],
  "confidence": 0.94,
  "calibrated": true,
  "needs_review": false,
  "caveat_flag": null,
  "latency_ms": 8.2
}
```

One `acq_date` per request (no date ranges); `zoom` optional (default 8, range 1–20).

## 10. Tests

```powershell
python -m pytest -m "not live"   # default addopts — offline suite
python -m pytest -m live         # live FIRMS calls (opt-in, burns transactions)
```

`pyproject.toml` sets `addopts = "-m 'not live'"` so the offline suite is the default
and live API calls are an explicit marker. There is **no frontend test script** — `lint`
and `build` are the verification hooks there.

## 11. Contributing & agent conventions

- [`AGENTS.md`](AGENTS.md) / [`CLAUDE.md`](CLAUDE.md) — shared agent context (frontend
  Owner A/B split, locked taxonomy, logging protocol).
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contribution workflow.
- [`AGENT_LOG.md`](AGENT_LOG.md) — append-only change log (read it before commits).
- [`docs/`](docs/) — architecture, decisions, and the `AGENT_A_PROMPT` / `AGENT_B_PROMPT` briefs.

## 12. Git & large artifacts

- Secrets (`.env`), runtime DBs (`*.duckdb*`), processed/source parquets, and raw model
  outputs are **gitignored** — never commit them.
- The **served model bundle** `models/PS26162_catboost_final/inference_bundle/` IS tracked
  (it is the deployed contract). Other `.cbm`/`.joblib` binaries are ignored.
- To reproduce serving data from scratch, run the ingestion pipeline inside `ingestion/`;
  to redistribute the model, attach it to a GitHub Release.
