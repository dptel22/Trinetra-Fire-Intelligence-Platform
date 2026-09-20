# Nationwide FIRMS Archive Backfill (2019-09 → 2026-09) — Adjusted Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest the verified 2019-09-01→2026-09-01 FIRMS archive (DL 804030/804031) through the existing Track A pipeline, re-materialize the timeline, verify the serving path end-to-end, and correct the project's coverage claims — without silently regenerating confidence scores.

**Architecture:** No new pipeline code. `ingestion/nationwide_backfill.py` (archive-first, NRT fallback per `(satellite, acq_date)`) → `harmonize_points` (dedup/sanity/confidence) → `build_daily_frame` → `build_materialized_layers` (daily/monthly/yearly + manifest) → `pipeline/timeline_validation.py` fail-closed gate → promotion into `data/processed/timeline/`. All driven by `scripts/build_nationwide_backfill.py`, which exits 1 unless every blocking check passes.

**Tech Stack:** Python 3.12.13 (`.venv`, uv-managed — always `.venv/Scripts/python.exe`), DuckDB, pyarrow, pytest, FastAPI/uvicorn for serving verification.

## Global Constraints

- **Adjusted from the draft plan after Phase 0 verification (2026-09-20):** raw files exist and are verified; nothing was ever ingested from them. Phase 0 is CLOSED — do not re-litigate.
- **Module correction:** these CSVs are ingested by `ingestion/nationwide_backfill.py`, NOT `ingestion/raw_archive.py` (that module archives *live-fetch* per-day parquets under `data/archive/firms/` and has never been written to). The draft plan's `ingestion/aggregate.py` reference is also off-path: dedup/sanity/confidence run inside `harmonize_points` on this route.
- **Disk reality (worse than AGENT_LOG claims):** serving parquets hold 1,177 rows (2026-08-01→2026-09-19, rebuilt 2026-09-19 13:20). `backup_nationwide_pre_10state/` and `backup_10state_pre_nationwide_restore/` do NOT exist. The pre-backfill state is effectively irreplaceable — hence Task 0's one-time backup.
- **RAM ceiling: 15.65 GB.** `assign_states` is a per-row Python loop over ~460k+ distinct cells; the 2026-09-12 run OOM-risk note stands. If the build dies on memory, fall back to file-by-file/chunked processing (see Task 2 contingency) — do not "try again as-is".
- **DuckDB single-writer:** stop uvicorn/Vite before any pipeline run (`data/audit_log.duckdb` and `feature_store.duckdb` lock).
- **Calibrator provenance is unresolved.** Historical confidence scores may be shipped only as explicitly provisional (Task 4). Never regenerate them silently.
- **AGENT_LOG.md is append-only**; append one entry per task that changes data or docs.
- **Locked taxonomy/colors and the frozen timeline API contract (`app/schemas/timeline.py`) are untouched.** Transition fields ride inside `rows: list[dict]` — no schema changes.
- Frontend code is out of scope for this plan except read-only serving verification through the API.
- **Execution note:** if subagent dispatch fails on quota (observed 2026-09-19), fall back to inline execution (superpowers:executing-plans) rather than stalling — record the fallback in AGENT_LOG.
- `ingestion_run_history.json` currently holds one seeded 2026-09-19 run (RUN-20260919T000000-seed01); it is not evidence of archive ingestion. Leave it in place; Task 1's merge makes the manifest authoritative for freshness.

---

### Task 0: Preflight — one-time safety snapshot and environment check

**Files:**
- Create: `data/processed/backup_pre_2019_backfill/` (copy of current tiny serving parquets)
- Modify: nothing else

**Interfaces:**
- Consumes: current `data/processed/sih2026_h3_daily_features_firms.parquet`, `sih2026_h3_daily_features_with_osm_wri.parquet`
- Produces: a restorable snapshot + free RAM/disk numbers recorded in the log

- [ ] **Step 1: Stop servers and confirm ports are free**

