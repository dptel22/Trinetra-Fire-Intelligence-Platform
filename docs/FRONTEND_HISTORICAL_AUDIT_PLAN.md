# Frontend + Historical Features Audit Plan

Status: current-state audit from Graphify code graph plus direct source/test checks on 2026-09-16.

Scope:
- Frontend design/code smells around `frontend/src/components/*` and `frontend/src/services/api.js`.
- H3 cell thermal history: "for each H3, show previous thermal records/classes/history when records exist".
- Persistent source vs new anomaly source classification.
- Verification gaps that block a trustworthy "finished" claim.

## Executive Summary

The remembered features are present, but not fully finished as a product-quality flow.

- H3 timeline backend exists: `GET /api/v1/cells/{h3_index}/timeline` routes through `TimelineService` and serves daily/monthly/yearly FIRMS thermal history when materialized layers exist.
- H3 timeline frontend exists: `HexInspectorPanel.jsx` fetches the timeline and renders recent/five-year thermal history.
- Persistent/anomaly source classification exists: `thermal_regime.py` derives `persistent`, `new_anomaly`, or `intermittent`, and the frontend renders badges in map inspector and alerts.
- Verification is not green in this checkout: frontend tooling is not installed, and timeline endpoint tests fail before assertions because the serving parquet is absent.
- The frontend is hard to maintain: `FireAlertsPage.jsx` is 1,766 lines, `api.js` is 1,265 lines, and much of the UI is inline style logic instead of reusable CSS/components.

## Graphify Evidence

Graphify code graph:

- `graphify-out/graph.json`: 1,153 nodes, 2,380 edges, 61 communities.
- God nodes: `run_ingestion()`, `CatBoostModelService`, `react`, `_get()`, `FeatureStoreService`, `build_materialized_layers()`, `build_daily_frame()`, `annotate_transitions()`, `AuditTrailService`, `TimelineService`.
- Query focus nodes for this audit: `FireMapPage()`, `FireAlertsPage()`, `ArchivePage()`, `api.js`, `TimelineService`, `thermal_regime.py`, `fetchCellTimeline()`, `fetchPredictions()`, `fetchPredictionsStrict()`.

Graphify was code-only. It did not semantically extract docs, papers, or images.

## Verified Current State

### H3 Thermal History

Present:

- API route exists at `app/api/endpoints/timeline.py:18`.
- Service exists at `app/services/timeline_service.py:49`.
- Schema exposes materialization status and fallback metadata at `app/schemas/timeline.py:32`.
- Frontend service fetches cell timeline at `frontend/src/services/api.js:1056`.
- Inspector fetches timeline on selected cell change at `frontend/src/components/HexInspectorPanel.jsx:48`.
- Inspector renders daily/monthly/yearly controls and timeline rows at `frontend/src/components/HexInspectorPanel.jsx:307` and `frontend/src/components/HexInspectorPanel.jsx:371`.

Not finished / risk:

- Timeline endpoint tests currently error during app startup because `data/processed/sih2026_h3_daily_features_firms.parquet` is missing. This means endpoint behavior was not verified in the current checkout.
- The UI displays thermal history counts and transition labels, but not previous model class snapshots per H3. The backend timeline schema is FIRMS thermal evidence, not a historical prediction/class-history API.
- `HexInspectorPanel.jsx` computes the five-year label using raw date subtraction in the component at `frontend/src/components/HexInspectorPanel.jsx:302`, which should be a backend/context field or a helper.
- The timeline service fail-closed behavior is good, but the local setup needs a clear data/bootstrap path before frontend validation can be real.

### Persistent Source vs New Anomaly

Present:

- `app/services/thermal_regime.py:47` derives regime from `active_days_7d`, `active_days_30d`, and `active_days_90d`.
- `app/schemas/prediction.py:49` exposes `thermal_regime` and `thermal_regime_basis`.
- `app/services/model_service.py:392` and `app/services/model_service.py:657` attach regime to single and batch predictions.
- Frontend constants exist at `frontend/src/services/api.js:30`.
- Alerts page renders regime badges and filters at `frontend/src/components/FireAlertsPage.jsx:422` and `frontend/src/components/FireAlertsPage.jsx:1533`.
- Hex inspector renders thermal regime at `frontend/src/components/HexInspectorPanel.jsx:243`.

