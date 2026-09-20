# P1 Context Handoff — Tracks A+B+C (Fire Map, PS26162)

Written 2026-09-12 by the z-code session for whichever AI continues. Read this
top to bottom; every decision below was explicitly confirmed with the user
(Dhruv) after two plan rejections — do not relitigate, but do re-read the
"Decision record" before touching serving.

## 1. What this work is

Three tracks, all assigned to this session, executed in dependency order.
The approved plan (verbatim) is in the conversation; the surviving summary:

- **Track A** — nationwide FIRMS archive backfill (2019-09-01 onward,
  8,461,514 raw rows measured) → materialized timeline layers, fail-closed
  validation, seasonal-comparability gate, out-of-state model sanity report,
  and end-to-end disclosure verification of the "outside training geography"
  caveat.
- **Track B** — (1) OSM historical feasibility probe with 6 fixed kill
  criteria; (2) thermal transition detection over monthly rollups, six
  states only, `land_use_claim: false` structurally unconditional.
- **Track C** — frontend "Recent Thermal History" UI in HexInspectorPanel
  with three visually distinct sections. **Handed to Codex** with a complete
  prompt (see §6); its state is unknown to this session.

## 2. Decision record (verified facts, explicitly signed off — do not reopen)

1. **There is no serving cutover decision.** Live serving is ALREADY
   geography-open. Proof: `app/services/model_service.py:129-133` ("training
   states used ONLY for provenance labeling — never to exclude rows from
   serving"), `query_bbox` filters lat/lon only, and a live API call over
   Kerala (bbox 8.3–12.8 / 74.8–77.5, acq_date 2026-09-09) returned 8 cells,
   with `geography: "india_outside_training"` and
   `caveat_flag: "Outside validated training geography — analyst review
   required. | Calibrated confidence is below the per-class review threshold;
   treat as provisional."` on out-of-training cells
   (`model_service.py:347,370-371,410-413`).
2. The earlier "nationwide + all-India serving" AskUserQuestion answer was
   **garbled dictation** (`"check full find plot hoels nad go forward"`) and
   was voided. The REAL sign-off, given explicitly afterwards:
   **"Nationwide + out-of-state model sanity report, no cutover"** — which is
   now moot on the cutover half (already open) and live on the report half.
3. Row counts are real `wc -l` output:
   `fire_archive_J1V-C2_804030.csv` 4,321,123 lines (4,321,122 rows + header),
   `fire_archive_SV-C2_804031.csv` 4,140,393 lines (4,140,392 + header),
   NRT 22,896 + 102,586 lines. Archive-first; NRT only for (satellite, date)
   pairs the archive doesn't cover.
4. Live store state distribution (measured via duckdb on
   `data/processed/sih2026_h3_daily_features_with_osm_wri.parquet`): the 10
   locked states hold ~810k rows; 10 other states hold 1–12 NRT spillover
   rows each (Kerala: 5 rows, single day 2026-09-09). After nationwide
   materialization, out-of-training volume becomes real — that is WHY item
   A.5 exists.
5. Reviewer amendments (mandatory): A.5 disclosure verification is FIRST-CLASS
   (rendered-UI proof with an out-of-training cell selected, not a grep), and
   must be RE-RUN against a nationwide cell after materialization. The sanity
   report must lead with sample-size honesty BEFORE any numbers (Kerala's
   current 5-cell sample is anecdotal; say so up front).
6. AGENTS.md logging protocol: AGENT_LOG.md is append-only; an entry was
   already appended for Step 0 + decision record. Append per track as work
   completes.

## 3. Step 0 (DONE)

`pytest tests/test_timeline_{service,endpoint,features,materializer}.py
tests/test_historical_backfill.py` → **11 passed** (16.39s). Logged to
AGENT_LOG.md under "2026-09-12 — P1 Tracks A+B+C planning gate (Step 0)".

## 4. Track A state

### DONE — code written and smoke-tested
- `ingestion/nationwide_backfill.py` — archive-first loader:
  `_read_tagged` renames archive column names (`brightness`→`bright_ti4`,
  `bright_t31`→`bright_ti5`, `type`→`fire_type`) BEFORE validation (real CSVs
  use archive naming — first background run failed on exactly this, fixed);
  `load_nationwide_points` keeps NRT rows only for (satellite, acq_date)
  pairs absent from the archive (smoke test: 100+100 NRT rows correctly
  dropped as overlap); `build_nationwide_backfill` runs
  `harmonize_points` (existing, does dedup/sanity/confidence) →
  `build_daily_frame` (existing) → `build_materialized_layers` (existing)
  into a **staging dir**, writes `timeline_provenance.json` (per-file sha256,
  confidence mixes, per-satellite dedup counts, NRT overlap drops) and
  `h3_timeline_daily_full.parquet`.
- `pipeline/timeline_validation.py` — fail-closed gate. BLOCKING checks:
  schema parity vs live serving frame (pyarrow header read), confidence
  policy, dedup/overlap arithmetic, H3 res-8 + validity, UTC date range ≥
  2019-09-01, state counts + India land mask (reuses
  `ingestion.osm_wri_load.assign_states`; requires 0 outside-India
  detections and ≥10 states), layer schema parity, output hashes. RECORDED
  (non-blocking): partial first period, archive gaps >30d. Plus
  `seasonal_comparability` (Sep–Dec 2019 vs latest live Sep–Dec; sets
  `partial_period_representative`, never fails). `validate_and_promote()`
  copies staging → `data/processed/timeline/` ONLY if all blocking checks
  pass, and always writes `validation_report.json`.
- `scripts/build_nationwide_backfill.py` — CLI; exits 1 if not validated.
- Smoke test on synthetic data: pipeline ran end-to-end; the ONLY failed
  check (`state_counts_land_mask`) failed for the right reason (fixture
  spans 2 states) and the land-mask sub-check passed (0 outside-India).

### IN FLIGHT — background run
`scripts/build_nationwide_backfill.py` running as background task
`exec_11a40fed-6b50-435f-b72e-6b19d533963b`, log at
`data/processed/timeline_build.log`. Expect it to take a long time (8.46M
rows; per-cell state assignment is the slow part — it's a per-row Python loop
in `assign_states`, ~460k distinct cells). FIRST RUN FAILED on the column
rename (fixed). **Watch for OOM**: machine has 15.65GB RAM; if it dies,
process file-by-file or chunk the state assignment.

### TODO after the run
1. Read `data/processed/timeline/staging/validation_report.json`; if
   `validated: true`, layers are promoted and the timeline API starts serving
   2019+ data. If false, fix the named check, re-run validation only.
2. Paste real numbers (counts, gaps, seasonal flag) into AGENT_LOG.md.
3. **A.5 sanity report** (`docs/out_of_state_sanity_report.md` + scores
   parquet): score current CatBoost on sampled cells from Assam/Kerala/UP —
   inference only. Use `model_service` directly. Sample-size honesty first.
4. **A.5 disclosure re-verification**: re-run
   `frontend/verify_disclosure_pass1.mjs` (needs a live server: start uvicorn
   on 8000) against a nationwide out-of-training cell; save DOM to
   `disclosure_pass1_dom.html` equivalent; log both passes.

## 5. Track B state

### Transition detection — FIXED after code review (was unreachable in v1)
- `pipeline/transition_detection.py` — `annotate_transitions(monthly_frame)`
  + `_annotate_cell`. Six states in `TRANSITION_STATES` frozenset. Regime =
  trailing-12-month window on active months (persistent ≥10/12; seasonal 3–7
  /12 with ≥3 contiguous inactive). Acceptance: regime change at month i
  requires regimes[i-2]==prev and regimes[i+1]==new (two consecutive months
  each side), both boundary months ≥10 detections AND ≥3 fire days, and
  boundary `archive_gap_days` (monthly summed, the rollup-native >30d proxy —
  marked with a `# ponytail:` comment) ≤30 on both sides. Rows carry
  `transition_state/type/confidence(low|medium|high by min det count
  50/20)/transition_evidence/supporting_detection_count/
  supporting_active_days/gap_before_transition_days/land_use_claim(False)`.
  Hard `assert` guarantees land_use_claim False everywhere and the state set.
  `class_change` only fires when a `dominant_class` column exists.
  **Potential bug to check when testing**: the regime-change acceptance loop
  requires `regimes[i-2] == prev` — but `regimes[i-1] == prev` is already
  implied by the branch condition; the i-2 check enforces the OLD regime was
  established (good), and `regimes[i+1] == new` enforces two consecutive
  months of the new regime. Verify the loop bounds (`range(2, n-1)`) let the
  i+1 check work — it does since i+1 ≤ n-1.
- **NOT DONE — wire-in (one edit)**: `app/services/timeline_service.py`
  `_period_frame` (lines 184-187) hardcodes
  `transition_state: "insufficient_history"` etc. Replace with a call to
  `annotate_transitions(frame)` on the built monthly frame. Yearly frames
  must keep `insufficient_history` (guard: only call when granularity ==
  "month"). `class_change` needs a `dominant_class` mode-aggregate added in
  `_period_frame` ONLY if a predicted-class column exists in the daily frame
  (check `data/processed/sih2026_h3_daily_features_firms.parquet` columns —
  the 27-col daily frame listed in §4 does NOT obviously have one; if absent,
  class_change stays unreachable, which is acceptable and honest).
- **NOT DONE — tests** `tests/test_transition_detection.py` (mirror
  `tests/test_timeline_service.py` inline-DataFrame style): stable cell →
  `stable`; one-day noise (single-month 1-detection spike) → no transition;
  accepted `seasonal_to_persistent`; gap-crossing boundary REJECTED
  (boundary month archive_gap_days > 30); <12 months → `insufficient_history`;
  land_use_claim False on all rows; state set == exactly six. Paste outputs
  for ≥1 stable, 1 seasonal, 1 gap cell per the task spec.

### OSM probe — RAN, honest verdict not_available_in_environment (see AGENT_LOG 2026-09-12; Codex executed: criteria 1-2 pass, criterion 3 fail — Wayback 403/429)
`scripts/check_osm_history.py` is a 34-line stub. Build per plan:
per-criterion JSON, no smoothing. Criteria: pyosmium 4.3.1 installed (criterion
1, already true); egress HEAD to web.archive.org 10s timeout, fail →
`not_available_in_environment` (criterion gate); download an archive.org
capture of Geofabrik india-latest.osm.pbf (~1.7GB) to `data/raw/osm_history/`
— integrity = sibling .md5 when available + pyosmium `Reader.header().box()`
must intersect India (lat 6.5–35.5, lon 68–97.5) + size sanity (criterion
gate); time-filtered extraction reusing the memory-bounded 3-pass
FileProcessor pattern at `ingestion/osm_wri_load.py:235-334` (KeyFilter on
the six CATEGORY_TAGS + BeforeFilter(vintage)) measured with
time.monotonic (≤2h); scratch ≤50GB; psutil peak RSS ≤16GB; ~1000 sampled
way geometries via shapely.is_valid ≥95%; H3-8 index the filtered features ∩
459,972 active cells from
`data/processed/sih2026_h3_daily_features_firms.parquet` ≥20% coverage.
Decision: `adopted` | `not_available_in_environment` |
`not_adopted_budget_exceeded`. On pass ONLY:
`data/processed/osm_features_cache_<vintage>.parquet` +
`osm_history_manifest.json`, and `timeline_service.build_response` context
(osm_context_vintage / historical_context_available at lines ~243-248 and
_empty_response ~line 300) reads the manifest. On fail: `current_snapshot` /
`false` stays permanently. WRI: measured already — GPPD v1.3.0 has
`commissioning_year` for only 496/1,589 India plants (31%) and ZERO
status/retirement fields → `wri_time_aware: false`, WRI stays
current-snapshot; put these numbers in the probe output. Unit test
`tests/test_osm_probe.py` on the decision-logic function only (no 1.7GB
fixture). Environment facts: 68GB free disk, 15.65GB RAM, Python 3.12.13 in
`.venv` (uv-managed, no pip module), pyosmium 4.3.1, current PBF at
`data/raw/india-260907.osm.pbf` (1.7GB, 2026-09-07).

## 6. Track C — HANDED TO CODEX

Full prompt was given to Codex (see conversation). Scope: `api.js` mock
branch only (`fetchCellTimeline` currently throws in mock mode; replace with
`MOCK_TIMELINES` dict keyed by cellId for 4 states: stable / transition /
degraded-fallback / `historical_context_available: false`), rework ONLY the
timeline section of `HexInspectorPanel.jsx` (lines ~264-327) into three
distinct sections (S1 "Recent Thermal History" with granularity segmented
control day/month/year + refetch; S2 current OSM/WRI labeled "present-day
snapshot" reusing the exported `StatusBadge` from FireAlertsPage.jsx; S3
historical land-use only if `context.historical_context_available`, else
explicit "cannot check" state), label rule (multi-year language only if
`materialization_status==='materialized'` AND ≥5y span), reuse the existing
inline role="alert" degraded banner, update `frontend/test_timeline.mjs`
(currently asserts 'FIRMS Thermal History' and 'Thermal evidence only' —
will need updating, and becomes GREEN once the mock lands). Verification:
`node test_timeline.mjs`, `npm run lint` (oxlint), `npm run build`, DOM
snapshots of 4 states. **Check what Codex actually did before merging; do
not assume.**

## 7. Known environment traps

- DuckDB single-writer: `data/audit_log.duckdb` locks if a server is running.
  The user KILLED the running backend (PID 3704) and Vite (17580) mid-session;
  ports 8000/5173 were left free. Start servers only when needed (A.5
  verification) and stop them after.
- `.venv` is uv-managed — use `.venv/Scripts/python.exe`, there is no pip
  module; install with `uv pip install` if ever needed.
- Plan mode blocks network calls; probe download must run with plan mode off.
- `harmonize_points` requires valid HHMM acq_time and bright_ti4 > 200,
  frp ≥ 0 — synthetic fixtures must respect that.
- Timeline API is frozen (Step 1 contract, `app/schemas/timeline.py`);
  transition fields ride inside `rows: list[dict]` so NO schema change is
  needed — do not add top-level fields.

## 8. Status update (2026-09-12 post-review session)

- Code review returned 9 findings (5 blockers); ALL addressed: transition
  module rewritten + 14 tests incl. positive paths and end-to-end; positional
  bug fixed; _row_dict passes full evidence payload; serving reads the
  requested granularity's layer directly; validator gates promotion on
  seasonal comparability (blocking, complete-window baseline, documented
  override); dedup integrity proven by independent cross-checks; exact frozen
  schema parity for daily/monthly/yearly; per-source provenance + point-level
  provenance sidecar added to the builder.
- Nationwide run re-launched after the rework (background); Track A is not
  "complete" until data/processed/timeline/ holds promoted layers + a passing
  validation_report.json.
- AGENT_LOG carries a correction entry (append-only) reconciling the earlier
  overstatement. This file's §4/§5/§8 reflect post-fix state.

## 9. Suggested continuation order (supersedes §8 header above)

1. Monitor background task `exec_11a40fed...` → validation report → log.
2. Wire transitions into `_period_frame` + write/track tests (fast, pure).
3. Run transition tests + paste outputs (stable/seasonal/gap/noise).
4. OSM probe script + unit test; run probe (needs egress; honest fallback OK).
5. Sanity report + A.5 re-verification (needs server; after materialization).
6. Review Codex's Track C work; run lint/build/test_timeline.mjs yourself.
7. AGENT_LOG.md entries for A, B, C + verification pastes in final message.
