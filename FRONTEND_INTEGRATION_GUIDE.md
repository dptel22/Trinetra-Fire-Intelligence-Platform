# Frontend Integration Guide — NASA FIRMS Thermal-Source Classification Backend

Tells a frontend developer what the API provides now and what is **planned**, so you don't build against what doesn't exist yet.

## Current API surface (implemented)
All under `/api/v1`; OpenAPI docs at `/docs`.

| Method | Path | Purpose | Status |
|---|---|---|---|
| GET | `/` | App/root + model-loaded + target classes | IMPLEMENTED |
| GET | `/health` | Health + model-ready | IMPLEMENTED |
| POST | `/classify` | Single prediction | IMPLEMENTED |
| POST | `/classify/batch` | Batch prediction | IMPLEMENTED |
| POST | `/explain` | SHAP explanation | IMPLEMENTED |
| POST | `/ingest/batch` | Validate + quarantine | IMPLEMENTED (in-memory DLQ) |
| GET | `/ingest/dlq` | Inspect quarantined | IMPLEMENTED (in-memory) |
| GET | `/spatial/viewport` | Hexagons for a viewport | PARTIAL (geo filtering to verify) |
| POST | `/audit/override` | Analyst override log | IMPLEMENTED (append-only) |
| GET | `/audit/logs` | Audit log inspection | IMPLEMENTED (append-only) |

## Target taxonomy — use this in the UI
Locked taxonomy is **four trained classes** plus a fallback:
- `industrial`
- `mining`
- `agricultural_burn`
- `wildfire`
- `unclassified` — **a fallback state, not a fifth trained class** (post-training confidence threshold for human-review routing).

> **Note:** the prototype model's API may return **six labels** (Wildfire, Agricultural Burn, Industrial/Gas Flare, Mining Activity, Urban/Infrastructure, False Positive/Noise). Treat as a prototype divergence to align to the four-class taxonomy; do not build a permanent UI contract around the six-label names.

## Probabilities / confidence — IMPORTANT
- Confidence field semantics are **not defined in the authoritative source material** (NOT FOUND IN SOURCE MATERIAL).
- **No validated confidence threshold** and **no calibrated probability semantics**. Do not build UI logic relying on a specific cutoff or calibrated probabilities.
- Describe the **current API behavior** (raw argmax class + `confidence%` / per-class `probabilities`) separately from the **final intended UX**.

## Intended UI contract (from UI blueprint — mostly PLANNED, not all implemented)
- H3-centric visualization, **viewport culling** + adaptive resolution/aggregation (endpoint exists; correctness unverified).
- Per-hotspot `predicted_class` and `class_probability`/`confidence` (raw today; no calibrated semantics).
- **Click-to-explain** via on-demand SHAP, **top-3 plain-language explanation** (endpoint: `POST /explain`).
- **Provenance/metadata access** and **audit visibility** (audit endpoints exist; provenance enrichment planned).
- **Graceful rendering degradation** as data volume grows.
- Early **MVP** vs later **final submission** separation.

> These are *envisioned/planned*; several depend on unimplemented backend work (real 4-class labels, validated confidence, verified viewport culling, production feature store integration).

## Best practice notes
- Loading/skeleton state for `/explain` (heavier endpoint).
- Debounce viewport requests; respect `limit` bounds (`ge=10, le=5000`).
- Handle unknown/fallback class values gracefully (`unclassified`).
