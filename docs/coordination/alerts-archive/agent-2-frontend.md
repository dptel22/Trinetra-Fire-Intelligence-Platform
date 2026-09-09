# Agent 2 Handoff

## Scope

Frontend alerts/archive experience only, in `backend/frontend` (the active
frontend — the legacy top-level `/frontend` was not touched). Turned the
latest-date alert list into a truthful operational feed (LIVE / HISTORICAL /
DEMO / OFFLINE, date navigation, provenance, staleness warnings) and added a
lightweight historical archive page. No backend, model, ingestion, or map
rendering changes.

## Files changed

- `frontend/src/services/api.js`
- `frontend/src/components/FireAlertsPage.jsx`
- `frontend/src/components/ArchivePage.jsx` (new)
- `frontend/src/App.jsx`
- `frontend/src/components/Header.jsx`
- `frontend/src/index.css`
- `frontend/test_agent_alerts.mjs` (new focused tests)
- `docs/coordination/alerts-archive/agent-2-frontend.md` (this file)

## API integration

All Agent 1 endpoints, exactly as specified in `agent-1-backend.md`:

1. `GET /api/v1/archive/dates` → `{available_dates[], newest_date, oldest_date,
   source, data_mode}`. Wraps as `fetchArchiveDates()` → camelCase
   `{availableDates, newestDate, oldestDate, source, dataMode}`. Non-OK throws
   (no invented dates). Consumed by both pages; the alerts page falls back to
   `GET /api/v1/health`'s `latest_acq_date` (single-date mode) when the dates
   endpoint fails, and labels the fallback visibly.
2. `GET /api/v1/archive/predictions?acq_date&class_name&state&needs_review&
   min_confidence&limit&offset` → `{total, acq_date, predictions[],
   data_mode, source, model_version, ingestion_run_id, ingestion_status}`.
   `fetchArchivePredictions(...)` normalizes to camelCase; a 404
   `archive_date_not_available` rejects with `err.notAvailable = true` so the
   UI renders "data unavailable for this date" instead of a generic error.
3. `GET /api/v1/archive/summary` → `{days[{date,total,needs_review_total,
   by_class,by_state}], unavailable_dates, data_mode, source}` via
   `fetchArchiveSummary()` (days normalized to camelCase).
4. `GET /api/v1/health` — `latest_acq_date` + `ingestion` provenance block
   (target_date, fetch_mode, finished_at, final_daily_rows, last_run_ok) used
   for the freshness/staleness warnings on the alerts page.
5. `GET /api/v1/predictions` (existing, tiled) — still the data source for the
   newest date on the alerts page, but only through the new
   `fetchPredictionsStrict()`, which throws on live failure instead of
   silently returning mock rows (the legacy `fetchPredictions` behavior is
   unchanged for the Fire Map).

## UI behavior

- **FireAlertsPage (`/fire-alerts`)**
  - Status badge with exactly one of LIVE / HISTORICAL / DEMO / OFFLINE.
    LIVE requires: live api mode, no fetch error, selected date == newest, and
    backend `data_mode === 'live'`. Older dates route through the archive
    endpoint and are HISTORICAL with the backend-reported per-date
    `data_mode`/`ingestion_status`. Failed live requests are OFFLINE — mock
    rows are never substituted silently. Explicit demo mode is labeled DEMO.
  - Provenance strip: archive source string, last ingestion run target date,
    fetch_mode, finish time, newest available date, archived date count.
  - `assessIngestionFreshness()` shows a `role="alert"` banner when the newest
    date is ≥3 days old, when the last run failed, when `final_daily_rows` is
    implausibly low (<200 nationwide), or when provenance is missing;
    `ingestionStatusWarning()` surfaces per-date `plausibility_warning` /
    `failed` / `no_run_record` statuses.
  - Date navigation: native `<select>` populated ONLY from backend-reported
    dates + "← Older" / "Newer →" buttons; date change reloads data and resets
    pagination (invalid class filters self-reset via the existing
    effective-class logic).
  - Distinct empty states: loading; "No detections for this date" (valid
    stored date, zero rows — explicitly NOT phrased as "no fires occurred");
    "Data unavailable for this date" (404 archive_date_not_available);
    backend error/OFFLINE panel; filter-no-match.
  - Preserved: class filter chips with counts, review-first/confidence
    sorting, pagination, probability rows, review badges, caveat text,
    SIMULATED badge, light/dark theming, class colors/terminology.
  - CSV export carries `acq_date` and `data_mode` columns and the selected
    date in the filename.
  - The alert card markup is exported as `AlertCard` and reused by the
    archive page (no duplication). Map links now append `&date=<acq_date>`.
