# SIH 2026 PS26162 — NASA FIRMS Thermal-Source Classification Backend

**Smart India Hackathon 2026 · Problem Statement 26162** — backend/data foundation for classifying persistent thermal sources (hotspots) from NASA FIRMS satellite data for geospatial decision support.

## 🚧 Current project status

This is a **backend prototype/foundation**. It is **not** a production, NTRO-certified, or "defense-grade" system: it is not validated against the real project data pipeline, and it has not been benchmarked. Do not treat it as complete.

## Current trained taxonomy

The **locked project decision** (see `docs/decisions/SIH_2026_26162_Technical_Findings_and_Backend_Summary_updated.docx`) is **four trained classes**: `industrial`, `mining`, `agricultural_burn`, `wildfire`.

**`unclassified` is NOT a trained class.** It is a **post-training confidence-threshold fallback** for human-review routing. **The confidence cutoff has not yet been validated** — no arbitrary threshold is final.

Other locked decisions:
- **Gas flare is not a separate class** — it was rejected as standalone and is **folded into `industrial`**.
- The **real 4-class label column does not yet exist**. The executed Phase 9 target remains `is_static_land` with `is_labeled`.

## What the code actually does today

- **FastAPI** backend: classification, batch classification, SHAP explanation, batch ingestion + in-memory dead-letter queue (DLQ), spatial viewport query, append-only audit trail.
- **CatBoost** multiclass classifier. **Note:** the prototype model uses **six labels** (Wildfire, Agricultural Burn, Industrial/Gas Flare, Mining Activity, Urban/Infrastructure, False Positive/Noise) — this **diverges from the locked four-class decision** and is a documented prototype divergence to be aligned, not the real taxonomy.
- **DuckDB** in-process feature store (H3 spatial context: landuse, canopy cover, distances) and audit log.
- **H3** resolution 8 as the spatial key.
- The bundled model is trained on **synthetic/demo sample data** (`data/sample_firms.csv`), not the real dataset; real 4-class labeling not executed.

## Executed data evidence (real pipeline, Technical Findings doc)

- ~2.598M FIRMS detections (executed two-year run)
- 1,718,002 H3-day rows
- 921,202 unique H3 cells
- H3 resolution 8

The **real H3-day pipeline is separate from the synthetic backend sample model** — not yet integrated.

## Architecture: intended vs implemented

**Intended blueprint** (future work, NOT all implemented): FastAPI; PostgreSQL/PostGIS for raw/vector storage; DuckDB as analytical H3 feature store; Redis caching/messaging; Celery async ingestion; Pydantic; precomputed feature vectors; H3 as common key; spatial-leakage prevention; on-demand SHAP; viewport culling; ingestion/DLQ; auditability; containerized.

**Currently implemented:** FastAPI + CatBoost + DuckDB + H3, Pydantic, in-memory DLQ (Redis/Celery **not implemented**), on-demand SHAP, append-only DuckDB audit log (**not** DB-enforced immutability), viewport endpoint (geo-filter correctness **to be verified**). "Sub-50 ms" etc. are **architecture targets, not measured benchmarks.**

## Running the backend

```bash
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
# Health: http://localhost:8000/health   Docs: http://localhost:8000/docs
```
If no model artifact exists, the app auto-trains a CatBoost model at startup (against synthetic sample data).

## What is NOT production-ready

- Real-data 4-class training
- Geographic/state split validation (locked decision; rigorous notebook not yet executed)
- Redis/Celery async ingestion
- DB-enforced audit immutability
- Verified viewport-culling spatial filtering
- Validated confidence threshold / calibrated probabilities
- Measured latency/performance benchmarks

## Authoritative references

`docs/decisions/SIH_2026_26162_Technical_Findings_and_Backend_Summary_updated.docx`. Backend details: `BACKEND_DOCUMENTATION.md`. Frontend: `FRONTEND_INTEGRATION_GUIDE.md`.
