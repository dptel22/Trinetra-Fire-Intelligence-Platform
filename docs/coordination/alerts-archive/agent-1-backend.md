# Agent Handoff

## Scope
Backend archive + provenance foundation for Fire Alerts / historical Archive
browsing. Three new read-only GET endpoints under `/api/v1/archive/*`, honest
serving provenance derived from the ingestion run history, and focused tests.
No React components touched; no new database, no PostgreSQL/Redis/WebSockets;
reuses the existing DuckDB feature store, `predict_batch` inference, and
existing FastAPI patterns.

## Files changed
- `app/api/api_router.py` (registered archive router)
- `app/services/feature_store.py` (added `available_dates()`, `rows_for_date()`)
- `app/schemas/archive.py` (new)
- `app/services/archive_service.py` (new)
- `app/api/endpoints/archive.py` (new)
- `tests/test_archive.py` (new)

## Implementation

### Exact endpoints added
1. `GET /api/v1/archive/dates`
   ```json
   {
     "available_dates": ["2026-09-02", "..."],
     "newest_date": "2026-09-09",
     "oldest_date": "2026-09-02",
     "source": "duckdb:feature_store.duckdb:h3_daily (seeded from sih2026_h3_daily_features_with_osm_wri.parquet)",
     "data_mode": "live | historical | demo | offline"
   }
   ```
   `data_mode` is the mode of the NEWEST date. Empty store → all empty + `"offline"`.

2. `GET /api/v1/archive/predictions?acq_date=YYYY-MM-DD[&class_name=][&state=][&needs_review=][&min_confidence=][&max_confidence=][&limit=][&offset=]`
   ```json
   {
     "total": 123,
     "acq_date": "2026-09-09",
     "predictions": [ { PredictionResponse — unchanged existing schema } ],
     "data_mode": "...",
     "source": "...",
     "model_version": "v3-h3-day-catboost",
     "ingestion_run_id": "2026-09-09:2026-09-09T18:37:08.353967+00:00",
     "ingestion_status": "ok | plausibility_warning | failed | no_run_record"
   }
   ```
   - Full day is scored with `predict_batch` (no SQL LIMIT before
     filtering); filters apply to the full prediction set; pagination slices
     last. Rows are `ORDER BY d.h3_08`, so pages are stable/duplicate-free.
   - Bounded params: `limit` 1–1000 (default 200), `offset` 0–100000,
     confidences 0–1, class whitelist = TARGET_CLASSES + `unclassified`.
   - Unknown date → **404** `{"detail": {"error": "archive_date_not_available",
     "acq_date", "newest_date", "oldest_date"}}`. Malformed date / unknown
     class / min>max → 400. No mock fallback anywhere.
   - Each prediction keeps the untouched `PredictionResponse` contract
     (`state` and `geography` included). **Nothing is called an "alert"** —
     no alert lifecycle exists in the backend schema.

3. `GET /api/v1/archive/summary?start_date=&end_date=` (both optional;
   default full archive)
   ```json
   {
     "start_date": "...", "end_date": "...",
     "days": [ { "date", "total", "needs_review_total",
                 "by_class": {...}, "by_state": {...} } ],
     "unavailable_dates": [],
     "data_mode": "...",
     "source": "..."
   }
   ```
   Missing state totals under key `"unknown"`. Span capped at 31 served days
   (400 beyond). Calendar gaps INSIDE the store's span are reported in
   `unavailable_dates` — gaps are reported, never filled.

### Provenance rules (newest run decides — reviewer-corrected)
Walking the append-ordered run history from the end, the first failed run
(any target — failures are appended untagged) or the newest run tagged with
the queried date decides:
- `live_firms` + ok + no plausibility violations → `live` / `ok`
- `override` + ok → `historical` / `ok`
- ok but plausibility violations → `historical` / `plausibility_warning`
- failed run (newest overall) → `offline` / `failed` (last-known data; NEVER live)
- no run record for the date → `historical` / `no_run_record` (NEVER live)
- `demo` is never fabricated by the backend.

