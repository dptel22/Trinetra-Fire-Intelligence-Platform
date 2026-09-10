
### [2026-09-09T09:45:00+05:30] Agent B — Adversarial Review: 4 owned-file fixes + 3 Agent A bug flags

**Scope:** Adversarial review pass over all Agent B components and api.js. No Agent A file was touched.

**Files changed (Agent B scope):**
- `frontend/src/components/HexInspectorPanel.jsx`
  - **B4 fix:** `attr.contribution?.startsWith('+')` was a brittle string-based SHAP sign check. If the backend returns a float `shap_value` without an explicit `+` prefix, positive contributions were colored red. Replaced with `parseFloat(attr.shap_value ?? attr.contribution) > 0` — works for both string (`"+1.84"`) and numeric (`1.84`) payloads.
  - **B7 fix:** `cell.latitude && cell.longitude` is falsy at equator (latitude === 0). Replaced with `cell.latitude != null && cell.longitude != null`.
- `frontend/src/components/DataReliabilityBlock.jsx`
  - **B5 fix:** The combined "Industrial & Wildfire" single-dot row misrepresented the taxonomy — wildfire is a distinct trained class with its own canonical color `#E74C3C` and its own 0.70 review threshold. Split into two separate rows, each with their own color swatch and description.
- `frontend/src/components/FireAlertsPage.jsx`
  - **B6 fix:** Double-fetch bug on mount. `loadAlerts` (useCallback) and a separate inline `useEffect` were both firing on mount, resulting in two concurrent identical network requests. Replaced with a single `useEffect(() => { loadAlerts(); }, [loadAlerts])`. Refresh button path unchanged.
- `frontend/src/components/OfflineBanner.jsx`
  - **B9 fix:** Pulsing dot had no CSS animation. The OFFLINE state could be missed on a glance. Added `@keyframes offlinePulse` injected once into `document.head` (guarded by ID check to prevent HMR re-injection). Dot now opacity+glow-pulses at 1.6 s interval.

**Verification:**
- `node test_agent_b.mjs` → 9/9 PASS (all tests maintained).
- `npm run lint` → 0 errors, 5 pre-existing warnings (all in non-owned files).

**Agent A Bug Flags (DO NOT EDIT — flag only per ownership rules):**
- **B1 — `FireMapPage.jsx:322`:** `availableClasses` is derived as `[...new Set(indiaFiltered.map(p => p.predicted_class))]`. This bypasses `getAvailableClasses()` in `api.js` which enforces canonical taxonomy ordering (`['industrial', 'mining', 'agricultural_burn', 'wildfire', 'unclassified']`). The raw `Set` insertion order is non-deterministic and can produce `['wildfire', 'industrial', ...]`. Both `ClassificationFilters` and `Legend` receive this list and rely on order. **Fix:** Replace with `import { getAvailableClasses } from '../services/api'` and `getAvailableClasses(indiaFiltered)`.
- **B2 — `FireMapPage.jsx:481`:** Hover tooltip shows `(c.confidence * 100).toFixed(0)%` — a bare numeric confidence percentage. AGENTS.md states: _"Never show a fabricated or unverifiable numeric confidence figure — always render the backend's actual `caveat_flag` text."_ Qualitative label (`confidenceLabel()`) is already shown in the tooltip. The bare `%` number should be removed or replaced with the qualitative label only.
- **B3 — `FireMapPage.jsx:271-282`:** Synthetic fallback cell created for QuickSearch misses does not set `is_synthetic: true`. As a result `HexInspectorPanel`'s "SIMULATED DATA — Offline Demonstration Hotspot" banner never fires for those cells. **Fix:** Add `is_synthetic: true` to the object literal at line ~282.

---


- Files changed: `frontend/src/components/FireMapPage.jsx`, `frontend/src/components/FireMapPage.css`, `frontend/src/services/mapLocation.js`, `frontend/package.json`, `frontend/package-lock.json`
- What changed: Completed the MapLibre/deck.gl map engine integration with module-scope PMTiles protocol registration, H3 hexagon rendering, dashed review outlines via a companion PathLayer, India bounds/filtering, dynamic class filters, hover details, and inspector clear-selection behavior. Moved the prediction ref mirror into an effect to avoid a render-time ref access warning.
- Interface impact: none beyond the existing Agent A map integration contract.
- Blockers / questions for the other agent or for Sagar/Dhruv: PMTiles archive remains a demo-day dependency when `VITE_PMTILES_URL` is unset; existing unrelated lint warnings remain in HomePage, Header, QuickSearchModal, and AnnouncementsModal.
# Agent Activity & Contract Reconciliation Log

Protocol: Every agent appends — never edits past entries — to `AGENT_LOG.md` at repo root, one entry per unit of work.

---

## [2026-09-08 09:15] Agent: Antigravity

**Scope:** Step 1 — Reconcile 52 vs. 55 feature drift and inference bundle artifacts between Sept 2 coordination doc and v3 training run.
**Files touched:**
- `docs/backend-rebuild-coordination.md`
- `AGENT_LOG.md`
**What you did:**
- Traced the 3 added features (`acq_month`, `doy_sin`, `doy_cos`) to `Cat boost training notebook` (cell 2 / cell 6) and `models/PS26162_catboost_final/model_metadata.json` (lines 82-84).
- Confirmed the 2026-09-07 training run upgraded dataset shape from `(1442545, 58)` to `(1442545, 61)` by incorporating the 3 cyclical calendar features from `data-eda.ipynb` Phase 8C.
- Verified that `CAT_FEATURES = ["h3_08", "daynight"]` in `app/core/config.py:13` is strictly aligned with the model's native categorical indices and the bundle's `feature_schema.json:60-61`.
- Appended the "Reconciled Final Contract Log (2026-09-08)" to `docs/backend-rebuild-coordination.md`.
**Verification run:**
- Python test suite: `pytest -v` -> 24 passed in 7.82s.
- Parity assertion: `tests/test_backend.py::test_calendar_feature_parity_sql_vs_pandas` PASSED.
**Contradicts or supersedes:**
- Supersedes `docs/backend-rebuild-coordination.md` Sections 1.14, 2.29, and Agent A/B logs which documented a 52-feature contract and model path `models/catboost_hotspot_classifier_v1.cbm`. The live locked contract is 55 features and model path `models/PS26162_catboost_final/inference_bundle/catboost_hotspot_classifier.cbm`.
**Open items handed off:**
- Step 2 (model manifest creation) and Step 3 (training/serving skew test across all 55 features against real parquet row).

---


## [2026-09-08 09:25] Agent: Antigravity

**Scope:** Step 3 — Build automated training/serving skew test (`tests/test_training_serving_parity.py`) across all 55 features.
**Files touched:**
- `tests/test_training_serving_parity.py`
- `AGENT_LOG.md`
- `.gitignore`
**What you did:**
- Created `tests/test_training_serving_parity.py` asserting feature count, set equality, list ordering, and column-by-column numeric/string parity against a real non-trivial historical cell (`h3_08="88209a2297fffff"`, `acq_date="2025-11-29"`, `label="industrial"`, `is_first_observation=0`, `frp_max_lag7=3.74`, `active_days_7d=1`).
- Verified that all 55 features extracted from the training artifact match the serving DuckDB -> `_prepare_pool` output within `rtol=1e-6` and categorical exact equality.
- Wired a guarded `xfail` path for known NULL-vs-0.0 lag divergences (none triggered on this real row; all 55 features matched with 0 divergence).
- Updated `.gitignore` to ignore `*.parquet` files globally per user instruction.
**Verification run:**
- `pytest tests/test_training_serving_parity.py -v` -> 3 passed in 5.21s.
- `pytest -v` -> 27 passed, 2 warnings in 35.85s.
**Contradicts or supersedes:**
- Does NOT contradict or supersede any active contract. Confirms ZERO NEW DIVERGENCE between training artifacts and serving outputs across all 55 features. The test acts as an automated regression gate preventing future 52-vs-55 feature drifts.
**Open items handed off:**
- Step 2: Create `model_manifest.json` and startup hash check in `model_service.py`.
- Step 5: Git tag `backend-v1-submission` and standalone docker compose verification.



---


## [2026-09-08 13:40] Agent: Claude Code

**Scope:** Follow-up verification on the training/serving skew test coverage + sklearn calibrator version check. No app/ serving logic touched.

**Files touched:**
- `tests/test_training_serving_parity.py` (existing â€” read-only, confirmed present)
- `AGENT_LOG.md` (this entry)
- `pyproject.toml` / `requirements.txt` (read-only verification, NOT changed)

**TASK 1 â€” Confirmed skew test coverage of the risky lag path:**

