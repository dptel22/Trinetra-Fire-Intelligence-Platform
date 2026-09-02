# 🛰️ PS26162 — NASA FIRMS Hotspot Classification Backend

FastAPI backend that classifies NASA FIRMS satellite thermal anomalies into four source
classes per H3 hexagon per day, with on-demand SHAP explanations and an append-only
analyst audit trail.

> **This README describes the current architecture.** Full API details live in
> [BACKEND_DOCUMENTATION.md](BACKEND_DOCUMENTATION.md); the frontend contract is in
> [FRONTEND_INTEGRATION_GUIDE.md](FRONTEND_INTEGRATION_GUIDE.md).

---

## 1. What this is

- **Prediction unit:** one `(h3_08, acq_date)` cell-day — an H3 resolution-8 hexagon
  (~0.7 km²) aggregated over one UTC acquisition date.
- **Model:** CatBoost multiclass classifier, 52 features, 2 categorical features
  (`h3_08`, `daynight`), trained on FIRMS + OSM + WRI features
  (`models/catboost_hotspot_classifier_v1.cbm`).
- **Classes:** `industrial`, `mining`, `agricultural_burn`, `wildfire`
  (plus `unclassified` when optional abstention thresholding is enabled).
- **Feature store:** in-process DuckDB, seeded from processed parquet artifacts.
- **Explainability:** CatBoost native TreeSHAP, computed on demand per cell.
- **Audit:** append-only DuckDB trail for analyst overrides.

## 2. Architecture

```
CLIENT (Deck.gl map, viewport bbox queries)
   │ HTTP / JSON
   ▼
FASTAPI (app/)  ── GET /predictions?bbox&acq_date      (list of cell-day predictions)
                ── GET /predictions/{cell_id}          (detail + probabilities)
                ── GET /predictions/{cell_id}/explain  (top-3 SHAP drivers)
                ── POST /audit/override, GET /audit/logs
   │
   ├── app/services/model_service.py   CatBoost load + inference + SHAP (contract-checked at startup)
   ├── app/services/feature_store.py   DuckDB tables: h3_daily, osm_wri_static
   ├── app/services/explanation.py     Human-readable attribution summaries
   └── app/services/audit_service.py   Append-only audit trail (data/audit_log.duckdb)
```

The backend fails loudly at startup if the model artifact does not match the
52-feature / 4-class contract (`app/core/config.py`). It never invents fallback
predictions when artifacts are missing.

## 3. Repository layout

```text
SIH_2026/
├── app/                             # Production FastAPI backend (the backend)
│   ├── api/endpoints/               # classify.py (predictions), audit.py
│   ├── core/config.py               # Paths, MODEL_FEATURES, TARGET_CLASSES
│   ├── schemas/                     # Pydantic request/response models
│   ├── services/                    # feature_store, model_service, explanation, audit
│   └── main.py                      # App entrypoint (+ root /predictions aliases)
├── models/
│   └── catboost_hotspot_classifier_v1.cbm   # Model artifact (gitignored — see releases)
├── pipeline/                        # H3 aggregation + feature engineering + training
├── data/
│   ├── processed/                   # gitignored source parquets (see data/README.md)
│   └── feature_store.duckdb         # Runtime DuckDB feature store (gitignored)
├── notebooks/                       # eda/ and experiments/ (training provenance)
├── tests/test_backend.py            # Backend contract tests (4 tests)
├── Dockerfile / docker-compose.yml  # Deployment (backend service only)
├── BACKEND_DOCUMENTATION.md         # Full API reference
├── FRONTEND_INTEGRATION_GUIDE.md    # Frontend integration contract
└── docs/backend-rebuild-coordination.md
```

## 4. API summary

Base path `http://localhost:8000/api/v1` (root aliases also exposed without the prefix).

| Endpoint | Purpose |
| :--- | :--- |
| `GET /health` | Model load state, schema version/hash, artifact path, target classes |
| `GET /predictions?min_lat&max_lat&min_lon&max_lon&acq_date` | Cell-day predictions inside a bbox |
| `GET /predictions/{cell_id}?acq_date=` | One cell: class, confidence, probabilities, context |
| `GET /predictions/{cell_id}/explain?acq_date=` | On-demand TreeSHAP, top-3 drivers |
| `POST /audit/override` · `GET /audit/logs` | Analyst override + audit retrieval |

Example response (cell detail):

```json
{
  "cell_id": "88209a2011fffff",
  "latitude": 34.353099,
  "longitude": 73.794692,
  "predicted_class": "wildfire",
  "probabilities": [
    { "class_name": "agricultural_burn", "probability": 0.01 },
    { "class_name": "industrial", "probability": 0.02 },
    { "class_name": "mining", "probability": 0.03 },
    { "class_name": "wildfire", "probability": 0.94 }
  ],
  "confidence": 0.94,
  "caveat_flag": null,
  "latency_ms": 8.2
}
```

## 5. Quickstart

```powershell
pip install -r requirements.txt

# Run contract tests (requires the model artifact + processed parquets)
python -m pytest tests/test_backend.py

# Start the API
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Swagger UI: <http://localhost:8000/docs>

Docker:

```powershell
docker compose up backend      # or: docker build -t sih2026-backend .
```

Data artifacts (parquets, DuckDB, `.cbm`) are gitignored; see
[data/README.md](data/README.md) for where they live and how they are produced.
