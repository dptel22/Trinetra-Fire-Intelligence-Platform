# Contributing — SIH 2026 PS26162

## Agent Orchestration
This project is maintained through AI-agent orchestration (Owner A/B split for frontend).
- Refer to [`AGENTS.md`](AGENTS.md) and [`CLAUDE.md`](CLAUDE.md) for shared agent context.
- All meaningful changes MUST be logged in [`AGENT_LOG.md`](AGENT_LOG.md) (append-only protocol).
- Per-agent task prompts are in `docs/AGENT_A_PROMPT.md` and `docs/AGENT_B_PROMPT.md`.

## Workflow
- Trunk-based development: `main` is protected.
- Feature branches: `feat/<short-desc>` or `fix/<short-desc>`.
- Log every change in `AGENT_LOG.md`.
- Ensure backend (`app/`) and frontend (`frontend/`) tests pass before merging.

## Code Style
- Python: `ruff` + `mypy` (config in `pyproject.toml`).
- TypeScript: `oxlint` (config in `package.json`).

## Getting Started
See [`docs/PROJECT_SETUP.md`](docs/PROJECT_SETUP.md) for full Windows clone-and-run instructions.