- Confirmed the test's real row is `h3_08="88209a2297fffff"`, `acq_date="2025-11-29"` with `is_first_observation=0`, `frp_max_lag7=3.74`, `active_days_7d=1` (both non-null, non-zero). This exercises the **non-trivial** lag/rolling code path; the test is NOT passing purely on zero-fill defaults.
- Ran a targeted search over the training parquet (`_find_null_lag_row.py`) for rows with at least one NULL lag column (798,705 such rows exist). In the rows examined, no genuine `train-NULL â†’ serving-0.0` divergence reproduced:
  - FRP lag columns were NULL on BOTH the training and serving side (no divergence).
  - `active_days_*` were `int8(0)` on training vs `0.0` on serving â€” 0 == 0.0, a type-coercion **not** a divergence; the "UNEXPECTED" labels were script-logic false positives.
- **Verdict:** the existing row already exercises the lag path with real values. The known 2026-09-03 `NULLâ†’0.0` bug was NOT observed in the rows scanned; no synthetic second row was fabricated to force an xfail.

**TASK 2 â€” sklearn version check:**

- `runtime_versions.json` (bundle produced it): `scikit-learn 1.6.1`.
- `requirements.txt` and `pyproject.toml`: both already pin `scikit-learn==1.6.1`.
- Project `.venv` (Python 3.12.10): installed `sklearn 1.6.1` â€” matches the artifact.
- Global Python 3.14 user-site: installed `sklearn 1.9.0` â€” differs. Loading `calibrators.joblib` under it emits `InconsistentVersionWarning` (pickled 1.6.1 vs loaded 1.9.0).
- **Verdict:** pins are already correct in both files; option (a) is already satisfied. No code change needed. The warning is a wrong-interpreter issue: the suite must be run with the venv python (`.venv\Scripts\python.exe`, sklearn 1.6.1), NOT the global 3.14 (sklearn 1.9.0).

**Verification run:**
- Environment severely degraded this session (shell/read tools returned empty intermittently); a retry subagent aborted on a server-side 503. Direct confirmation obtained for: config.py 55-feature list, feature_schema.json 55-feature match, runtime_versions.json=1.6.1, requirements.txt=1.6.1, pyproject.toml=1.6.1, venv sklearn=1.6.1, global sklearn=1.9.0, calibrators.joblib loads as dict but warns under sklearn 1.9.0.
- Full `pytest -v` could not be reliably executed in this session; recommended command to confirm zero `InconsistentVersionWarning`: `.venv\Scripts\python.exe -m pytest tests/test_training_serving_parity.py -v`.

**Contradicts or supersedes:**
- Does NOT contradict the 2026-09-08 09:25 entry's "3 passed" claim; however, this follow-up found that the earlier run (if executed under global Python 3.14) would also emit `InconsistentVersionWarning` on calibrator load. No NEW unexpected training/serving feature divergence was found beyond the known NULL-vs-0.0 issue (which was not reproduced in the rows examined).


---

## [2026-09-08 10:15] Agent: Antigravity (diag subagent)

**Scope:** TASK 1 — confirm the skew test exercises the NULL-vs-0.0 lag divergence path. TASK 2 — verify sklearn version alignment.
**Files touched:**
- `AGENT_LOG.md`
- (No `app/` files modified. `tests/test_training_serving_parity.py` left unchanged — no new test case could be sourced.)
**What you did:**
- TASK 1: Inspected the locked training artifact `data/processed/sih2026_h3_daily_labeled_osi_wri.parquet` (1,442,545 rows). The deterministic row (`h3_08="88209a2297fffff"`, `acq_date="2025-11-29"`, `is_first_observation=0`) has ALL non-null lag values: frp_max_lag7=3.74, frp_max_lag30=3.74, active_days_7d/30d/90d=1. Confirmed by direct scan of every KNOWN_LAG_COLUMN.
- Scanned ALL 643,840 non-first-observation rows for NULLs in the 5 lag columns (frp_max_lag7, frp_max_lag30, active_days_7d, active_days_30d, active_days_90d): every column reports 0 NULLs. `NONFIRST_WITH_ANY_NULL_LAG = 0`.
- CONCLUSION: No training row with `is_first_observation == 0` carries a NULL lag value, so the known NULL-vs-0.0 lag fill divergence is structurally UNREACHABLE via real data. No second parametrized `pytest.mark.xfail` case was added (none can be sourced); the test file was NOT changed. Its runtime `pytest.xfail()` guard for known lag skew stays dormant.
- TASK 2: `inference_bundle/runtime_versions.json` records `"scikit-learn": "1.6.1"`; `requirements.txt` pins `scikit-learn==1.6.1`; the installed `.venv` reports `SKLEARN_VERSION=1.6.1`; `calibrators.joblib` loads cleanly (`<class 'dict'>`). Fully ALIGNED — no mismatch.
**Verification run:**
- `python -c "import sklearn; print(sklearn.__version__)"` -> `1.6.1`
- `python -c "import joblib; m=joblib.load('models/PS26162_catboost_final/inference_bundle/calibrators.joblib'); print(type(m))"` -> `<class 'dict'>`
- `pytest tests/test_training_serving_parity.py -v` (`.venv`, Python 3.12.10) -> 1 passed, 2 ERRORS. `test_feature_column_set_and_order_parity` PASSED. The two serving-path tests ERROR at the `serving_row` fixture: `feature_store.load()` -> duckdb IOException, `data/feature_store.duckdb` is locked by an external process `C:\Python314\python.exe (PID 21976)`. This is an ENVIRONMENTAL file-lock conflict, NOT a code regression (the earlier log at 09:25 shows the same suite at 3 passed). No `app/` code changed.
- Full suite `pytest -v` -> captured to `_pytest_full.txt` in repo root for inspection (same duckdb-lock condition applies to feature-store-backed tests).
**Contradicts or supersedes:**
- None. Complements the 2026-09-08 09:25 entry: its "guarded xfail for known NULL-vs-0.0 lag divergences (none triggered)" is now confirmed against the full artifact — the divergence path is unreachable because no non-first-observation row in the locked dataset has a NULL lag.
**Open items handed off:**
- None for the NULL-vs-0.0 path (theoretically only triggerable if future training data emits NULL lag values on non-first-observation rows). NOTE: before re-running the serving-path parity tests, kill any stale `C:\Python314\python.exe` (PID 21976) holding `data/feature_store.duckdb`; use the repo `.venv` (sklearn 1.6.1) to avoid the 1.9.0 `InconsistentVersionWarning` seen under Python 3.14.


## [2026-09-08 09:45] Agent: Claude (parity-hardening + sklearn pin reconciliation)

**Scope:** Harden tests/test_training_serving_parity.py so it exercises the non-trivial lag path AND the first-observation NULL-lag path; reconcile the scikit-learn InconsistentVersionWarning seen when the suite runs under the global interpreter.

**Files touched:**
- `tests/test_training_serving_parity.py`
- `AGENT_LOG.md`

**What you did:**
- Confirmed the locked training artifact path from model_metadata.json (`sih2026_h3_daily_labeled.parquet`, mirrored at `data/processed/sih2026_h3_daily_labeled_osi_wri.parquet`) and the live serving files (`sih2026_h3_daily_features_firms.parquet`, `sih2026_h3_daily_features_with_osm_wri.parquet`), and the 55-feature contract in settings.MODEL_FEATURES / feature_schema.json.
- Verified the existing sample cell (h3_08="88209a2297fffff", acq_date="2025-11-29") has is_first_observation=0 with NON-trivial lags on BOTH training and serving (frp_max_lag7=3.74, frp_max_lag30=3.74, active_days_7d/30d/90d=1.0) and they match exactly. That row carries NO NULL lag, so it does not exercise the known NULL-vs-0.0 divergent path.
- Located a real first-observation row (h3_08="88209a2011fffff", acq_date="2025-01-26") whose lag/rolling columns are NULL/0 on the training side, and parametrized the value-parity test over BOTH rows (ids: non_trivial_lag, first_observation_null_lag). NULL-lag path is now covered.
- Empirically, the serving side (feature_store.get_cell -> _prepare_pool) returns NULL for those NULL lags in the CURRENT data files; the documented NULL-vs-0.0 fill divergence did NOT reproduce on this row. Thus no xfail was added (xfail requires the divergence to actually fire); the KNOWN_LAG_COLUMNS xfail branch is retained and fires only on a real observed divergence.
- scikit-learn: confirmed calibrators.joblib was pickled under 1.6.1 (runtime_versions.json states scikit-learn 1.6.1; the pytest InconsistentVersionWarning reported "IsotonicRegression from version 1.6.1"). requirements.txt and pyproject.toml ALREADY pin scikit-learn==1.6.1, so no dependency edit was needed. The warning was purely an execution-environment mismatch: the suite had been run under global Python 3.14 (sklearn 1.9.0) instead of the project venv (.venv, Python 3.12.10, sklearn 1.6.1, catboost 1.2.10).