Current real state: the newest history run is `2026-09-09` `live_firms`, ok,
clean → the newest date is accurately labeled `live`; older parquet dates
(2026-09-02…) have no run record → `historical`/`no_run_record`. Note: the
run history file changed DURING this task (a live backend process appends to
it); the service reads it fresh on every call, which is the correct behavior.

### Feature-store additions
- `available_dates()`: distinct sorted `acq_date`s.
- `rows_for_date(acq_date)`: all H3-day rows + static join, ordered by
  `h3_08`, strict `?` parameter binding. `state` is NOT a DuckDB column —
  the archive service attaches `state`/`state_assignment_method` via the
  existing `get_state()` provenance side-map BEFORE inference so the
  geography gate (`_geography`) works.

## Verification
- Baseline before edits: `pytest tests/` (excluding draft archive tests) →
  **75 passed** (protected baseline intact).
- Targeted: `pytest tests/test_archive.py` → **26 passed**.
- Full suite after edits: `pytest tests/` → **101 passed** (75 baseline +
  26 new), 1 deselected. No regressions; DuckDB/audit test isolation intact
  (conftest temp paths untouched).
- `git diff --check` → clean.
- Real-history provenance sanity check: 2026-09-09 → `live`/`ok` (accurate,
  newest run is live_firms+clean); 2026-09-02/08 → `historical`/`no_run_record`.
- Nationwide checks covered by tests: archive queries return multi-state
  (India-bounds) data; `state`/`geography` fields present on archived
  predictions; `"Outside India"` never appears; India filtering / outside-India
  rejection / FIRMS metadata code paths were NOT modified.

## Browser/UI verification
not available — backend-only task; no browser was used. Frontend smoke is
Agent 2's scope.

## Known limitations
- **Raw FIRMS point-level observations are NOT archived.** Only H3 daily
  aggregated feature rows exist in the store, so the archive serves model
  predictions per H3 cell/day. Per-detection drill-down is out of scope; the
  UI must present this as an **H3 daily prediction archive**, and FIRMS
  provenance does not prove any observation is definitely an industrial fire,
  gas flare, or wildfire.
- FIRMS-derived confidence thresholds: review thresholds stay in the model
  bundle only; archive responses expose `needs_review` but no legend/threshold
  coupling.
- Summary runs model inference per day (up to 31 days/request) — fine at
  hackathon volume (~92–3.3k rows/day); revisit if the archive grows large.
- `feature_store.py`'s commit necessarily includes pre-existing uncommitted
  hunks (`_state_by_cell` side-map + `get_state`) that the archive depends on;
  they were left intact, only unwritten before this task. All other modified
  files (main.py, config.py, model_service.py, health.py, frontend/*,
  ingestion/*) were NOT committed.
- The ingestion run history is mutated by a concurrently running backend;
  provenance is point-in-time honest per request.

## Next agent
Agent 2 (frontend) must:
1. Call `GET /api/v1/archive/dates` first; populate the date picker from
   `available_dates`, defaulting to `newest_date`. Never invent dates.
2. Read `data_mode` + `ingestion_status` from every archive response and show
   them in the DataReliabilityBlock / banner (live / historical / offline;
   failed and plausibility_warning must be visible, never silently dropped).
3. Use `GET /api/v1/archive/predictions` with `acq_date` + filters
   (`class_name`, `state`, `needs_review`, `min/max_confidence`) and paginate
   with `limit`/`offset` honoring `total`; pages are stable, offset-based.
4. Treat every row as a *prediction* — do not render an "alert lifecycle"
   (acknowledged/resolved etc.) that the backend does not provide.
5. 404 with `error: "archive_date_not_available"` must render an explicit
   "no data for this date" state, not a retry loop or mock data.
6. Reuse `api.js` classes/colors; do not add a 5th class; keep the
   `unclassified` legend entry only when it actually appears in a batch.
7. Smoke the frontend against `uvicorn app.main:app` with these three
   endpoints; do not call historical data "live" in the UI.

## Completion status
- COMPLETE