- **ArchivePage (`/archive`, route + drawer entry added)**
  - Always framed as historical ("Historical Record" + HISTORICAL badge, even
    for the newest day — archived rows are never presented as the live feed;
    DEMO/OFFLINE still surface when the backend reports them).
  - Browses backend dates; server-side filters (class, state, needs-review
    checkbox, min confidence) with limit 1000 and a visible truncation notice
    when `total` exceeds it; client-side pagination over fetched rows.
  - Summary cards (aria-live): archive-wide totals from `/archive/summary`
    (predictions, days, needs-review) plus filtered/per-day counts.
  - Rows reuse `AlertCard`; map links carry lat/lon/h3/date; CSV export of
    the current filtered result set includes `acq_date` + `data_mode`.
- **Accessibility**: native buttons/selects/checkbox with real `<label>`s,
  `aria-live="polite"` on changing counts/status, `role="alert"` on warnings/
  errors, `aria-pressed` filter chips, visible `:focus` outline rule in
  `index.css` (applied on plain `:focus`, not just `:focus-visible` — see
  limitations), responsive flex-wrap layout preserved.

## Visual verification

Inspected in a real browser (ZCode in-app browser, Chromium) against a fresh
`uvicorn app.main:app` on port 8001 (temp DuckDB copy — the user's live
backend on port 8000 holds the DuckDB lock and predates the archive router)
and `vite --port 5199` with `VITE_API_URL=http://localhost:8001`:

- `/fire-alerts` LIVE, light theme (screenshot): LIVE badge, provenance strip,
  date toolbar, filter chips with counts (92 alerts, 8 dates), caveat chips,
  pagination — all readable on light surfaces.
- `/fire-alerts` LIVE, dark theme (screenshot): same, readable on dark.
- Historical date view (screenshot, `2026-09-08` via select and `2026-09-07`
  via ← Older button): HISTORICAL badge, per-date "No ingestion run record"
  warning banner, 275/284 archived rows loaded from `/archive/predictions`,
  pagination reset verified.
- Zero-result filter on `/archive` (screenshot, Wildfire+Punjab): distinct
  "No predictions for this date with the current filters" state, disabled
  Export CSV, summary cards update (0 rows filtered / 1796 archive total).
- Offline state (screenshot, test backend stopped): OFFLINE badge, error panel
  with Retry, explicit "Simulated demo data is deliberately NOT substituted",
  export disabled, date select disabled. Verified no mock rows appeared.
- Mobile width 390×844 (screenshot): controls stack and wrap, chips usable,
  text readable.
- Archive→map navigation: clicked a row's "View on Map" from `/archive`;
  navigated to `/fire-map?lat=…&lon=…&h3=…&date=2026-09-09`. Existing map
  links remain valid (extra `date` param is additive).
- Archive page dark theme (screenshot) — readable; `/archive` DOM snapshot
  verified filters, state list (27 states from data), summary, rows.
- CSV export: Export CSV click executed in-browser (download capture is not
  surfaced by the automation browser); filename/date/mode columns are covered
  by unit tests. CSV was additionally generated in-page via the same code
  path earlier in dev.
- Keyboard: Tab navigation moves focus through header controls into the date
  select (verified via activeElement). See limitation below on painting the
  ring in the automation browser.

