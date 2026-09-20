# Agent 4 Handoff — Adversarial Reliability & Simplification Review

## Scope
Full adversarial review of the Alerts + Archive workflow (backend archive
endpoints, frontend alerts/archive pages, both agents' handoff claims, Agent
3's logged QA), plus resolution of the findings. No backend behavior changed;
fixes are frontend-only and additive. Review-only findings that were verified
but deliberately NOT changed are listed with reasoning.

## Verification performed (all fresh, by Agent 4)
- `npm run build` → passes.
- `npm run lint` → 0 errors (3 pre-existing warnings at review time, in files
  outside this task; a later tree state shows 0 — not from this task's edits).
- `node test_agent_alerts.mjs` → 22/22 groups.
- `node test_agent_b.mjs` → 10/10 groups at review time (11/11 in the later
  tree — an extra group appeared from concurrent work, not this task).
- `pytest tests/test_archive.py` → 26 passed.
- `git diff --check` → clean.
- Backend exercised over HTTP against the archive-capable instance on port
  8001 (the long-running port-8000 process predates the archive router and
  404s `/api/v1/archive/*` — restart it before demoing):
  - `/health`, `/api/v1/health` (with `ingestion` provenance block) OK.
  - `/archive/dates` → 8 real stored dates, newest 2026-09-09, `data_mode: live`.
  - `/archive/predictions` newest → live/ok, 92 rows; 2026-09-02 →
    historical/no_run_record, 137 rows, needs_review=true → 12 (matches
    Agent 3's browser measurement exactly); `state` + `geography` present.
  - 404 unknown date with structured `archive_date_not_available`; 400
    malformed date / unknown class / min>max; limit>1000 rejected (422).
  - `/archive/summary` → 8 days, 1796 total, 608 needs-review (matches
    ingestion `final_daily_rows` and Agent 3's FIX 2 number), no gaps.
  - `/predictions`, `/predictions/{cell_id}`, `/explain`, `/audit/logs` OK.
  - No outside-India/Sri Lanka keys in `by_state`; India filtering unchanged.
- Browser (ZCode IAB against vite 5199 → backend 8001): /fire-alerts LIVE
  badge, 92 rows, review-first sorting, caveats, pagination; date navigation
  09-08 → HISTORICAL + "No ingestion run record" + 275 rows, back to 09-09 →
  LIVE restored; /archive always HISTORICAL, cards 1796/608, zero-result
  filter state (Wildfire+Punjab) with disabled Export CSV; light/dark themes;
  390px responsive; archive→map deep link with `&date=` renders the map.

## Agent 3's fixes — verified in code, accepted
- FIX 1 `datesDataModeRef` restore (LIVE returns after HISTORICAL) — present
  and re-verified in the browser after this task's edits.
- FIX 2 `needsReviewTotal` camelCase sum — present; card shows 608.

## Findings and resolution

### FIXED (this task)
1. **Unbounded archive summary (medium)** — `ArchivePage` requested the full
   summary; once the store exceeds the backend's 31-served-day cap the request
   would 400 and the cards would silently read 0. Now bootstrap bounds the
   request to the most recent 31 archived days (`SUMMARY_WINDOW_DAYS`), the
   first card reads "latest 31 days" when bounded, and a failed summary shows
   an explicit `role="alert"` banner instead of silent zeros.
2. **Duplicated status pill** — `ArchivePage` now reuses the exported
   `StatusBadge` from `FireAlertsPage` (new optional `labelPrefix` prop;
   archive passes "Archive status"). Removes ~16 duplicated lines; visual
   delta is the added 8px status dot.
3. **Dead branch** — removed the pointless `firstRenderRef` conditional in
   `ArchivePage`'s reload effect (both arms were identical).
4. **Dead file** — deleted untracked `frontend/test_jsx_loader.mjs`
   (self-referenced only; the SSR tests use Vite `ssrLoadModule` directly).

### VERIFIED, DELIBERATELY NOT CHANGED
5. **LIVE on unknown provenance** (`api.js` `deriveAlertsStatus` final
   branch): when `/archive/dates` fails but `/health` works, the newest day is
   labeled LIVE without ingestion provenance. This is asserted by test group 1
   (deliberate design), disclosed inline by the "using /health fallback" text,
   and mapping null → HISTORICAL would mislabel genuinely-current data.
   Left as designed; documented here.
6. **`ingestionStatusWarning('failed')` unreachable via /health**: when the
   last run fails, `ingestion_provenance()` returns `available: false`, and a
   no-run record is indistinguishable from a failure in that shape — the
   generic "provenance unavailable" warning that fires is the honest wording.
   Per-date `failed` status still surfaces through the archive responses.
7. **CSV formula-prefix injection** not neutralized: all exported fields are
   backend-controlled values; changing the shared export path is unjustified.

## Handoff to Agent 5
- All fixes are in `frontend/src/components/ArchivePage.jsx` and
  `FireAlertsPage.jsx`; no API, schema, backend, or dependency changes.
- Re-run `npm run build`, `npm run lint`, `node test_agent_alerts.mjs`,
  `node test_agent_b.mjs`, `git diff --check` for fresh verification.
- Restart the port-8000 backend (or point the demo at an archive-capable
  instance) so `/api/v1/archive/*` responds.

## Completion status
- COMPLETE
