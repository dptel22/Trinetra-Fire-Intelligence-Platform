# SIH 2026 PS26162 — Wildfire Detection & Alert System

> **Smart India Hackathon 2026** — Problem Statement 26162  
> End-to-end wildfire detection using NASA FIRMS satellite data

## Quick Start

```bash
# 1. Clone & configure
git clone <repo-url>
cd SIH_2026
cp .env.example .env
# Edit .env with your FIRMS_API_KEY, MAP_TILE_API_KEY

# 2. Start all services
docker-compose up -d

# 3. Verify
curl http://localhost:8000/health        # Backend API
open http://localhost:5173               # Frontend Dashboard
```

## Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   FIRMS     │───▶│  ML Pipeline │───▶│  Backend    │───▶│  Frontend   │
│   API/CSV   │    │  (XGBoost)   │    │  (FastAPI)  │    │  (React)    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │                   │
       ▼                   ▼                   ▼                   ▼
  data/raw/          ml-pipeline/          PostgreSQL          MapLibre
  data/processed/    ingest/features/      + PostGIS           Dashboard
  data/sample/       rules/train/          Redis               WebSocket
```

## Repository Structure

```
SIH_2026/
├── .github/workflows/     # CI/CD (lint, test, strip-notebooks)
├── .agents/               # AI agent memory & prompts
├── backend/               # FastAPI REST API (TBD - see backend/README.md)
├── frontend/              # React + TypeScript Dashboard (TBD - see frontend/README.md)
├── ml-pipeline/           # Production ML code (ingest → features → rules → train)
├── notebooks/             # Exploration ONLY (never imported by production)
├── data/                  # raw/ (gitignored), processed/ (gitignored), sample/
├── docs/                  # Architecture, decisions, EDA findings, demo script
├── infra/                 # Docker, env templates
├── .gitignore
├── .env.example
├── docker-compose.yml
├── CONTRIBUTING.md
└── README.md
```

## ML Pipeline (Production Code)

```bash
# Install
cd ml-pipeline && pip install -e .

# Run full pipeline
python -m ml_pipeline.train

# Or individual stages
python -m ml_pipeline.ingest.harmonize    # CSVs → Parquet
python -m ml_pipeline.features            # Add H3, persistence, history
python -m ml_pipeline.rules.labeler       # Rule-based labels
```

**Key thresholds** (configurable in `ml-pipeline/train/config.yaml`):
- FRP > 40 MW
- Brightness > 320 K
- Confidence ≥ nominal
- Persistence (90-day) ≥ 3 fires/H3 cell

## Data

~1.19M fire detections from 4 FIRMS sources:
- South Asia 7-day (3K rows)
- India 2024 VIIRS-SNPP (552K rows)
- SV-C2 Archive (534K rows)
- SV-C2 NRT (100K rows)

See `data/README.md` for schema details and `docs/eda-findings.md` for analysis.

## Team Workflow

- **Trunk-based**: Branch off `main`, PR → squash merge, delete branch
- **Folder ownership**: Each person owns one top-level folder (see `CONTRIBUTING.md`)
- **Git worktree**: Parallel branches in separate directories
- **Notebook hygiene**: Strip outputs before commit; promote to `ml-pipeline/` when ready

## Documentation

- `docs/problem-statement.md` — Requirements & interpretation
- `docs/architecture.md` — System diagram & data flow
- `docs/eda-findings.md` — Schema quirks, coverage gaps, feature insights
- `docs/decisions/0001-model-choice.md` — Why XGBoost
- `docs/demo-script.md` — 3-minute judge walkthrough

## License

MIT — Built for SIH 2026