# Contributing — SIH 2026 PS26162

## Branching Model

**Trunk-based development** — no long-lived `dev` branch.

- `main` — protected, always demo-able. No direct pushes.
- Feature branches: `<area>/<short-desc>` (e.g., `ml/persistence-feature`, `backend/flare-api`, `frontend/map-overlay`)
- Branch off `main`, keep alive < 1 day where possible
- PR → squash merge → delete branch
- Pre-merge checklist: Does this touch files outside my owned folder? If yes, flag in PR description.

## Folder Ownership (6 People)

| Person | Owns | Branch Prefix |
|--------|------|---------------|
| ML/Rules Lead | `ml-pipeline/`, `notebooks/experiments/` | `ml/` |
| Data Engineer | `data/`, `ml-pipeline/ingest/` | `data/` |
| Backend Dev | `backend/` | `backend/` |
| Frontend Dev | `frontend/` | `frontend/` |
| Integration/DevOps | `infra/`, `.github/` | `infra/` |
| Docs/Agent Orchestration | `docs/`, `.agents/` | `docs/` |

**Principle**: Two people rarely touch the same folder in the same PR. Cross-folder needs = conversation + small scoped PR.

## Git Worktree Workflow

Since each person stays in one folder, `git worktree` lets you have two branches checked out simultaneously:

```bash
# From main clone
git worktree add ../sih-ml-feature ml/persistence-feature
# Now you have two working directories:
# - Main clone (on main)
# - ../sih-ml-feature (on ml/persistence-feature)
# Each opens in its own editor window
```

Useful for ML lead flipping between "quick fix on main" and "long-running experiment".

## Notebook Hygiene

**Notebooks are for exploration only. Nothing in `notebooks/` is ever imported by production code.**

Promotion path:
1. Prototype in `notebooks/experiments/`
2. Once logic works, rewrite as module in `ml-pipeline/` in its own PR
3. Notebook stays as record of *how* you got there

**Before every commit**: Strip outputs (`nbstripout` or Jupyter "Clear All Outputs"). Committed output cells with images/data = #1 cause of unreadable merge conflicts.

## Commit Messages

Follow Conventional Commits:
```
feat(ml): add persistence_90d feature
fix(data): handle missing instrument column in harmonize
docs: update architecture diagram
```

## PR Requirements

- Self-review before requesting review
- All CI checks pass (lint, test, strip-notebooks)
- No uncommitted `.env` or large data files
- If touching another team's folder: explicit note in PR description

## Code Style

- Python: `ruff` + `mypy` (config in `pyproject.toml`)
- TypeScript: `eslint` + `prettier` (config in `package.json`)
- Notebooks: `nbstripout` pre-commit hook

## Getting Started

```bash
# 1. Clone
git clone <repo-url>
cd SIH_2026

# 2. Copy env template
cp .env.example .env
# Fill in FIRMS_API_KEY, MAP_TILE_API_KEY

# 3. Start stack
docker-compose up -d

# 4. Verify
curl localhost:8000/health
open localhost:5173
```

## Useful Commands

```bash
# Run ML pipeline locally
cd ml-pipeline && pip install -e . && python -m ml_pipeline.train

# Run backend tests
cd backend && pytest tests/ -v

# Run frontend dev
cd frontend && npm run dev

# View logs
docker-compose logs -f backend
```