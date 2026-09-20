# API Reference — Trinetra Fire Intelligence Platform

All routes live under the `/api/v1` prefix (the root prediction routes are
also aliased without the prefix for compatibility). Interactive OpenAPI docs:
`http://localhost:8000/docs`. This file is a route map; the authoritative
request/response schemas are the Pydantic models in `app/schemas/`.

## System

| Method & path | Purpose |
|---|---|
| `GET /api/v1/health` | Model load state, feature-schema version/hash, artifact path, target classes, newest served `acq_date` |

## Classification & predictions (`app/api/endpoints/classify.py`)

| Method & path | Purpose |
|---|---|
| `GET /api/v1/predictions?min_lat&max_lat&min_lon&max_lon&acq_date[&zoom]` | Cell-day predictions in a bbox. **One `acq_date` per request** (no ranges); `zoom` optional (default 8, range 1–20). Server-side `LIMIT 2500`, no offset/cursor — clients tile. Returns `ViewportPredictionsResponse { mode, zoom, total_predictions, predictions[] }`. |
| `GET /api/v1/predictions/{cell_id}?acq_date=` | One cell-day: class, calibrated confidence, per-class probabilities, OSM/WRI context |
| `GET /api/v1/predictions/{cell_id}/explain?acq_date=` | On-demand CatBoost TreeSHAP: top-3 attributions + base value + humanized feature names |
| `POST /api/v1/classify` | Single-record classification of a FIRMS record (legacy alias, same engine) |
| `POST /api/v1/classify/batch` | Batch classification; returns per-record predictions + average latency |
| `POST /api/v1/explain` | Single-record SHAP explanation (legacy alias) |

`PredictionResponse` fields: `cell_id, latitude, longitude, h3_index,
predicted_class, probabilities[{class_name, probability}], confidence (0–1),
calibrated, needs_review (bool), caveat_flag (string\|null, multiple joined
with " \| "), latency_ms`.

Honesty semantics served by the backend (never re-derived client-side):

- `confidence` is the calibrated max class probability — a model output, not
  an accuracy claim.
- Review thresholds (raw class): wildfire 0.70, industrial 0.70, mining 0.85,
  agricultural_burn 1.01 → `agricultural_burn` is mechanically always
  `needs_review=true`.
- Abstention: calibrated confidence below `UNCLASSIFIED_THRESHOLD`
  (default **0.65**, disable with `off`) → `predicted_class="unclassified"`.
- Thermal regime (`persistent` / `new_anomaly` / `intermittent`) and
  transition states are **mechanical history analytics** carried alongside
  predictions — they are not model outputs.

## Historical archive (`app/api/endpoints/archive.py`)

| Method & path | Purpose |
|---|---|
| `GET /api/v1/archive/dates` | Archived days available |
| `GET /api/v1/archive/predictions?acq_date=[&class_name&state&needs_review&min_confidence&max_confidence&limit=200(≤1000)&offset]` | Browse one archived day with filters |
| `GET /api/v1/archive/summary?start_date&end_date` | Aggregates over a range (window ≤ 31 days) |

## Raw evidence & run manifests (`app/api/endpoints/evidence.py`)

| Method & path | Purpose |
|---|---|
| `GET /api/v1/archive/runs?acq_date=&limit=20(≤200)` | Ingestion run records; provenance labels (`live`/`historical`/`offline`/`failed`/`plausibility_warning`/`no_run_record`) come from the manifest — nothing fabricates freshness |
| `GET /api/v1/archive/evidence` | Raw FIRMS evidence backing a prediction |

## Historical timeline (`app/api/endpoints/timeline.py`)

| Method & path | Purpose |
|---|---|
| `GET /api/v1/cells/{h3_index}/timeline?granularity=month&start_date&end_date&cursor&limit=100(≤500)` | Per-cell historical FIRMS timeline (`day`/`month`/`year`), cursor-paginated, backed by materialized layers under `data/processed/timeline/` |

## Alert lifecycle (`app/api/endpoints/alerts.py`)

| Method & path | Purpose |
|---|---|
| `GET /api/v1/alerts/states?acq_date=` | Alert states for a day |
| `POST /api/v1/alerts/{hotspot_id}/actions` | Record an analyst action on an alert |
| `GET /api/v1/alerts/{hotspot_id}/history` | Alert action history |

`hotspot_id` encodes the (h3_08, acq_date) pair.

## Audit trail (`app/api/endpoints/audit.py`)

| Method & path | Purpose |
|---|---|
| `POST /api/v1/audit/override` | Analyst class override (append-only) |
| `GET /api/v1/audit/logs` | Retrieve audit log |

Overrides are append-only in `data/audit_log.duckdb`.