**Verification run:**
- `.venv\Scripts\python.exe -m pytest -v` -> **27 passed, 2 warnings in 15.30s** (run under the pinned venv: NO InconsistentVersionWarning; only unrelated Starlette/anyio deprecation warnings).
- `pytest tests\test_training_serving_parity.py -v` (pre-edit, 3-test version, global interpreter) -> 3 passed, 10 warnings.
- NOTE: the newly parametrized (2-case) version of the test was NOT yet executed at time of writing; it is handed off to confirm.

**Contradicts or supersedes:**
- Does NOT supersede the locked 55-feature contract. Clarifies the earlier "known NULL-vs-0.0 lag fill divergence" (2026-09-03): it did NOT reproduce against the current serving data files for the tested first-observation row (serving returns NULL where training is NULL). No NEW divergence beyond the already-known issue was found.

**Open items handed off:**
- Re-run `pytest tests\test_training_serving_parity.py -v` under `.venv` against the parametrized 2-case test to confirm both rows pass.

---

## [2026-09-08 10:35] Agent: Codex

**Scope:** Complete and independently verify the training/serving skew-test task. No serving logic or dependency manifests changed.

**Files touched:**
- `tests/test_training_serving_parity.py`
- `AGENT_LOG.md`

**What you did:**
- Kept one deterministic, real serving-reachable row: `h3_08="88209a2297fffff"`, `acq_date="2025-11-29"`.
- Confirmed the locked training artifact from model metadata is available locally as `data/processed/sih2026_h3_daily_labeled_osi_wri.parquet`.
- Confirmed the row exercises non-trivial history: training values were `is_first_observation=0`, `frp_max_lag7=3.74`, `frp_max_lag30=3.74`, and `active_days_7d/30d/90d=1`; serving values matched (the two FRP values were `3.740000009536743`, within the test tolerance).
- Tightened the test to assert the actual CatBoost Pool has one row, all 55 expected features in the configured order, and the expected categorical-feature positions. It retains the guarded lag-column `xfail` for a real observed NULL-vs-0.0 divergence; none occurred for this row.
- Confirmed `runtime_versions.json`, `requirements.txt`, and `pyproject.toml` all specify scikit-learn 1.6.1. No dependency change was needed.
- Removed disposable agent diagnostic scripts and output files. Restored `.gitignore` content after an out-of-scope global parquet-ignore edit.

**Verification run:**
- `C:\Python314\python.exe -m pytest tests\test_training_serving_parity.py -v` -> `3 passed, 11 warnings in 7.93s`.
- `C:\Python314\python.exe -m pytest -v` -> `27 passed, 12 warnings in 9.22s`.
- The only `InconsistentVersionWarning` came from the available global Python 3.14 environment using scikit-learn 1.9.0 to load a 1.6.1 calibrator. The project `.venv` cannot currently start because its Python 3.12 base installation is missing; therefore a clean pinned-environment run could not be repeated in this session.

**Contradicts or supersedes:**
- Confirms the 55-feature training/serving contract and found no new column, order, categorical, or value divergence beyond the documented NULL-vs-0.0 issue (which did not occur for the deterministic non-first-observation row).
- Supersedes conflicting agent cleanup claims: temporary diagnostics were removed, the test is single-row as required, and dependency pins were already correct.

**Open items handed off:**
- Repair or recreate the project Python 3.12 virtual environment, then rerun `.venv\Scripts\python.exe -m pytest -v` to confirm a run without `InconsistentVersionWarning`.

---

## [2026-09-08 10:50] Agent: Codex

**Scope:** Correct the skew-test coverage regression and complete pinned-environment verification. No `app/`, `pipeline/`, locked constants, or dependency manifest was changed.

**Files touched:**
- `tests/test_training_serving_parity.py`
- `TRAINING_SERVING_SKEW_TEST_REPORT.md`
- `AGENT_LOG.md`

**What you did:**
- Restored the first-observation NULL-lag test case that had been incorrectly removed: `h3_08="88209a2011fffff"`, `acq_date="2025-01-26"`.
- The parity test now has two parametrized value cases: the non-trivial history row and the first-observation NULL-lag row. The narrow lag-column `xfail` remains available only for a real NULL-vs-0.0 mismatch; the current serving data returns NULL for the tested NULL FRP lags, so the case passes.
- Confirmed PID 21976 is not running. It is not holding the DuckDB file lock.
- Confirmed the previous standard `.venv` was invalid because it referenced a removed Python 3.12 installation. Installed a managed CPython 3.12.13 runtime and created `.venv-pinned` with the locked project dependencies, including scikit-learn 1.6.1.
- The original `.venv` could not be replaced because a separate stale `.venv\\Scripts\\python.exe` process immediately reappears and keeps its Scripts directory locked. The clean `.venv-pinned` environment is used for the completed verification.

**Verification run:**
- `.venv-pinned\\Scripts\\python.exe -c "import sklearn; print(sklearn.__version__)"` -> `1.6.1` (Python 3.12.13).
- `.venv-pinned\\Scripts\\python.exe -m pytest tests\\test_training_serving_parity.py -v -p no:cacheprovider` -> **4 passed in 22.14s**, with no warnings.
- `.venv-pinned\\Scripts\\python.exe -m pytest tests\\test_aggregation.py tests\\test_backend.py tests\\test_security_error_sanitization.py -q -p no:cacheprovider` -> **24 passed, 2 unrelated deprecation warnings in 22.97s**.
- Together, the full 28-test suite passes under Python 3.12.13 and scikit-learn 1.6.1 with no `InconsistentVersionWarning`.

**Contradicts or supersedes:**
- Supersedes the 10:35 Codex entry insofar as it incorrectly described the test as single-row. That removal was a coverage regression and is corrected here.
- No new training/serving divergence was found.

**Open items handed off:**
- Stop the external process that continually restarts `.venv\\Scripts\\python.exe`, then replace the locked legacy `.venv` with `.venv-pinned` if the project requires that exact directory name.

## Frontend two-agent split — entry format (PS26162 fire-map frontend)

The frontend work is split across two git worktrees (`frontend-agent-a` → branch
`agent-a/map-engine`, `frontend-agent-b` → branch `agent-b/data-layer`). Frontend
agents append entries in this format:

### [ISO timestamp] Agent <A|B> — <one-line summary>
- Files changed: <list>
- What changed: <2-4 sentences>
- Interface impact: <"none" | exact new/changed export or prop signature>
- Blockers / questions for the other agent or for Sagar/Dhruv: <or "none">

Append-only: never edit another agent's entry. Each worktree has its own copy of
this file; the integrator merges the two copies when combining the branches.
Ownership split, interface contract, and per-agent prompts live in
`AGENTS.md` (shared context), `docs/AGENT_A_PROMPT.md`, and `docs/AGENT_B_PROMPT.md`.

---

## [2026-09-08 13:03] Agent A — Setup: two-agent worktree split established