```bash
# Kill any uvicorn (8000) / Vite (5173) processes; then confirm:
netstat -ano | grep -E ":(8000|5173)\s" || echo "ports free"
```

- [ ] **Step 2: Backup the current serving parquets (one-time, tiny — 84 KB + 138 KB)**

```bash
cd "C:/Users/dhruv/PycharmProjects/SIH_2026"
mkdir -p data/processed/backup_pre_2019_backfill
cp data/processed/sih2026_h3_daily_features_firms.parquet \
   data/processed/sih2026_h3_daily_features_with_osm_wri.parquet \
   data/processed/ingestion_run_history.json \
   data/processed/backup_pre_2019_backfill/
ls -la data/processed/backup_pre_2019_backfill/
```

Expected: 3 files listed. This is the only snapshot of the current store state — do not delete it after success.

- [ ] **Step 3: Record free disk and confirm inputs**

```bash
.venv/Scripts/python.exe -c "
import shutil, duckdb
print('free GB:', round(shutil.disk_usage('C:/')[2]/1e9, 1))
for f in ['data/raw/DL_FIRE_J1V-C2_804030/fire_archive_J1V-C2_804030.csv',
          'data/raw/DL_FIRE_SV-C2_804031/fire_archive_SV-C2_804031.csv']:
    print(f.split('/')[-1], duckdb.sql(f\"select count(*), min(acq_date), max(acq_date) from read_csv('{f}', header=true)\").fetchone())
"
```

Expected: ≥15 GB free; J1V → 4,321,122 rows 2019-09-01→2026-05-31; SV → 4,140,392 rows 2019-09-01→2026-04-27. If numbers differ, STOP and re-verify the downloads before proceeding.

- [ ] **Step 4: Baseline test run (the suite must be green BEFORE, or post-run failures are ambiguous)**

```bash
.venv/Scripts/python.exe -m pytest tests/test_timeline_service.py tests/test_timeline_endpoint.py tests/test_timeline_features.py tests/test_timeline_materializer.py tests/test_historical_backfill.py tests/test_transition_detection.py -q -p no:cacheprovider
```

Expected: all pass against the current store (the 2026-09-12 baseline was 11 passed; the suite has grown since — record the actual count). Append a Task 0 entry to `AGENT_LOG.md` (backup path, free disk, baseline test count).

---

### Task 1: Full archive backfill run (Phase 1 + Phase 2 of the draft, one command)

**Files:**
- Create: `data/processed/timeline/staging/` (staging layers, `timeline_provenance.json`, `validation_report.json`)
- Modify (on promotion): `data/processed/timeline/h3_timeline_{daily,monthly,yearly}.parquet`, `materialization_manifest.json`

**Interfaces:**
- Consumes: `data/raw/DL_FIRE_{J1V-C2_804030,SV-C2_804031}/` (archive + NRT CSVs — default input dirs in `scripts/build_nationwide_backfill.py:21-22` match, no CLI args needed)
- Produces: promoted timeline layers + `validation_report.json` with `validated: true`; `timeline_provenance.json` carries per-file sha256, per-satellite dedup counts, NRT overlap drops, confidence mixes

- [ ] **Step 1: Launch the build in the background with a log**

```bash
cd "C:/Users/dhruv/PycharmProjects/SIH_2026"
.venv/Scripts/python.exe scripts/build_nationwide_backfill.py > data/processed/timeline_build.log 2>&1
```

Run as a background task. Expected wall time: long (8.46M rows; per-row state assignment dominates). Monitor RAM; the 2026-09-12 machine limit is 15.65 GB.

- [ ] **Step 2: OOM contingency (only if the run dies on memory)**

