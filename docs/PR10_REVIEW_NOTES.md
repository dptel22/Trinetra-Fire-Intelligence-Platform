# PR #10 — Merge Review Notes & Run Requirements

> **STATUS: HISTORICAL (noted 2026-09-11).** Review-tracking snapshot from
> 2026-09-09. Some open items were fixed later (e.g., the FireAlertsPage date
> sync bug, the unused `fetchArchiveRuns` import — see `AGENT_LOG.md`
> 2026-09-10/11 entries and `docs/WHOLE_SYSTEM_AUDIT.md`). Do not treat the
> open-bug list below as current; verify against the current checkout.

> Captured 2026-09-09. This records the reviewer findings that shipped with (or were
> surfaced by) the PR #10 merge, and the artifacts **not in git** that a fresh machine
> must download/generate before the stack runs.

## 1. Artifacts you must DOWNLOAD / generate to run (not in git)

These are intentionally gitignored (large binaries / secrets / regenerable data). A
fresh laptop that only does `git pull` will **not** have them:

| Needed for | Artifact | Where it comes from |
|---|---|---|
| Model inference | `models/PS26162_catboost_final/inference_bundle/*` (.cbm, calibrators.joblib, schema, thresholds) | ✅ **tracked in git** — clones already have it. Nothing to download. |
| Backend serving (OSM/WRI + FIRMS features) | `data/processed/sih2026_h3_daily_features_firms.parquet` and `sih2026_h3_daily_features_with_osm_wri.parquet` | ❌ **NOT tracked.** Run `ingestion/` (FIRMS pull, needs `FIRMS_MAP_KEY`) to generate, or copy from a machine that has them. Without these the store is seeded but empty of serving rows → empty predictions. |
| Offline basemap | `frontend/public/tiles/*.pmtiles` (e.g. `india.pmtiles`) | ❌ **NOT tracked.** Build per `docs/PMTILES_BUILD.md`; until then the map falls back to a dark background with hexagons (no basemap). |
| Secrets | `.env` (`FIRMS_MAP_KEY`, etc.) | ❌ **NOT tracked.** `copy .env.example .env` and fill it in. |
| Python deps | `pip install -r requirements.txt` | ✅ pip will fetch from PyPI. |
| Frontend deps | `npm ci` in `frontend/` | ✅ npm will fetch from registry. |

**So the on-board steps are:** `git clone` → `pip install -r requirements.txt` →
`copy .env.example .env` (add FIRMS key) → generate/copy the two parquets →
`frontend/` `npm ci` → (optional) build PMTiles basemap → `uvicorn app.main:app` +
`npm run dev`.

## 2. Bugs / follow-ups from the PR #10 review (not yet fixed)

These were flagged in the PR #10 review and remain open:

1. **FireAlertsPage.jsx date sync (HIGH).** `FireMapPage.jsx` snaps to
   `latest_acq_date` via `fetchLatestAcqDate()`/`fetchHealth()`; `FireAlertsPage.jsx`
   still hardcodes `new Date().toLocaleDateString('en-CA')`. If the store only has
   historical ingested days, FireAlertsPage returns an empty 200 array. **Fix:** call
   `fetchLatestAcqDate()` on mount in `FireAlertsPage` too.
2. **Client-side tiling cancellation (MED).** `fetchPredictionsWithTiling` can fire up
   to 16 concurrent requests on wide bboxes hitting the 2500 cap. **Fix:** use
   `AbortController` to cancel during rapid pan/zoom.
3. **Route code-splitting (MED).** Production `vite build` is ~2.25 MB in one vendor
   chunk. **Fix:** `React.lazy()` for `FireMapPage` and `FireAlertsPage`.
4. **a11y — drawer nav (LOW).** `Header.jsx` uses `<div onClick>` for nav items.
   **Fix:** semantic `<button>` / `role="button"` + `tabIndex` + keyboard handlers.
5. **Batch inference (MED, backend).** `POST /classify/batch` not present; sequential
   `predict_single()` is 5–10× slower than a vectorized single-DataFrame `predict()`.
6. **Audit thread-safety (LOW).** `AuditTrailService` writes without a lock; add
   `threading.Lock()` for concurrent multi-analyst override requests.
7. **Cold-boot store (note).** `feature_store._seed_tables()` expects the two parquets in
   `data/processed/`; in fresh/Docker environments without pipeline artifacts the store
   must fall back to mock or a documented seed step (related to §1).

_This file is a tracking note for the above — the fixes themselves are separate PRs._