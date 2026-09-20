> **STATUS: HISTORICAL / SUPERSEDED (2026-09-02, re-verified 2026-09-10).**
> This script describes the old XGBoost/Postgres point-level demo
> (`ml-pipeline/`, 6 classes, `ml_pipeline.train`), which **has been removed**.
> It is retained only as an engineering-history record and MUST NOT be used as
> a current walkthrough or as a source of any claim.
>
> **Do not cite its numbers.** The metrics below (AUC 0.87, high-risk F1 0.72,
> "< 1 ms" inference) describe a system that no longer exists and were never
> reproducible in the current repository — see
> [`docs/CLAIMS_AND_EVIDENCE.md`](CLAIMS_AND_EVIDENCE.md) C-34.
>
> Current demo source of truth: [`docs/HACKATHON_JUDGE_RUNBOOK.md`](HACKATHON_JUDGE_RUNBOOK.md).

# Demo Script — SIH 2026 PS26162

## 3-Minute Judge Walkthrough

### 0:00-0:30 — Problem & Data
> "We're building a wildfire early warning system for India using NASA FIRMS satellite data. 
> We ingest 1.2M+ fire detections from VIIRS/SUOMI satellites, process them through an ML pipeline, 
> and serve real-time risk predictions on an interactive dashboard."

**Show**: Terminal running `docker-compose up` → all services healthy

### 0:30-1:15 — Data Pipeline
> "Raw CSVs from FIRMS have schema differences across sources. Our pipeline harmonizes them, 
> adds H3 spatial indexing, computes 90-day fire persistence per hexagon, and applies a rule cascade 
> to generate training labels."

**Show**: 
- `docs/eda-findings.md` schema comparison table
- `ml-pipeline/ingest/harmonize.py` processing 4 CSVs → 1 Parquet
- `ml-pipeline/features/` H3 + persistence computation

### 1:15-2:00 — Model & API
> "XGBoost trained on temporal split (Jan-Sep 2024 train, Oct-Dec validate). 
> AUC 0.87, high-risk F1 0.72. Model loads in FastAPI at startup, serves predictions in < 1ms."

**Show**:
- `docs/decisions/0001-model-choice.md`
- `curl localhost:8000/api/v1/model/metrics` → JSON with AUC, F1 per class
- `curl "localhost:8000/api/v1/predictions/87283082bfffffff"` → risk level + probability

### 2:00-2:45 — Dashboard
> "React + MapLibre dashboard: clustered fire points, H3 risk choropleth, time slider, 
> real-time alert feed via WebSocket."

**Show**:
- Open `localhost:5173`
- Map: India view, toggle fire points / H3 hexagons / risk layers
- Time slider: animate Aug 2024 fires day by day
- Alert panel: "High risk detected in cell 87283082bfffffff" appears live

### 2:45-3:00 — Architecture & Scale
> "Full stack in docker-compose: Postgres+PostGIS for spatial queries, Redis for caching, 
> FastAPI backend, Vite frontend. ML worker retrains daily. Ready for production deployment."

**Show**:
- `docker-compose.yml` services
- `docs/architecture.md` Mermaid diagram

---

## 30-Second Backup Demos (If Time)

### API Only
```bash
# Health
curl localhost:8000/health

# Recent fires in bbox (Delhi)
curl "localhost:8000/api/v1/fires?bbox=77.0,28.5,77.5,28.8&limit=10"

# Predictions for H3 cell
curl "localhost:8000/api/v1/predictions/87283082bfffffff"

# Model info
curl localhost:8000/api/v1/model/info
```

### ML Pipeline Only
```bash
# Run full pipeline
python -m ml_pipeline.train

# Check artifacts
ls -la ml-pipeline/train/
cat ml-pipeline/train/metrics.json
```

---

## Key Talking Points for Judges

1. **Production-ready architecture** — not a notebook demo, but containerized services with CI/CD
2. **Real satellite data** — 1.2M rows from actual FIRMS API, not synthetic
3. **Rule + ML hybrid** — interpretable thresholds + learned patterns
4. **Spatial intelligence** — H3 hexagons enable fast neighbor queries, aggregation
5. **Temporal awareness** — persistence features capture fire recurrence, not just single detections
6. **Team workflow** — folder ownership prevents merge conflicts, worktrees enable parallel dev