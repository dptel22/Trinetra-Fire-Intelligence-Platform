# Problem Statement — SIH 2026 PS26162

> **STATUS: CURRENT (scope declaration).** Rewritten 2026-09-10 to remove the
> unfilled placeholder and separate what is official from what is ours.
> Registry IDs (`C-xx`) refer to [`CLAIMS_AND_EVIDENCE.md`](CLAIMS_AND_EVIDENCE.md).

## 1. Official SIH Problem Statement

**UNKNOWN — the verbatim official PS26162 problem statement text is not
present in this repository** [C-31]. It was never pasted in; the previous
version of this file held the literal placeholder
`[Paste verbatim PS26162 requirements here]`.

What *is* recorded (project context, from the team's own concept note
`docs/decisions/SIH26162_Project_Document.docx`): problem ID SIH26162 /
PS26162, Software category, submission window closing 20 September 2026
[C-32].

**Evidence required to close this gap:** the verbatim text from the official
SIH 2026 problem-statement page/portal, pasted into this section with its
source URL. Until then, no repository document may quote "official"
requirements, thresholds, or evaluation criteria.

## 2. Repository Interpretation (ours — not official)

Based on the concept note and one-line summaries in `README.md`/`AGENTS.md`,
the team interprets the challenge as: **detect, classify, and contextualize
industrial fires / thermal hotspots across India** from NASA FIRMS VIIRS
satellite data, fused with OpenStreetMap and WRI power-plant context, so that
persistent industrial thermal activity can be distinguished from wildfire and
agricultural burning — and surfaced to an analyst with honest confidence
caveats rather than bare numbers.

This interpretation is **ours** [C-32]. It has not been validated against the
official text (Section 1).

## 3. Current Implemented Scope

What the repository actually implements today (all verified — see
[`CURRENT_PROJECT_TRUTH.md`](CURRENT_PROJECT_TRUTH.md) §22):

- Ingestion of FIRMS VIIRS detections (Suomi-NPP + NOAA-20 NRT) with immutable
  raw evidence archiving [C-15, C-36].
- H3 resolution-8 cell-day aggregation with leakage-safe temporal history
  [C-14, C-17].
- OSM/WRI static enrichment and state assignment [C-16].
- A trained CatBoost classifier (4 classes, 55 features, isotonic calibration,
  per-class review thresholds, on-demand SHAP) served fail-closed by a FastAPI
  backend [C-01–C-09, C-20].
- All-India serving design; current artifact covers 20 states/UTs
  [C-18].
- Analyst workflow: map review, alert lifecycle, audit trail, historical
  archive with provenance labels [C-22, C-36].
- React/MapLibre/deck.gl frontend with visible mock-mode honesty machinery
  [C-25–C-27].
- Validation: 135 backend tests passing on the current checkout; parity,
  provenance, and sanitization suites [C-23, C-35].

## 4. Gaps

Not implemented, not validated, or unknown:

- The verbatim official problem statement and any officially-specified
  latency/accuracy targets (previous docs claimed "<200 ms p99", "AUC > 0.85",
  "<3 s on 3G", "zero-downtime deployments" — none has repository evidence;
  the old targets were planning numbers, never measured [C-33, C-34]).
- Independent ground truth: model metrics estimate pseudo-label-scheme
  generalization, not real-world accuracy [C-10].
- Full-India-dense serving artifact (states without ingested detections have
  no cells) [C-18].
- No operational deployment, users, or field validation of any kind [C-33].
- Vector PMTiles offline basemap build; frontend test suite; unified
  `VITE_API_*` env naming [C-24, C-26].