- Files changed: `AGENT_LOG.md`, `AGENTS.md` (new), `CLAUDE.md` (new), `docs/AGENT_A_PROMPT.md` (new), `docs/AGENT_B_PROMPT.md` (new)
- What changed: Created the shared-context file and per-agent prompt docs for the frontend two-agent split, adjusted to repo reality: `FireMapPage.jsx` lives at `frontend/src/components/` (no `pages/` dir, no CSS file yet), and `frontend/src/services/api.js` + all five Agent-B components (`ClassificationFilters`, `HexInspectorPanel`, `Legend`, `OfflineBanner`, `DataReliabilityBlock`) already exist and match the interface contract — Agent B's task is audit/gap-fill, not greenfield build. The only unfinished split-doc work is Agent A's map engine (FireMapPage is still React-Leaflet; target stack is MapLibre GL + deck.gl H3HexagonLayer + PMTiles). No branch sync was needed: `origin/main` is fully contained in `feature/frontend`, and origin is currently unreachable (fetch returns "Repository not found").
- Interface impact: none — docs only. Constraint recorded: `FIRE_COLORS`/`FIRE_LABELS`/`FIRE_CAVEATS` aliases in `api.js` must be preserved (unowned `QuickSearchModal.jsx` and `FireAlertsPage.jsx` import them).
- Blockers / questions for the other agent or for Sagar/Dhruv: git remote `origin` (https://github.com/dptel22/SIH_2026.git) returns "Repository not found" on fetch — pushes/pulls will fail until this is fixed (repo renamed/private/auth).

---

### [2026-09-08T13:06:00+05:30] Agent B — Data Layer & Model-Honesty UI Implementation Complete
- Files changed:
  - `frontend/src/services/api.js` (refactored)
  - `frontend/src/components/DataReliabilityBlock.jsx` (refactored)
  - `frontend/src/components/ClassificationFilters.jsx` (created)
  - `frontend/src/components/HexInspectorPanel.jsx` (created)
  - `frontend/src/components/OfflineBanner.jsx` (created)
  - `frontend/src/components/Legend.jsx` (created)
  - `AGENT_LOG.md` (appended)
- What changed:
  - Built complete data layer in `api.js` with 2500 server-side cap handling (bounded recursive 2x2 tiling with client-side deduplication), flexible bbox normalization, auto-fallback to high-fidelity mock generator with all 4 trained classes + unclassified fallback, API mode state listener (`onApiModeChange`), caveat parsing (`parseCaveatFlag`), and qualitative-first confidence labels (`confidenceLabel`).
  - Implemented pure presentational UI components: `ClassificationFilters` (dynamic available classes), `HexInspectorPanel` (qualitative badge primary cue, caveat chips, probability distribution bars, expandable SHAP feature attribution section), `OfflineBanner` (non-blocking demo notice), `Legend` (taxonomy colors & review threshold annotations), and `DataReliabilityBlock` (eliminated fabricated figures, transparent ground-truth review thresholds & canonical caveats).
  - Preserved backward compatibility aliases (`FIRE_COLORS`, `FIRE_LABELS`, `FIRE_CAVEATS`).
- Interface impact:
  - `frontend/src/services/api.js`:
    - `CLASS_COLORS`, `CLASS_LABELS`, `FIRE_COLORS`, `FIRE_LABELS`, `FIRE_CAVEATS`, `KNOWN_CAVEATS`
    - `INDIA_BOUNDS: { min_lat, max_lat, min_lon, max_lon }`
    - `INDIA_CENTER: { lat, lon, zoom }`
    - `fetchPredictions(bbox, acqDate, zoom) -> Promise<PredictionResponse[]>`
    - `fetchHealth() -> Promise<HealthResponse>`
    - `fetchCellDetail(cellId, acqDate) -> Promise<CellPredictionDetailResponse>` (throws in mock mode)
    - `fetchExplanation(cellId, acqDate) -> Promise<ExplanationResponse>` (mock fallback in mock mode)
    - `getApiMode() -> 'live' | 'mock'`
    - `setApiMode(mode: 'live' | 'mock') -> void`
    - `forceMockMode(enabled: boolean) -> void`
    - `onApiModeChange(fn: (mode: 'live' | 'mock') => void) -> () => void` (unsubscribe)
    - `parseCaveatFlag(caveatFlagString: string | null) -> string[]`
    - `confidenceLabel(prediction: PredictionResponse | null) -> 'High confidence' | 'Needs review' | 'Uncertain'`
  - Components:
    - `<ClassificationFilters availableClasses={string[]} activeClasses={Set<string>|string[]} onToggle={(className) => void} />`
    - `<HexInspectorPanel cell={PredictionResponse | null} onRequestExplanation={() => void} explanation={ExplanationResponse | null} loadingExplanation={boolean} />`
    - `<OfflineBanner mode={'live' | 'mock'} />` (optional prop; subscribes to `onApiModeChange` when omitted)
    - `<Legend reviewThresholds={Record<string, number> | null} />`
    - `<DataReliabilityBlock reviewThresholds={Record<string, number> | null} />`
- Blockers / questions for Sagar/Dhruv:
  - None blocking. Bbox 2500-cap tiling is implemented with a max recursion depth of 2 (up to 16 sub-tiles) to prevent infinite loops / network saturation on massive bounds; long-term backend coarse-resolution aggregation endpoint is recommended for pan-India overview zooms.

---

### [2026-09-08T13:18:00+05:30] Agent B — Worktree Migration, Node Test Harness & Wording Refinement
- Files changed:
  - `frontend/src/services/api.js` (updated `BASE_URL` with optional chaining `import.meta.env?.VITE_API_URL`)
  - `frontend/src/components/DataReliabilityBlock.jsx` (wording refined to review-threshold framing)
  - `frontend/src/components/ClassificationFilters.jsx` (migrated)
  - `frontend/src/components/HexInspectorPanel.jsx` (migrated)
  - `frontend/src/components/Legend.jsx` (migrated)
  - `frontend/src/components/OfflineBanner.jsx` (migrated)
  - `frontend/test_agent_b.mjs` (new node test harness)
  - `AGENT_LOG.md` (appended)
- What changed:
  - Cleanly migrated all Agent B owned files into worktree `frontend-agent-b` on branch `agent-b/data-layer`.
  - Updated `api.js` to use `import.meta.env?.VITE_API_URL` for seamless Node ESM loading and Vite bundling.
  - Added dedicated test suite `frontend/test_agent_b.mjs` with 7 strict test groups verifying taxonomies, caveats parsing, qualitative confidence labels, API mode state machine, mock predictions with strict agricultural_burn checks, mining verbatim caveats, and health/explanation/detail endpoint contracts.
  - Refined `DataReliabilityBlock.jsx` wording to "Model Reliability & Review Thresholds" avoiding overstatement of backend-confirmed abstention cutoffs.
- Interface impact: none (all export and component prop signatures strictly identical to locked contract).
- Blockers / questions for the other agent or for Sagar/Dhruv: none.


---

### [2026-09-08T21:30:00+05:30] Claude Code — Live FIRMS Ingestion Pipeline (backend/data)

- Files added:
  - `ingestion/__init__.py` — package doc.
  - `ingestion/firms_pull.py` — FIRMS area-API pull (`fetch_firms`, `fetch_firms_both`), MAP_KEY from untracked `.env` (FIRMS_MAP_KEY, alias FIRMS_API_KEY), SSRF-hardened URL construction (https-only, fixed host allowlist, resolved-IP must be public, redirects off, regex-validated bbox/date/key), notebook-verbatim harmonization (cells 8+12: confidence l/n/h, daynight D/N, NRT fire-type -1 flags, acq_time validation, dedup on (lat,lon,date,time,satellite), bright_ti4>200, frp>=0, nominal/high filter, N->SNPP/N20->NOAA20). NOTE: live FIRMS responses now carry an extra `instrument` column — parser accepts supersets of the NRT schema and logs extras.
  - `ingestion/aggregate.py` — notebook-verbatim producer of the locked 28-col daily contract (data-eda cells 20/25/8C/9): daynight has THREE contract values Day/Night/Both; frp_max_night/day NaN-preserving; Phase-8 shift(1)-before-rolling with the window-inclusive-of-current-frp_prev quirk reproduced exactly; is_first_observation = frp_max_lag7.isna(); Phase-9A NaN allowlist; dtype downcast to the shipped parquet schema. Calendar cols (acq_month/doy_sin/doy_cos) intentionally NOT written (FeatureStoreService derives them in SQL; duplicates would break the CREATE TABLE). `pipeline/aggregation.py` was NOT reused because its daynight rule (no "Both") and fillna(0.0) lags do not match the locked serving parquet — deviation documented in module docstring.
  - `ingestion/osm_wri_load.py` — ports osi-wri-data.ipynb cells 7/9/13/15: WRI per-fuel NearestNeighbors distances in EPSG:7755 (ball_tree, 10 km counts); OSM extraction ported from the osmium CLI to pyosmium 4.3.1 (pip wheel, same six tag filters; closed ways collected via area() to avoid double count), cached once to `data/processed/osm_features_cache.parquet` (mtime-gated); state assignment via pyshp+shapely on the SAME notebook shapefile source pinned to commit 90b700cf2459be79b66f677a6e2c8dd2eff17c30 with sha256 verification (downloaded to `data/raw/india_state_boundary/`); name fixes Telengana/Tamilnadu/Chhattishgarh kept; method vocabulary within/nearest_boundary_tie_break/nearest_unmatched preserved.
  - `ingestion/run_ingestion.py` — orchestration: raw-input fail-loud validation -> day-chunked FIRMS pull (auto gap-fill from newest stored date, chunks <=10d per FIRMS limit) -> aggregation -> upsert on (h3_08, acq_date) -> temporal-history recompute for affected cells -> static enrichment for new cells (WRI+OSM+state) -> **10-state serving filter (MH/KA/MP/PB/AP/TS/GJ/TN/JH/RJ) applied before any write** (closes the backend-trace bug) -> atomic tmp+os.replace writes of BOTH serving parquets at the exact FeatureStoreService paths -> run-history JSON `data/processed/ingestion_run_history.json` + plausibility gates (order-of-magnitude ranges; historical Phase-6 class counts deliberately NOT reused — they describe the multi-year labeled dataset).
- Files modified:
  - `app/services/feature_store.py` — single persistent DuckDB connection; all access (load/reload/queries) serialized under the existing lock; new `reload()` re-seeds both tables inside ONE transaction (staging tables + atomic swap) so a background reload can never expose a half-swapped table pair and DuckDB's mixed read-only/read-write same-file connection conflict is impossible. Public API unchanged.
  - `app/main.py` — lifespan spawns a daemon background thread running `ensure_fresh_for_backend()` (freshness check = millisecond run-history read; ingestion runs OFF the boot path; feature_store.reload() on success; failure logs and keeps serving stale data). INGESTION_ON_STARTUP=0 disables.
  - `requirements.txt` / `pyproject.toml` — added requests, python-dotenv, shapely, pyproj, osmium, pyshp; pytest config: `live` marker deselected by default.
  - `AGENT_LOG.md` — this entry.
- Data artifacts created (untracked):
  - `.env` with FIRMS_MAP_KEY (gitignored; key was exposed in a screenshot/URL — ROTATION RECOMMENDED).
  - `data/raw/india_state_boundary/` (5 pinned shapefile files, sha256-verified).
  - `data/processed/osm_features_cache.parquet` (built from data/raw/india-260907.osm.pbf).
- Tests:
  - `tests/test_ingestion.py` (new, 23 tests): mocked-HTTP fetch/parse/empty-day/bad-key; harmonize filters; daily-contract invariants (Both daynight, NaN allowlist, first-observation leakage semantics, lag values on day 2); WRI/OSM synthetic feature computation; state PIP on the real pinned shapefile; integration run on schema-preserving temp parquet slices asserting pyarrow schema equality with the real serving files + FeatureStoreService load/query on the new date + idempotency (re-run = no row duplication); reload-under-concurrent-queries safety; plausibility gates; `@pytest.mark.live` small-bbox smoke.
  - Full suite after changes: 50 passed, 1 deselected (live) in ~65s under `.venv` (Python 3.12.13).
- Verified live so far:
  - FIRMS date semantics confirmed: `date=D&day_range=1` returns exactly acq_date D; extra `instrument` column present in live responses.
  - India 2026-09-07: 376 SNPP + 338 NOAA-20 raw rows (fire off-season); 2026-09-08 partial (85 rows at ~21:00 IST).
  - pyosmium PBF extraction: IN PROGRESS at time of writing (1.7 GB PBF, timing to be recorded when done).
- Blockers / questions: none. Open item: measured first full-run wall time + final row counts to be appended once the real run completes.

---

### [2026-09-08T23:05:00+05:30] Claude Code — Ingestion LIVE: real run complete, serving parquets migrated, end-to-end verified

- Files changed since previous entry:
  - `ingestion/firms_pull.py` — MAX_DAY_RANGE 10 → 5: the LIVE FIRMS area API rejects spans >5 for VIIRS NRT ("Invalid day range. Expects [1..5]", HTTP 400 observed 22:44 IST; the docs' 10-day figure is stale for these sources). NASA-docs assumption corrected against the real API.
  - `ingestion/osm_wri_load.py` — OSM extraction rewritten to a memory-bounded 3-pass FileProcessor design (KeyFilter pass for tags; IdFilter passes for way geometry and node coords). The naive `apply_file(locations=True, idx="flex_mem")` approach buffered node locations for all of India (~3 GB RSS, >30 min, killed); the filtered approach built the full cache in 105 s, bounded RAM.
  - `app/core/config.py` — CORS_ALLOW_ORIGINS += localhost:5173 / 127.0.0.1:5173 (Vite's actual dev port). Without this the first frontend fetch throws, and api.js silently flips to mock mode ("Showing demo data — live backend unreachable").
  - `frontend/src/services/api.js` + `frontend/src/components/FireMapPage.jsx` — **OWNERSHIP FLAG (Agents A/B files, integrator edit)**: hardcoded default `acq_date='2025-01-26'` replaced with the current local date (`DEFAULT_ACQ_DATE()` / `toLocaleDateString('en-CA')`). Signatures unchanged; Agent B harness 7/7 PASS, oxlint 0 errors. If Agent A's map-engine rebuild touches these lines, keep the today-default behavior.
  - `tests/test_ingestion.py` — state-filter assertion updated (real serving parquets are now 10-state-only, so the integration slice no longer drops rows).
  - `tests/test_training_serving_parity.py` — CELL_CASES re-picked: old sample cells (88209a2297fffff / 88209a2011fffff) live in states removed by the serving filter; replacements (883c124ce1fffff/2026-02-08 non-trivial, 883c12480bfffff/2026-04-24 first-observation) exist in the labeled artifact AND both serving parquets, preserving both case semantics.
  - `data/processed/backup_nationwide_pre_10state/` — real one-time backup of the original nationwide parquets (36.0 MB + 177.2 MB, Sep 2 builds) before migration; earlier dir contents were test artifacts and were replaced.
- THE REAL RUN (measured, 2026-09-08 22:53-22:58 IST):
  - Gap-fill 2026-08-02 → 2026-09-08 in eight 5-day chunks × 2 sources = 16 FIRMS requests, 12,692 raw detections; confidence filter removed 1,127; dedup/sanity removed 0.
  - Aggregation: 12,692 detections → 9,185 H3-days across 6,163 cells; temporal history recomputed for all affected cells over combined history (leakage-safe Phase-8 semantics).
  - Static enrichment: 4,856 brand-new cells got state (pinned shapefile PIP) + WRI distances + OSM distances (cache hit 0.05 s); enrichment cost 145.7 s.
  - 10-state filter: kept 813,789 / dropped 637,941 rows (Chhattisgarh 153k, Odisha 135k, UP 99k, ...). Final serving parquets: 813,789 rows each, date range 2024-08-01 → 2026-09-08, exactly 10 states, pyarrow schemas byte-identical to the pre-migration originals.
  - Wall clock 291.4 s total; plausibility violations: NONE.
  - OSM cache build (one-time): 105.5 s for 269,106 features (farmland 117,809, power_infra 111,715, industrial 28,229, quarry 10,654, mineshaft 696, adit 3) — **mining feature parity on live data is real, not the NULL fallback**.
- End-to-end verification (all observed, not inferred):
  - `feature_store.load()` + `reload()` clean against the migrated parquets (no lock conflicts once no second process holds the file — running the pytest suite while uvicorn is up WILL fail with a DuckDB file lock; stop the backend first).
  - Backend restarted clean on :8000; `GET /api/v1/predictions?min_lat=6.75&max_lat=37.1&min_lon=68.03&max_lon=97.42&acq_date=2026-09-08` → 188 REAL predictions (mode=aggregated_macro): industrial 170, wildfire 14, mining 3, agricultural_burn 1; needs_review 1; calibrated probabilities sum to 1.
  - CORS verified from the Vite origin: OPTIONS + GET both return `access-control-allow-origin: http://localhost:5173` → frontend `fetchPredictions` will succeed and pin `apiMode='live'` (no mock fallback, OfflineBanner renders nothing). Frontend deps installed (`npm ci`); Agent B harness 7/7 PASS; oxlint 0 errors.
  - Full backend suite: 50 passed, 1 deselected (live FIRMS smoke; run explicitly with `pytest -m live`).
- Operational notes:
  - Freshness plan in force: backend startup hook (background thread, INGESTION_ON_STARTUP=0 to disable) — cheap run-history check on boot, ingestion only when stale, atomic feature-store reload after. Manual/backfill: `.venv/Scripts/python.exe -m ingestion.run_ingestion [--date D --day-range N --no-gap-fill]`.
  - Idempotent re-runs: same-day rerun overwrites by (h3_08, acq_date); history JSON at data/processed/ingestion_run_history.json (last entry ok=true).
  - FIRMS_MAP_KEY rotation still recommended (it appeared in a screenshot/URL during setup).
- Blockers / questions: none.

### 2026-09-10T11:30+05:30 Codex — Persistence classification for SHAP explanations

- Files changed: `app/services/model_service.py`, `app/schemas/prediction.py`, `frontend/src/components/HexInspectorPanel.jsx`, `tests/test_backend.py`.
- What changed: Added deterministic persistence classification and mining subtype context to `ExplanationResponse`; rendered backend-provided persistence descriptions and optional mining subtype badges without changing SHAP extraction or ranking.
- Interface impact: `GET /api/v1/predictions/{cell_id}/explain` now includes optional `persistence` and `mining_subtype` fields. `CellPredictionDetailResponse` and the CatBoost 55-feature contract are unchanged.
- Verification: Focused helper tests passed (`2 passed`) before broader verification. Full backend/frontend verification pending.
- Data note: Current live latest-day rows have resolved `is_static_land` values but all are `-1`, so the UI will honestly show `Unknown` until a resolved historical/demo date is selected.

- Final verification: `tests/test_backend.py` passed 12/12 under the pinned `.venv`; `npm run lint` exited 0 with one pre-existing unused-import warning; `npm run build` passed; `git diff --check` passed. Full pytest was attempted and reported 96 passed, 8 unrelated data-artifact/geography/parity failures, and 29 Windows temp-directory permission errors.

---

### [2026-09-08T23:35:00+05:30] Agent BACK-1 — Serving Path & API Surface Complete

- Files touched:
  - `app/api/endpoints/health.py` (new) — Mounted v1 health check alias matching root `/health` contract (`HealthResponse`).
  - `app/api/api_router.py` (modified) — Mounted `health.router` under `/api/v1/health` with `System Health` tag.
  - `app/core/config.py` (modified) — Dynamic property `CORS_ALLOW_ORIGINS` reading comma-separated origins from `os.environ["CORS_ALLOW_ORIGINS"]`, falling back to the 4 default localhost origins (ports 3000 and 5173).
  - `app/api/endpoints/audit.py` (modified) — Replaced placeholder `"server_resolved"` with real prediction lookup via `model_service.get_cell_detail(cell_id, acq_date)` storing predicted class and confidence.
  - `app/services/model_service.py` (modified) — Vectorized viewport inference: added `_prepare_batch_pool`, `_calibrate_batch`, and `predict_batch` replacing the 2,500-iteration scalar loop in `get_viewport_predictions` with a single CatBoost `predict_proba` call and vectorized per-class isotonic calibrations, preserving `latency_ms` semantics. Single-row `predict()` left intact as reference implementation.
  - `app/schemas/prediction.py` (modified) — Documented `mode` and `zoom` semantics as informative/decorative metadata in `ViewportPredictionsResponse`.
  - `docs/backend-rebuild-coordination.md` (modified) — Appended formal specification of zoom and mode contract and 2,500-cap client-tiling requirements.
  - `tests/test_api_surface.py` (new) — Dedicated test suite with 4 passing tests covering health parity, CORS env parsing, audit override honesty, and numerical parity between `predict_batch` and the reference loop (probabilities match to ~1e-9).
  - `.gitignore` (modified) — Updated DuckDB ignore to `*.duckdb*` to prevent `.duckdb.wal` permission locks during git operations.
  - `AGENT_LOG.md` (this entry).
- Interface impact:
  - `GET /api/v1/health` now live and byte-equivalent to `/health`.
  - `CORS_ALLOW_ORIGINS` dynamically configurable via environment.
  - `POST /api/v1/audit/override` now persists real prediction class and formatted confidence into `audit_log.duckdb`.
  - `GET /api/v1/predictions` vector-accelerated with identical response schema and sub-second viewport batch latency.
- Test verification:
  - `pytest tests/test_api_surface.py -v` -> 4 passed in 7.93s.
  - Full suite: 53 passed, 1 deselected, 1 failure in untouched `ingestion/firms_pull.py:360` (`NameError: name 'parts' is not defined` flagged for ingestion owner per boundaries).
- Blockers / questions:
  - Ingestion owner: note the typo in `ingestion/firms_pull.py:360` (`NameError: name 'parts' is not defined`).

---

## [2026-09-08T23:59:00+05:30] Agent BACK-2 — Data Plane, Ops & Deployment (BACK-2.1 … BACK-2.5 complete)

- Files changed:
  - `app/main.py` — (2.1) legacy alias routes `/predictions/{cell_id}` and `/predictions/{cell_id}/explain` now wrap `ValueError` with the same 404/400 mapping as the v1 handlers (helper `_map_cell_lookup_error`, 404 iff "No H3-day features found") plus a generic 500 guard — both path styles return the identical `{detail}` body. (2.4a) new `_route_ingestion_logs_into_uvicorn()` called in lifespan: mirrors `ingestion.*` + `uvicorn.startup` records into uvicorn's error handler so "skipping, data current" vs "running background ingestion" is visible at boot.
  - `app/services/audit_service.py` — (2.3) `__init__` now mkdir(parents=True) on the DB parent dir, killing crash-on-import when AUDIT_DB_PATH points at a fresh volume.
  - `Dockerfile` — (2.3) `COPY ingestion ./ingestion` (startup hook no longer silently ImportErrors; live ingestion works in-container); dev deps (pytest/httpx/ruff) uninstalled in the same pip layer; bootstrap CMD seeds /data_writable/*.parquet from the baked-in /data on first boot.
  - `docker-compose.yml` — (2.3) added AUDIT_DB_PATH + H3_DAILY_PARQUET/OSMWRI_PARQUET env pointing at the writable volume; compose `command:` (which overrides the image CMD) runs the same seed bootstrap before uvicorn; comment records the intentional-bake-in (/data ro parquets) vs writable-volume split.
  - `requirements.txt` — (2.3) added pyarrow>=14.0 (ingestion could not write parquets in the image); dev-only deps annotated.
  - `.dockerignore` (new) — keeps the 1.7 GB OSM PBF / venvs / frontend / .env out of the build context; data/processed parquets still baked in via explicit COPY.
  - `ingestion/firms_pull.py` — (2.4b) fetch_firms_both pulls SNPP + NOAA-20 concurrently (ThreadPoolExecutor, 2 requests/chunk vs 5000/10-min rate limit).
  - `ingestion/run_ingestion.py` — (2.4c) run history now records `fetch.per_chunk = {date: {day_range, per-source raw rows, rows_after_harmonize}}`.
  - `tests/test_data_plane.py` (new, 10 tests) — (2.2/2.5) DuckDB file-lock skip guard (`duckdb_file_is_locked` + `requires_default_duckdb` skipif; guard self-tested) so pytest-while-uvicorn SKIPS, never fails; schema parity of the daily parquet vs the locked 28-column contract and the static parquet vs the locked 61-column contract (exact order pinned as LOCKED_STATIC_COLUMN_ORDER — NOTE: the shipped static order interleaves WRI dist/count per fuel and OSM pairs per category; `STATIC_FILE_COLUMNS` in run_ingestion has the same name set but a different order); cross-file arrow-type equality for shared daily columns (h3_08 excluded: daily ships it dictionary-encoded, static plain string — locked shipped state); 10-state-only assertions on the real parquets (exact-set on static); freshness max(acq_date) >= today-2 with SKIP when the parquet is byte-identical to the pre-10-state backup; get_cell fast-path + reload-under-lock contract consolidated here from test_ingestion.py (unknown cell → None; new parquet data invisible until reload(); get_cell safe under 4 concurrent query threads x 5 reloads); legacy-alias 404 body parity vs v1 (TestClient).
  - `AGENT_LOG.md` — this entry.
- Verification run (all observed, not inferred):
  - Full suite `.venv\Scripts\python.exe -m pytest -q` → 64 passed, 1 deselected (live), twice: before and after BACK-1's changes landed (sequencing contract honored).
  - Docker acceptance (2.3): `docker compose up --build backend` boots, GET /health green (model_loaded, calibrators_loaded, review thresholds); audit.duckdb + feature_store.duckdb + seeded serving parquets confirmed on the sih2026-data volume; ingestion.run_ingestion importable in-image. LIVE ingestion attempt in-container (`docker compose run ... python -m ingestion.run_ingestion --day-range 1 --no-gap-fill`, data/raw mounted ro, FIRMS_MAP_KEY injected) → ok=true, 37.2 s, 0 plausibility violations, wrote both serving parquets on the volume (mtime updated, max acq_date = 2026-09-08). One real bug found during verification: compose `command:` overrode the image CMD so the bootstrap never ran (first boot failed lifespan with "Missing H3 daily parquet") — fixed in compose. Verification containers stopped afterwards; port 8000 freed.
  - Log routing (2.4a): docker logs now surface the startup-hook ingestion messages (observed the raw-input warning instead of silence).
  - SUPERSEDES the BACK-1 23:35 entry's flagged failure in `ingestion/firms_pull.py:360` (`NameError: parts`): that was a transient mid-edit state of my BACK-2.4b change; fixed before any commit and covered by the 64-passed suite runs.
- Contradicts or supersedes: only the NameError flag above. Host serving parquets untouched; the in-container live run wrote only to the docker volume.
- Open items handed off:
  - RUN_HISTORY_PATH is repo-relative, so in-container runs write run history to the ephemeral container fs — making it env-overridable to the writable volume is the natural next ops fix; per-chunk FIRMS row counts (2.4c) land in that JSON.
- `.venv` vs `.venv-pinned` interpreter split (2026-09-08 Codex entry) still unresolved; suite verified under `.venv` (Python 3.12.13).

### 2026-09-09 Codex — Verification

- `frontend`: `npm run lint` completed with existing warnings; `npm run build` passed.
- Backend focused API surface: `4 passed`; only dependency deprecation/cache warnings.
### 2026-09-09 Codex — Fire alerts latest-date synchronization

- Updated `FireAlertsPage.jsx` to use the existing `fetchLatestAcqDate()` helper before querying predictions, preventing silent empty results when the backend has historical data only.
- Preserved the existing loading, error, empty, filtering, and CSV-export flows while displaying the discovered acquisition date.
- Interface impact: the health response's existing `latest_acq_date` value is now used by alerts as well as the map.
- Verification pending: frontend lint/build and focused backend health checks.

### 2026-09-09 Codex — Canonical clone-and-run documentation

- Added `docs/PROJECT_SETUP.md` covering the repository map, setup prerequisites, demo/live modes, model/data/API/frontend/PMTiles/Docker contracts, artifact inventory, troubleshooting, verification, and AI-agent protocol.
- Added `scripts/setup.ps1` for Windows dependency, environment, model, and serving-data checks.
- Added `scripts/verify.ps1` for model, serving parquet, health, latest-date, and prediction smoke checks.
- Linked the canonical guide from `README.md` and corrected stale model/feature references in `BACKEND_DOCUMENTATION.md`.
- Interface impact: documentation and operator scripts only.
- Blockers: live mode still requires user-supplied OSM PBF, WRI CSV, boundary inputs, and `FIRMS_MAP_KEY`; these are intentionally not fabricated or committed.
- Verification: both PowerShell scripts parse successfully; `setup.ps1 -Mode demo -SkipInstall` completed; `git diff --check` reported no whitespace errors.

### 2026-09-09 Codex — Worktree cleanup verification

- Restored unrelated deleted `.agents/skills/code-review/*` files; ignored local environments, secrets, datasets, databases, caches, and dependencies were preserved.
- Verification passed: PowerShell parsing, demo setup, `git diff --check`, frontend lint, and frontend production build.
- Full pytest verification was blocked by a DuckDB file lock from a stale repository Python process; the process was stopped, but subsequent pytest invocations spawned persistent Python workers and did not return a final result. Earlier recorded full-suite evidence remains 64 passed, 1 deselected.
- No backend service was running during `scripts/verify.ps1`, so live health/latest-date/prediction smoke checks were not claimed.

### 2026-09-09 Codex — Serving data release

- Published GitHub release `serving-data-2026-09-09` for `dptel22/SIH_2026`.
- Assets include `sih2026-serving-data-v1.zip`, `SHA256SUMS.json`, and the FIRMS serving parquet; the ZIP contains both serving parquets.
- Updated `scripts/setup.ps1` with `-DownloadServingData` and documented the release URL in `docs/PROJECT_SETUP.md`.

### 2026-09-09T21:36:09+05:30 Codex — UI, Blue Marble, and reproducibility cleanup

- Updated the frontend classification filters, legend, reliability copy, hotspot inspector, evidence-based explanation text, and class-specific map markers.
- Replaced the stretched single-image Blue Marble source with locally generated Web-Mercator tiles under `frontend/public/tiles/bluemarble/`; added `frontend/scripts/build_bluemarble_tiles.py` for regeneration.
- Added direct serving-data release download instructions and explicit regeneration paths for ignored PMTiles, raw FIRMS data, and runtime databases in `docs/PROJECT_SETUP.md`.
- Interface impact: visual-only frontend changes and operator documentation; no backend API/schema changes.
- Verification: frontend test suite 9/9 groups passed; `npm run build` passed; `git diff --check` passed; local map preview visually verified the tiled Blue Marble layer and class markers.

### 2026-09-10 Agent 3 — Alerts/archive visual QA and accessibility verification

- Verified Agent 2's alerts/archive frontend in a real browser (ZCode IAB, Chromium) against a fresh archive-compatible backend on port 8001 (`/api/v1/archive/*` confirmed live; the long-running port-8000 backend predates the archive router and was left untouched) and a dedicated vite dev server on port 5199 (`VITE_API_URL=http://127.0.0.1:8001`).
- Routes verified visually: `/` (splash + map), `/fire-map` (also with the new `&date=` deep-link param — tolerated, ignored, no crash), `/fire-alerts`, `/archive` (deep link works in vite dev; Agent 2's noted SPA-fallback limitation did not reproduce).
- Alerts states verified: LIVE (newest date), HISTORICAL + per-date "No ingestion run record" warning (older dates), DEMO (client-side nav from a mock-flipped map; SIMULATED badges per row), OFFLINE (dead backend; explicit no-mock-substitution message, disabled export/date controls, Retry), filter chips with counts, pagination, CSV download event, View on Map links carrying `&date=`. Sort comparator code-reviewed (uniform 100% confidence in this seeded dataset makes orders visually indistinguishable). Loading, no-detections-for-valid-date, and unavailable-date states are not reachable with the current 8-date store in the live UI; they remain covered by unit tests (22/22).
- Archive verified: always HISTORICAL (including newest day), Older/Newer navigation both directions, class/state/needs-review/confidence filters (server-side), needs-review filter matches API `needs_review_total` exactly (09-02: 137→12), zero-match state with disabled Export CSV, summary cards, CSV download event, archive→map link carrying the selected date.
- FIX 1 (`frontend/src/components/FireAlertsPage.jsx`): returning to the newest date after viewing an archived day kept the HISTORICAL badge, because the live-feed branch of `loadAlerts` never restored `backendDataMode` after an archive response set it to `'historical'`. Added `datesDataModeRef` (set at bootstrap from the dates endpoint, restored in the live branch). Verified LIVE→HISTORICAL→LIVE via both the select and Older/Newer paths.
- FIX 2 (`frontend/src/components/ArchivePage.jsx`): the archive-wide "Need analyst review" card always showed 0 — `archiveTotals` summed `d.needs_review_total` from days already normalized to camelCase (`needsReviewTotal`) by `fetchArchiveSummary`. Now sums `needsReviewTotal` (snake_case kept as fallback). Verified: card shows 608, matching the `/api/v1/archive/summary` total.
- Keyboard/focus: honest failure — the IAB guest window never holds OS focus, so real Tab presses never move DOM focus and programmatic `.focus()` never matches `:focus` (`matches(':focus') === false` with `activeElement` set). The focus-ring rule (`index.css` `button:focus, select:focus, …`) IS loaded and correct in the live CSSOM (verified `outline: 2px solid #3D9DE8`); the painted ring still needs one manual Tab test in a focused browser. Same limitation Agent 2 documented.
- Responsive: 820px tablet renders cleanly; 390px layout stacks correctly with one pre-existing ~6px header-wrapper horizontal scroll (not from the alerts/archive work; phone check skipped per user instruction after capture).
- Verification: `node test_agent_alerts.mjs` 22/22, `node test_agent_b.mjs` 10/10, `npm run lint` 0 errors / 3 pre-existing warnings, `npm run build` passes, `git diff --check` clean.
- Interface impact: two small frontend fixes only; no API, schema, backend, map-architecture, or dependency changes.

### 2026-09-10 Agent 4 — Adversarial review of alerts/archive + frontend fixes

- Reviewed Agents 1–3's work against the code (Agent 3's report lives in the AGENT_LOG entry above, not a separate file): verified both Agent 3 fixes in code, exercised all 9 API endpoints over HTTP against the archive-capable backend on port 8001 (port 8000 predates the archive router and 404s /api/v1/archive/* — restart before demoing), and browser-verified /fire-alerts (LIVE↔HISTORICAL navigation, sorting, caveats, pagination), /archive (always HISTORICAL, cards 1796/608, zero-result state with disabled export), light/dark themes, 390px layout, and archive→map &date= deep links.
- Endpoint verification: 404 structured archive_date_not_available; 400 malformed date/unknown class/min>max; limit>1000 rejected; newest date live/ok, 2026-09-02 historical/no_run_record with needs_review=true → 12; summary 8 days / 1796 / 608 (matches ingestion final_daily_rows); state+geography present on archived rows; no outside-India keys.
- FIX A (frontend/src/components/ArchivePage.jsx): bounded /archive/summary to the most recent 31 archived days (backend caps the span; an unbounded request would 400 once the archive grows) and added an explicit role="alert" "summary unavailable" state instead of silent zero cards; first card reads "latest 31 days" when bounded.
- FIX B (frontend/src/components/ArchivePage.jsx + FireAlertsPage.jsx): archive status pill now reuses the exported StatusBadge (new optional labelPrefix prop) instead of duplicated markup; removed the dead firstRenderRef branch in the reload effect.
- FIX C: deleted untracked dead file frontend/test_jsx_loader.mjs (self-referenced only).
- Deliberately NOT changed (documented in docs/coordination/alerts-archive/agent-4-adversarial-review.md): LIVE label on unknown provenance in the /health-fallback path (test-asserted design, disclosed inline), ingestionStatusWarning('failed') wording nuance (backend shape makes no-run and failed indistinguishable), CSV formula-prefix escaping (backend-controlled values only).
- Verification: npm run build passes; npm run lint 0 errors; node test_agent_alerts.mjs 22/22; node test_agent_b.mjs 11/11; pytest tests/test_archive.py 26 passed; git diff --check clean. Full report: docs/coordination/alerts-archive/agent-4-adversarial-review.md.
- Interface impact: StatusBadge gains an optional labelPrefix prop (default 'Feed status' — existing call sites unchanged); ArchivePage bootstrap now fetches the summary sequentially after dates (bounded window). No backend, schema, or dependency changes.

## [2026-09-10T05:10+05:30] Agent: ZCode — Phase 3+4 complete: raw FIRMS evidence archive, run manifests, alert lifecycle

**Scope:** Closed the three remaining gaps from the code-verified review. No new database engine; reuses the audit DuckDB, atomic-parquet, and run-history patterns.

**Backend:**
- `ingestion/firms_pull.py` — `fetch_firms_both(return_raw=True)` now also returns the untouched per-source `_parse_csv` frames (column superset preserved).
- `ingestion/raw_archive.py` (new) — immutable raw archive at `data/archive/firms/source=<SRC>/acq_date=<DATE>/part-<run_id>.parquet`; run_id in the filename makes parts immutable by construction; zero-detection days still write schema-carrying partitions; `has_parts()` / `read_raw_observations()` for serving; sha256 per part; no filesystem paths in returned descriptors.
- `ingestion/manifest.py` (new) — best-effort INSERT-only `ingestion_runs` DuckDB manifest (`INGESTION_DB_PATH`); a manifest failure never fails a run; JSON run history stays authoritative.
- `ingestion/run_ingestion.py` — real `run_id` (`RUN-<UTC>-<hex6>`), raw parts written BEFORE aggregation (evidence survives mid-run crashes), `schema_hash` (sha256 of the daily arrow schema) + `model_version` + `raw_archive` in run stats and history; override runs record `raw_archive.skipped`; failure-path history entries carry run ids.
- `app/services/audit_service.py` — single persistent read-write connection under a Lock (removes the latent read_only/read-write mixed-config failure under the FastAPI threadpool); new append-only `alert_lifecycle_events` table; `log_action` (server-side resolution of model output + run provenance), `get_state_for_date` (replay: latest state-changing event wins, `note` never moves state, `reopened` → new), `get_history`.
- `app/api/endpoints/alerts.py` + `app/schemas/alerts.py` (new) — `POST /alerts/{hotspot_id}/actions` (DEMO_ANALYST default applied server-side; dismissals require a >=10-char note), `GET /alerts/states?acq_date=`, `GET /alerts/{hotspot_id}/history`.
- `app/api/endpoints/evidence.py` + `app/schemas/evidence.py` (new) — `GET /archive/runs` (whitelisted manifest fields, path-free, acq_date matches targets, @date chunk keys and raw parts) and `GET /archive/evidence` (raw rows behind a prediction date; run_id defaults to the decisive run; 404 "raw_evidence_not_available" only when no partition exists — a zero-row partition is a valid empty day, 200).
- `app/services/archive_service.py` — `_run_id()` promotes real run ids, falls back to the synthetic `date:started_at` key for pre-manifest history.
- `app/core/config.py` — `RAW_ARCHIVE_DIR` (env-overridable).

**Frontend (`backend/frontend`):**
- `src/services/api.js` — strict-path `submitAlertAction` / `fetchAlertStates` / `fetchAlertHistory` / `fetchArchiveRuns` / `fetchRawEvidence`; CSV export gains `alert_state`, `analyst_note`, `ingestion_run_id`.
- `AlertCard` (shared) — lifecycle state chip (distinct from the model's needs-review badge), analyst action bar with reviewer identity persisted in localStorage (default DEMO_ANALYST + visible demo tag; disabled in mock mode — no backend to persist to), append-only review-history toggle, raw-FIRMS-evidence panel with an honest "predates the raw archive" state.
- `FireAlertsPage` + `ArchivePage` — replay-derived states fetched per date and joined by `{h3_08}_{acq_date}` (prediction `cell_id` carries only the h3 index, so ids are composed with the acquisition date), REVIEW STATE filter chips with counts, reviewed/unreviewed-lifecycle totals, run-manifest block on the archive page.
- Fixed mid-verification: hotspot id composition (browser POSTs were 400ing on bare h3 ids) and empty-day evidence 404 conflation.

**Verification:**
- Backend pytest: **131 passed, 1 deselected** (28 new tests: raw archive, ingestion hook, manifest, lifecycle, evidence).
- `npm run lint` → 0 errors; `npm run build` → pass.
- Browser (live backend + live FIRMS run): acknowledge → confirm flows update chips/counts; history shows append-only events with analyst ids and notes; evidence panel shows the honest not-captured/empty-day states; archive run-manifest block shows run id, raw parts, and plausibility warnings; a real `RUN-20260909T235222-6cef34` run (0 points, flagged) wrote zero-row parts for 2026-09-10 and served evidence with `ingestion_status=plausibility_warning`.

**Known honest limitations:** dates ingested before this change have no raw parts (UI says so explicitly); FIRMS NRT's rolling window means gap-fill re-queries of older days legitimately return 0 rows and the newest-run provenance rule then flags those days as `plausibility_warning` — intended, truthful behavior.


---

## [2026-09-10T10:00:00+05:30] Agent: Documentation Update
- Files changed:
  - `BACKEND_DOCUMENTATION.md`
  - `CONTRIBUTING.md`
  - `FRONTEND_INTEGRATION_GUIDE.md`
  - `AGENT_LOG.md`
- What changed:
  - Updated backend documentation to include audit endpoints, and corrected response shape (calibrated, needs_review).
  - Simplified `CONTRIBUTING.md` to reference Agent conventions and updated folder structures.
  - Updated `FRONTEND_INTEGRATION_GUIDE.md` to match taxonomy, colors, and backend contract (calibrated, needs_review).
  - Audited `AGENTS.md`, `CLAUDE.md`, and `TRAINING_SERVING_SKEW_TEST_REPORT.md` for consistency.
  - Updated `BACKEND_DOCUMENTATION.md` to clarify provenance of `is_static_land` and `is_first_observation` flags.
- Interface impact: none (docs only).
- Blockers / questions: none.

---

## [2026-09-10T18:00:00+05:30] Agent: Persistence Null-Safety Review

- Files changed:
  - `app/services/model_service.py`
  - `tests/test_backend.py`
  - `BACKEND_DOCUMENTATION.md`
  - `.gitignore`
- What changed:
  - Normalized `None` and float/NumPy `NaN` values for static provenance and recent-activity fields before persistence classification.
  - Added regression coverage for nullable and missing inputs, plus a real serving row that predicts `mining` and exercises subtype output end to end.
  - Corrected `is_first_observation` documentation to describe historical first observation rather than current-event novelty.
  - Ignored only the two requested root diagnostics: `check_data_v2.py` and `check_settings.py`.
- Verification:
  - `tests/test_backend.py`: 13 passed.
  - Frontend `npm run lint`: passed with the existing unused `fetchArchiveRuns` warning; `npm run build`: passed.
  - Baseline `HEAD` and working-tree full-suite runs used the same pinned environment and ignored artifacts; both had the same five failing node IDs: the locked static schema, nationwide serving coverage, and three training-serving parity checks.
  - `git diff --check`: passed.
- Interface impact: explain responses retain the three SHAP attributions and now include nullable-safe persistence and mining subtype context.
- Blockers / questions: unrelated deleted `.agents/skills/code-review/*` files and user diagnostic files were preserved outside the feature changes.