## Tests

Commands run (all in `backend/frontend` unless noted):

- `node test_agent_alerts.mjs` → **22/22 groups passed** (new; covers status
  derivation matrix, ingestion staleness/low-volume/failed/missing, strict
  live fetch throwing without flipping api mode, legacy fetchPredictions mock
  fallback documented, archive dates/predictions/summary normalization,
  404 date-not-available flagging, CSV date+mode columns + legacy compat,
  SSR smoke of both pages via Vite ssrLoadModule).
- `node test_agent_b.mjs` → **10/10 groups passed** (existing suite intact).
- `npm run build` → passes (rolldown/vite, no errors).
- `npm run lint` (oxlint) → 0 errors, 3 warnings, all pre-existing in files
  outside this task (AnnouncementsModal.jsx, QuickSearchModal.jsx fast-refresh
  exports; FireMapPage.jsx ref access). Verified against a stashed baseline.
- `git diff --check` → clean.
- Backend regression (Agent 1's area, untouched): not re-run by this agent;
  archive endpoints exercised live over HTTP instead.

## Known limitations

- **`app.archive.list` is not a route**: the vite dev server has no history
  fallback, so deep-linking `/archive` directly in dev 404s; in-app
  navigation (drawer, links) works. `vite preview`/built app behaves per
  server config. Consider adding the SPA fallback for dev.
- **Focus ring rendering could not be captured in the automation browser**:
  the IAB guest window never holds OS focus, so `:focus`/`:focus-visible`
  never match there even for real Tab presses (focus movement itself works).
  The rule is plain CSS and will render in a focused browser; it uses
  `:focus` rather than `:focus-visible` deliberately so the ring cannot be
  suppressed by the heuristic (minor cosmetic ring on mouse click).
- The user's live backend process (port 8000) was started before Agent 1's
  archive router existed — `/api/v1/archive/*` 404s there until it is
  restarted. I did not restart it (not my process); all verification used a
  separate instance on port 8001 with a copied DuckDB store.
- Alerts-page historical browsing fetches up to 1000 archived rows and shows
  a truncation notice if `total` is larger; full filterable browsing beyond
  that is the Archive page's job (by design).
- The commit necessarily includes pre-existing uncommitted hunks in
  `api.js`, `FireAlertsPage.jsx`, and `index.css` (alerts-adjacent frontend
  polish that pre-dated Agent 2 and was left uncommitted by earlier work, per
  Agent 1's handoff). No unrelated file was staged.
- FIRMS provenance does not prove any observation is definitely an industrial
  fire, gas flare, or wildfire — the archive page states this explicitly.
- The running tab was verified against seeded store
  `sih2026_h3_daily_features_firms.parquet` (the copy's seed); confidence
  values of 100% and "outside training geography" caveats are properties of
  that data, not frontend behavior.

## Agent 3 instructions

1. **Restart the live backend** so it picks up Agent 1's archive router
   (`/api/v1/archive/*` currently 404 on the long-running port-8000 process);
   then confirm `/fire-alerts` against it.
2. Visually verify the keyboard focus ring on `button/select/a` in a focused
   (non-automation) browser — the CSS rule is `index.css` `button:focus,
   select:focus, ...` and could not be painted in the automation guest.
3. Check the Fire Map (unchanged code) tolerates the new `&date=` query
   param on deep links — it is ignored today; wiring it to open the matching
   acquisition date would be a natural follow-up.
4. If a true date-picker is wanted, add `<input type="date">` constrained to
   `available_dates` — the current control is a native `<select>` of
   backend-reported dates only (deliberate: never invent dates).
5. Optional: add `?date=` support to `/fire-alerts` deep links so the archive
   can link a preselected date.

## Completion status

- COMPLETE WITH LIMITATIONS
  (all scoped behavior implemented and verified; limitations are documented
  above and none block use — the main environmental caveat is restarting the
  live backend to serve the archive routes)