Not finished / risk:

- This is a mechanical trailing-activity label, not a model confidence. That is acceptable, but UI must keep saying it.
- The terminology is split: explain output uses `persistent_source` / `new_event`, prediction output uses `persistent` / `new_anomaly` / `intermittent`. This creates translation friction in the inspector.
- Regime filters omit `null` records from specific filters and leave them only under "All"; okay, but it needs visible "Unknown regime" treatment for analyst trust.

## Frontend Bugs, Code Smells, and Bad Design List

### P0: Verification Blockers

1. Frontend checks cannot run.
   - Evidence: `npm run lint` fails because `oxlint` is not recognized.
   - Evidence: `npm run build` fails because `vite` is not recognized.
   - Likely cause: `frontend/node_modules` missing or incomplete.
   - Fix: run/install frontend dependencies, then rerun `npm run lint` and `npm run build`. Do not claim frontend health before this.

2. Timeline endpoint tests cannot verify endpoint behavior in this checkout.
   - Evidence: targeted pytest result was `28 passed, 1 skipped, 5 errors`; all 5 errors came from missing `data/processed/sih2026_h3_daily_features_firms.parquet`.
   - Fix: either restore serving data for integration tests or make endpoint tests use an isolated fake store so unit tests do not depend on local ignored parquets.

### P1: Product/UX Bugs

3. H3 "history" does not yet mean previous classifications.
   - Evidence: timeline rows are FIRMS thermal evidence fields (`n_detections`, `fire_days`, transition state), not historical `predicted_class` snapshots.
   - Impact: user expectation "for each H3 if records exist you see classes it was previous" is only partially met.
   - Fix: add a small historical prediction/class endpoint or extend timeline rows with optional archived class summary from existing archive data.

4. Map page and alerts page can diverge on failure behavior.
   - Evidence: `fetchPredictions()` silently switches global mode to mock on live failure at `frontend/src/services/api.js:440`; alerts use `fetchPredictionsStrict()` to avoid this.
   - Impact: map can become demo/mock while operational alerts refuse mock substitution. This is honest but confusing unless the banner/state is unmissable.
   - Fix: keep strict alerts behavior; make map fallback language explicit and route all mode messaging through one helper.

5. Unknown thermal regime has weak UI treatment.
   - Evidence: `FireAlertsPage.jsx:1058` says null regimes only appear under "All".
   - Impact: analysts may not notice records whose source type is unavailable.
   - Fix: show an "Unknown regime" count/filter only when null regimes exist, mirroring the empirical `unclassified` class behavior.

6. Historical land-use context text is confusing.
   - Evidence: inspector says "Cannot check historical land use in this environment" at `frontend/src/components/HexInspectorPanel.jsx:418`.
   - Impact: sounds like a runtime failure rather than a known evidence limitation.
   - Fix: phrase as "Historical OSM/WRI land-use evidence unavailable; showing present-day context only."

### P2: Code Smells

7. `FireAlertsPage.jsx` is too large.
   - Evidence: 1,766 lines.
   - Impact: alert loading, review actions, raw evidence, history drawer, filters, regime badges, and rendering are tangled.
   - Fix: extract only the obvious chunks: `AlertCard`, `AlertFilters`, `ReviewActions`, `RawEvidencePanel`. No new state framework.

8. `api.js` is doing too many jobs.
   - Evidence: 1,265 lines covering taxonomy constants, mock generation, map predictions, archive, alerts, raw evidence, timeline, cell detail, explanation, CSV export.
   - Impact: live/demo behavior and contracts become hard to reason about.
   - Fix: split by API surface after tests are green: `api/predictions.js`, `api/archive.js`, `api/timeline.js`, `api/alerts.js`, keep compatibility exports from `api.js`.