If killed/RAM-exhausted: do NOT just re-run. Process file-by-file — invoke `ingestion.nationwide_backfill.build_nationwide_backfill` with one input dir at a time, or chunk the `assign_states` call by date-month blocks, writing partial daily frames to staging and concatenating before `build_materialized_layers`. If that path is taken, append an AGENT_LOG note describing the chunking (it changes the dedup verification surface, so Task 2's cross-checks matter more, not less).

- [ ] **Step 3: Read the validation report (gate)**

```bash
.venv/Scripts/python.exe -c "
import json; r = json.load(open('data/processed/timeline/staging/validation_report.json'))
print('validated:', r['validated'])
for k, v in r['checks'].items(): print(f'  {k}: {v}')
"
```

Expected: `validated: true`, promoted_to set, all BLOCKING checks pass. **`seasonal_comparability` is BLOCKING** (`pipeline/timeline_validation.py:3-7`, user decision 2026-09-12) — it compares Sep–Dec of the first year vs the latest live Sep–Dec. The archive starts exactly 2019-09-01 so the first-year window is complete and this should pass legitimately; if it fails, do NOT set `TIMELINE_SEASONAL_GATE_OVERRIDE=1` without explicit user sign-off (documented override exists, but the failure must be understood and surfaced first). Other known acceptable RECORDED (non-blocking) findings: partial first period, archive gaps >30d. If `state_counts_land_mask` fails: 0 outside-India detections and ≥10 states are required — fix the data, not the check. The script exits 1 on any blocking failure.

- [ ] **Step 4: Per-year/satellite sanity check (draft-plan Gate for Phase 1)**

```bash
.venv/Scripts/python.exe -c "
import duckdb
df = duckdb.sql(\"select year(acq_date) y, count(*) n from read_parquet('data/processed/timeline/h3_timeline_daily.parquet') group by 1 order by 1\").fetchall()
for y, n in df: print(y, n)
"
```

Expected: monotonically plausible growth with known coverage-maturity artifacts in 2019–2020 (VIIRS archive coverage matures through early years — 2019 holds only 4 months and should be visibly lighter; do not treat that as a pipeline bug). Cross-check `timeline_provenance.json`: NRT overlap drops should equal archive+NRT duplicates for 2026-04-27→2026-06-01 (SV) and 2026-05-31→2026-06-01 (J1V); total harmonized rows should be < 8,461,514 raw (dedup + India mask + validation drops) — record the reconciliation arithmetic.

- [ ] **Step 5: Manifest gate (draft-plan Gate for Phase 2)**

```bash
.venv/Scripts/python.exe -c "
import json; m = json.load(open('data/processed/timeline/materialization_manifest.json'))
print(m['materialized_start_date'], '->', m['materialized_end_date'])
"
```

Expected: `2019-09-01 -> 2026-09-01` (or the NRT max date). Gap rule: any intervening month with zero rows must appear in the layers as an explicitly-marked empty entry (`observation_basis` / provenance), never as an absent month. Spot-verify by listing distinct months and diffing against a generated 2019-09→2026-09 month range.

- [ ] **Step 6: Live-tail preservation merge (MANDATORY — promotion replaced the layers).**

`ingestion/nationwide_backfill.py` builds only from the CSV inputs (ending 2026-09-01) and `timeline_service` reads ONLY the timeline layers (`app/services/timeline_service.py:40`), so promotion silently dropped the 2026-09-02→2026-09-19 live days (currently in `backup_pre_2019_backfill/sih2026_h3_daily_features_firms.parquet`) and would leave `materialization_manifest.json` ending 2026-09-01 while run history says 2026-09-19 — tripping `resolve_materialization` staleness for recent dates. Merge using existing functions:

```bash
.venv/Scripts/python.exe -c "
import pandas as pd, shutil, sys
sys.path.insert(0, '.')
from pipeline.timeline_materializer import build_materialized_layers

promo = pd.read_parquet('data/processed/timeline/h3_timeline_daily.parquet')
tail = pd.read_parquet('data/processed/backup_pre_2019_backfill/sih2026_h3_daily_features_firms.parquet')
tail = tail[tail['acq_date'] > promo['acq_date'].max()]
merged = pd.concat([promo, tail]).drop_duplicates(subset=['h3_08','acq_date'], keep='first')
shutil.copytree('data/processed/timeline', 'data/processed/timeline_pre_merge', dirs_exist_ok=True)
build_materialized_layers(merged, 'data/processed/timeline')
print('merged daily rows:', len(merged), '| tail rows added:', len(tail))
"
```

(If column names differ between the two parquets, reconcile to the timeline layer's schema — `restore_nationwide_serving.py` is prior art for this merge pattern. Schema mismatch on merge is a STOP-and-log condition, not something to coerce silently.)

Then re-verify the manifest shows `2019-09-01 -> 2026-09-19` and re-run the validator's blocking checks against the merged layers if `validate_and_promote` is re-invoked on staging. If the merge produces a manifest/layer inconsistency, restore from `timeline_pre_merge` and stop.

- [ ] **Step 7: Append AGENT_LOG entry** with real numbers: rows/year, dedup counts, NRT drops, gap record, validation checks, wall time, merge tail count. Commit:

```bash
git add AGENT_LOG.md
git commit -m "data: nationwide 2019-2026 archive backfill promoted (validated)"
```

(Note: parquets are gitignored data artifacts — only the log entry is committed.)

---

### Task 2: Serving-path verification (draft-plan Phase 3)

**Files:**
- Modify: nothing (read-only verification). Requires servers running — the opposite of Task 0.

**Interfaces:**
- Consumes: promoted timeline layers (Task 1), running uvicorn on :8000
- Produces: evidence that `resolve_materialization` serves real 2019/2020/2022 data with no 503 staleness fallback

- [ ] **Step 1: Restart backend to seed the new feature store**

```bash
cd "C:/Users/dhruv/PycharmProjects/SIH_2026"
.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000
```

The feature store seeds at boot — it must be started AFTER Task 1's promotion.

- [ ] **Step 2: Pick real cells from the promoted layers per year**

```bash
.venv/Scripts/python.exe -c "
import duckdb
for y in [2020, 2022]:
    print(y, duckdb.sql(f\"select h3_08, count(*) from read_parquet('data/processed/timeline/h3_timeline_daily.parquet') where year(acq_date)={y} group by 1 order by 2 desc limit 3\").fetchall())
"
```

- [ ] **Step 3: Hit the history endpoint for ≥1 confirmed 2020 cell and ≥1 confirmed 2022 cell**

```bash
curl -s "http://127.0.0.1:8000/api/v1/cells/<H3_2020>/history?granularity=month" | head -c 800
curl -s "http://127.0.0.1:8000/api/v1/cells/<H3_2022>/history?granularity=day"  | head -c 800
```

Gate: response must be real non-fallback data (`materialization_status: "materialized"`, rows spanning the requested era, no `historical/no_run_record` and no degraded-fallback banner source). A 503 or empty-history on a cell the layers provably contain is a BLOCKING failure — debug `timeline_service.resolve_materialization` staleness logic, do not widen the staleness tolerance.

- [ ] **Step 4: Full timeline test suite against the new range**

```bash
.venv/Scripts/python.exe -m pytest tests/test_timeline_service.py tests/test_timeline_endpoint.py tests/test_timeline_features.py tests/test_timeline_materializer.py tests/test_transition_detection.py -q -p no:cacheprovider
```

Expected: same-or-better pass count than the Task 0 baseline, now exercising 2019+ data.

- [ ] **Step 5: Stop the server** (DuckDB lock hygiene), append AGENT_LOG entry with the two cell IDs, response snippets, and test count. Commit the log entry.

---

### Task 3: Calibrator provenance decision (draft-plan Phase 4 — blocking gate, do not skip)

**Files:**
- Modify: `docs/CLAIMS_AND_EVIDENCE.md` (Task 4), AGENT_LOG.md
- No code changes.

**Interfaces:**
- Consumes: the open provenance question — isotonic calibrator fit on tuning fold vs blind Test A
- Produces: an explicit decision that governs how historical confidence renders

- [ ] **Step 1: Resolve or explicitly flag — pick ONE:**
  - **Option A (default, no code):** historical confidence ships as-is from the pipeline output, rendered with the existing provisional caveat (`"Calibrated confidence is below the per-class review threshold; treat as provisional."` extended in docs, not in the frozen API). No regeneration of scores.
  - **Option B:** trace calibrator provenance first (training notebook / `TRAINING_SERVING_SKEW_TEST_REPORT.md` / model bundle metadata), and only then decide whether historical scores are trustworthy numbers.
- [ ] **Step 2: Write the decision into AGENT_LOG.md with date and rationale.** The gate: Task 4's correction entry may not claim historical confidence as a verified number unless Option B resolved provenance favorably. This is the user's call if evidence is ambiguous — ask rather than guess.

---

### Task 4: Log the correction (draft-plan Phase 5)

**Files:**
- Modify: `docs/CLAIMS_AND_EVIDENCE.md` (append correction entry), `docs/CURRENT_PROJECT_TRUTH.md:230` (coverage line), AGENT_LOG.md

**Interfaces:**
- Consumes: Task 1/2 real numbers + Task 3 decision
- Produces: project claims consistent with disk

- [ ] **Step 1: Append to `docs/CLAIMS_AND_EVIDENCE.md`** (C-ID registry rules per the evidence audit — dated, reversal-framed, evidence-backed). Draft:

```markdown
## Correction — nationwide coverage claim REVERSED then re-established (2026-09-20)

Supersedes, not extends: the 2026-09-12 AGENT_LOG claim of "nationwide
history 2024-08-01 → 2026-08-01 (1,446,310 rows)" no longer described disk
(backup_nationwide_pre_10state/ was lost; serving parquets held 1,177 rows,
2026-08-01→2026-09-19 as of 2026-09-19 13:20). Coverage for 2019-09-01 →
2026-09-01 was re-established on 2026-09-20 from the verified FIRMS archive
downloads (DL 804030 SNPP / 804031 NOAA-20; row counts matched the 2026-09-12
wc -l measurements digit-for-digit) through ingestion/nationwide_backfill.py
with fail-closed validation. Evidence: <staging validation_report.json path +
validated:true>; per-year counts <paste>; serving verification cells
<paste 2020 + 2022 cell IDs>. Historical confidence scores are <per Task 3
decision — provisional, or provenance-resolved>.
```

- [ ] **Step 2: Update `docs/CURRENT_PROJECT_TRUTH.md` coverage line(s)** (~line 230, C-18) to state the new coverage range and the source (archive-first + NRT tail), removing the stale 2024-08→2026-09-10 claim from the verification record context.
- [ ] **Step 3: Append AGENT_LOG entry + commit** both docs.

---

### Task 5: Scoped re-audit (draft-plan Phase 6)

**Files:**
- Modify: AGENT_LOG.md (audit result entry)

**Interfaces:**
- Consumes: Tasks 1–4 outputs
- Produces: an evidence-backed pass/fail on the new coverage claim, same scrutiny standard as the original audit

- [ ] **Step 1: Re-run the audit checklist scoped to the timeline feature:** manifest range vs layer contents (distinct months == expected range, no silent gaps); endpoint responses for 3 eras (2019-1 9, 2020, 2022) match layer rows; validation report blocking checks all pass with no overrides; CLAIMS/TRUTH/AGENT_LOG agree with each other and with disk; Task 3 decision honored in every confidence-adjacent claim.
- [ ] **Step 2: Run the full backend suite once** (`pytest tests/ -q -p no:cacheprovider`) — the audit's scrutiny standard. Append the final AGENT_LOG entry with the audit verdict and full-suite result. Commit.

---

## Self-review notes

- Spec coverage: draft Phases 0–6 all mapped (0 closed with evidence; 1+2 merged into Task 1 — the script already runs materializer + validation + promotion; 3→Task 2; 4→Task 3; 5→Task 4; 6→Task 5).
- Module corrections from Phase 0 findings are in Global Constraints, not buried in tasks.
- No placeholders: every gate has a concrete command and expected output; the two unknowns (per-task test counts, final cell IDs) are defined as "record the actual measured value", not left vague.
- Type/contract consistency: no new interfaces introduced; frozen timeline schema untouched.
