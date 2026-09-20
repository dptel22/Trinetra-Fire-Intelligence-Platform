# Documentation Map — SIH 2026 PS26162

**Rebuilt 2026-09-10. Reorganized 2026-09-20** — superseded research and
internal engineering-process material moved to
[`docs/archive/`](archive/README.md) so it is no longer mixed with current
documentation. This index classifies every documentation file by its
role in the source-of-truth hierarchy. If you are unsure which document to
trust, trust the highest level.

## Source-of-truth hierarchy

### LEVEL 1 — Hard truth (always authoritative)

| Source | What it proves |
|---|---|
| `app/`, `ingestion/`, `pipeline/` code | Actual system behavior |
| `models/PS26162_catboost_final/inference_bundle/` (git-tracked) | Served model contract (55 features, thresholds, calibrators) |
| `app/core/config.py`, schemas | API/data contracts |
| `tests/` (195 passed / 7 skipped with pinned data, 2026-09-20; see C-23) | Verified behavior |
| **[`docs/CURRENT_PROJECT_TRUTH.md`](CURRENT_PROJECT_TRUTH.md)** | Canonical narrative of all of the above |
| **[`docs/CLAIMS_AND_EVIDENCE.md`](CLAIMS_AND_EVIDENCE.md)** | Claim → evidence registry; gates every factual statement |

### LEVEL 2 — Operational truth (current how-to)

| Document | Role | Status |
|---|---|---|
| [`docs/PROJECT_SETUP.md`](PROJECT_SETUP.md) | Canonical clone-and-run guide, artifact inventory | CURRENT |
| [`docs/HACKATHON_JUDGE_RUNBOOK.md`](HACKATHON_JUDGE_RUNBOOK.md) | Judge demo path + truthfulness rules | CURRENT |
| [`BACKEND_DOCUMENTATION.md`](../BACKEND_DOCUMENTATION.md) | API contract reference | CURRENT |
| [`FRONTEND_INTEGRATION_GUIDE.md`](../FRONTEND_INTEGRATION_GUIDE.md) | Frontend→backend contract | CURRENT |
| [`docs/PMTILES_BUILD.md`](PMTILES_BUILD.md) | Optional offline vector basemap build | CURRENT (optional build) |
| [`docs/WHOLE_SYSTEM_AUDIT.md`](WHOLE_SYSTEM_AUDIT.md) | 2026-09-10 adversarial audit + remediation record | CURRENT (audit snapshot) |
| [`AGENT_LOG.md`](../AGENT_LOG.md) | Append-only change log — latest entries first | CURRENT LOG |
| [`AGENTS.md`](../AGENTS.md) / [`CONTRIBUTING.md`](../CONTRIBUTING.md) | Agent + contributor conventions | CURRENT |

### LEVEL 3 — Research / analysis (rationale, not contracts)

| Document | Status |
|---|---|
| [`docs/decisions/VIIRS_EDA_Findings_Report.docx`](decisions/) | RESEARCH — EDA transcription of the 2.59M-row corpus |
| [`docs/decisions/SIH_2026_26162_Technical_Findings_and_Backend_Summary_updated.docx`](decisions/) (+ PDF twin) | RESEARCH — training-side locked decisions record |
| [`docs/archive/research/Final model.md`](archive/research/Final%20model.md) | ARCHIVED RESEARCH — CatBoost rationale essay; assumes 6 classes; "NTRO compliance" framing is project interpretation, not official requirement. Do not cite as current implementation. |
| [`docs/Beyond SNPP-Only….md`](Beyond%20SNPP-Only_%20A%20VIIRS-NOAA-20%20Merge%20as%20the%20Optimal%20Data%20Strategy%20for%20Thermal%20Hotspot%20Classification.md) | RESEARCH — satellite merge strategy; assumes XGBoost/6 classes (superseded assumptions) |
| 7 research PDFs under `docs/decisions/` | RESEARCH — rationale corpus; several predate the 4-class lock |
| `docs/state_evidence_table.csv` | RESEARCH artifact — per-state label evidence |

### LEVEL 4 — History (must never be mistaken for current)

| Document | Status |
|---|---|
| [`docs/architecture.md`](architecture.md) | **REWRITTEN as CURRENT 2026-09-10** — the pre-rewrite Era-0 version (XGBoost/res-7/Postgres/Redis) is superseded |
| [`docs/archive/research/demo-script.md`](archive/research/demo-script.md) | HISTORICAL — removed XGBoost demo; numbers (AUC 0.87, <1 ms) must not be cited |
| [`docs/archive/research/eda-findings.md`](archive/research/eda-findings.md) | HISTORICAL — early EDA; risk-tier taxonomy and res-7 recommendation superseded |
| [`docs/archive/research/0001-model-choice.md`](archive/research/0001-model-choice.md) | HISTORICAL — bannered superseded (XGBoost-era decision record) |
| [`docs/decisions/SIH26162_Project_Document.docx`](decisions/) | PLANNING — team concept note (paraphrase of the challenge; not the official statement text) |
| [`docs/decisions/SIH26162-Implementation-Plan.docx`](decisions/) | PLANNING — superseded (5 classes incl. `gas_flare`, XGBoost) |
| [`docs/decisions/backend_verification_VERIFIED_updated.docx`](decisions/) | HISTORICAL — external audit of the old SA branch; defects since fixed |
| [`docs/archive/internal/backend-rebuild-coordination.md`](archive/internal/backend-rebuild-coordination.md) | HISTORICAL — 2026-09-02→08 coordination log |
| [`docs/archive/internal/PR10_REVIEW_NOTES.md`](archive/internal/PR10_REVIEW_NOTES.md) | HISTORICAL — PR review tracking; some items since fixed |
| [`docs/archive/internal/AGENT_A_PROMPT.md`](archive/internal/AGENT_A_PROMPT.md) / [`AGENT_B_PROMPT.md`](archive/internal/AGENT_B_PROMPT.md) | HISTORICAL — completed frontend agent briefs |
| [`../TRAINING_SERVING_SKEW_TEST_REPORT.md`](../TRAINING_SERVING_SKEW_TEST_REPORT.md) | HISTORICAL — 2026-09-08 parity report (partially superseded; living source is the parity test) |
| [`docs/archive/`](archive/README.md) | Archive root — historical research + internal process material | HISTORICAL |
| `docs/problem-statement.md` → see below | — |

### Scope declarations

| Document | Status |
|---|---|
| [`docs/problem-statement.md`](problem-statement.md) | CURRENT — declares the official PS text UNKNOWN (not in repo); records our interpretation, implemented scope, and gaps |

## Decision-log format

Decisions live in `docs/decisions/` (one file per major call):
title + date, context/problem, options considered, decision + rationale,
consequences/trade-offs. New decision records must state whether the decision
is IMPLEMENTED or PLANNED at time of writing.