9. Dead Leaflet dependency and CSS remain.
   - Evidence: `frontend/package.json` still includes `leaflet` and `react-leaflet`; `frontend/src/index.css:1` imports Leaflet CSS; source uses MapLibre/deck.gl instead.
   - Impact: dependency bloat and stale styling.
   - Fix: remove Leaflet packages and CSS import once build can verify no imports remain.

10. Inline styles dominate core screens.
    - Evidence: hundreds of `style={{...}}` hits in `FireAlertsPage.jsx`, `ArchivePage.jsx`, and `HexInspectorPanel.jsx`.
    - Impact: poor reuse, hard visual consistency, hard responsive QA.
    - Fix: move only repeated layout/status patterns into CSS classes. Do not rewrite all styles at once.

11. Terminology mismatch: persistence vs regime.
    - Evidence: `thermal_regime` uses `persistent/new_anomaly/intermittent`; explanation persistence uses `persistent_source/new_event/unknown_provenance`.
    - Impact: same analyst concept appears under different vocabularies.
    - Fix: add one display adapter in `api.js` or `HexInspectorPanel.jsx` so wording is consistent while backend contracts remain stable.

12. Date logic is scattered across frontend.
    - Evidence: multiple direct `new Date().toLocaleDateString('en-CA')` and date subtraction calls.
    - Impact: timezone/local-date behavior can drift between pages.
    - Fix: keep one tiny `todayIsoLocal()` helper and one `dateSpanDays()` helper in `api.js` or a date utility.

### P3: Design Debt

13. Alerts page is too visually dense for repeated analyst use.
    - Evidence: card rendering includes confidence, probabilities, caveats, raw evidence, review actions, lifecycle history, filters, status chips, and regime filters in one file.
    - Fix: make the default card compact and reveal raw evidence/history on demand.

14. Archive and Alerts repeat similar card/review/status UI.
    - Evidence: both render `AlertCard` behavior and lifecycle actions.
    - Fix: after extracting `AlertCard`, share it between pages.

15. Timeline visualization is too primitive for the feature's importance.
    - Evidence: history is rendered as thin bars scaled by `n_detections * 4`, capped at 100%.
    - Fix: use a small consistent month/year strip with active days and transition state. No chart library needed.

## Finish Plan

1. Restore verification baseline.
   - Install frontend dependencies or restore `node_modules`.
   - Restore serving parquet or isolate timeline endpoint tests from ignored data.
   - Required proof: `npm run lint`, `npm run build`, and targeted timeline/regime pytest all run to completion.

2. Close the H3 class-history gap.
   - Decide source of truth: archive predictions by `h3_index`, or timeline rows enriched with class rollups.
   - Minimal backend shape: per period, include `{top_class, class_counts, avg_confidence, needs_review_count}` when archived predictions exist.
   - Frontend: in `HexInspectorPanel`, show "Previous classifications" under thermal history only when class history exists.

3. Tighten persistent/anomaly UX.
   - Add Unknown regime count/filter when present.
   - Normalize labels between `thermal_regime` and explanation persistence.
   - Keep basis text visible so the badge is auditable.

4. Shrink frontend safely.
   - Extract `AlertCard`, then `ReviewActions`, then raw evidence/history panels.
   - Split `api.js` only after tests are green.
   - Remove Leaflet dead weight last, after a clean build.

5. Visual QA.
   - Run the app.
   - Check Fire Map inspector with a known cell that has timeline rows.
   - Check Alerts page filters for class and regime.
   - Check Archive page historical/day switching.

## Verification Log From This Audit

- `graphify query "frontend bad design code smells FireMapPage FireAlertsPage ArchivePage api historical timeline thermal_regime persistent anomaly" --budget 3500`: confirmed graph focus nodes.
- `npm run lint` in `frontend`: failed, `oxlint` not recognized.
- `npm run build` in `frontend`: failed, `vite` not recognized.
- `python -m pytest tests/test_thermal_regime.py tests/test_timeline_service.py tests/test_timeline_endpoint.py tests/test_transition_detection.py tests/test_timeline_materializer.py tests/test_timeline_features.py --basetemp=.audit_pytest_tmp -q`: `28 passed, 1 skipped, 5 errors`; all errors came from missing serving parquet during app startup.

