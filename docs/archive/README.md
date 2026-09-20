# Documentation Archive

Everything in this directory is **kept for provenance, not for guidance**. It
either describes systems that were removed, decisions that were superseded, or
internal engineering process material. Nothing here is a contract for the
current system.

For the current system, start at [`docs/CURRENT_PROJECT_TRUTH.md`](../CURRENT_PROJECT_TRUTH.md)
and the documentation map in [`docs/README.md`](../README.md).

## `research/` — superseded research and historical records

| Document | Why it is archived |
|---|---|
| [`demo-script.md`](research/demo-script.md) | Describes the removed XGBoost/Postgres/Redis demo; its metrics (AUC 0.87, `<1 ms`) were never reproducible in the current repo. |
| [`eda-findings.md`](research/eda-findings.md) | Early EDA; risk-tier taxonomy and H3-res-7 recommendation superseded. |
| [`Final model.md`](Final%20model.md) | Rationale essay; assumes a six-class model and "defense-grade" framing that is project interpretation, not an official requirement. |
| [`0001-model-choice.md`](research/0001-model-choice.md) | XGBoost-era decision record, bannered superseded. |

## `internal/` — engineering process history

Agent briefs, handoffs, PR review notes, and coordination logs from the
September 2026 rebuild. They record how the code was built, not how it
behaves:

`AGENT_A_PROMPT.md` · `AGENT_B_PROMPT.md` · `CONTEXT_HANDOFF_P1.md` ·
`backend-rebuild-coordination.md` · `PR10_REVIEW_NOTES.md` ·
`FRONTEND_HISTORICAL_AUDIT_PLAN.md` · `coordination/`

Historical claims from these documents must never be cited as current
behavior — see the `C-33` / `C-34` governance rows in
[`docs/CLAIMS_AND_EVIDENCE.md`](../CLAIMS_AND_EVIDENCE.md).
