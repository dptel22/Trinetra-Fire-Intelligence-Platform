# Prompt for Agent B — Data Layer & Model-Honesty UI (Audit / Gap-Fill)

> **STATUS: HISTORICAL TASK BRIEF (completed).** The api.js contract audit and
> honesty-UI components this brief commissioned exist and shipped. Retained as
> a record of the work split.

Work only inside the `frontend-agent-b` worktree, on branch `agent-b/data-layer`.
Read `AGENT_LOG.md` before starting and before every commit; append an entry
after every meaningful change.

> **Important correction to the original task doc:** the components and api.js
> contract described below **already exist** on this branch and were verified to
> match the interface contract. Your job is to **audit them against this
> checklist, fix gaps and bugs, and prove correctness** — not to build from
> scratch. Do not rewrite working code gratuitously.

SCOPE — you own and may edit ONLY:
- `frontend/src/services/api.js`
- `frontend/src/components/DataReliabilityBlock.jsx`
- `frontend/src/components/ClassificationFilters.jsx`
- `frontend/src/components/HexInspectorPanel.jsx`
- `frontend/src/components/OfflineBanner.jsx`
- `frontend/src/components/Legend.jsx`

Do NOT touch `frontend/src/components/FireMapPage.jsx` or any map/deck.gl/
MapLibre code — Agent A owns that in a separate worktree. Do NOT touch
`QuickSearchModal.jsx` or `FireAlertsPage.jsx` (unowned) — but note they import
`FIRE_COLORS`, `FIRE_LABELS`, `FIRE_CAVEATS` from `api.js`; those aliases must
never be removed. Build/test your changes using the mock data layer in api.js
(`forceMockMode(true)`); you do not need the real map to exist.

GOAL: Make sure the frontend consumes the backend's real fields instead of
hardcoded values, and that data-honesty is visible in the UI (mock-mode banner,
per-class caveats, no invented numbers).

AUDIT CHECKLIST (verify each; fix gaps; log what you changed and why):

1. `fetchPredictions(bbox, acqDate, zoom)` hits `GET /api/v1/predictions` with
   the exact query params; 2500-row cap handled by tiling + dedupe by `cell_id`,
   with a code comment marking it a stopgap (the real fix is a backend
   coarser-resolution aggregation endpoint, out of scope).
2. Fetch failure falls back to locally-generated mock predictions (shape
   identical to `PredictionResponse`) and flips `getApiMode()` to `'mock'`;
   flips back to `'live'` the moment a real fetch succeeds, surfaced via
   `onApiModeChange`. Mock data includes an `unclassified` cell for demo/dev.
3. `fetchHealth`, `fetchCellDetail`, `fetchExplanation` match the confirmed
   route/param shapes. `fetchCellDetail` throws a clear error in mock mode
   (no mock equivalent for detail endpoints).
4. `parseCaveatFlag(str)` splits on `" | "` and trims; every caveat render uses
   it to produce separate chips, never one blob string.
5. `confidenceLabel(prediction)`: `'Uncertain'` for `unclassified`,
   `'Needs review'` if `needs_review`, else `'High confidence'`. The qualitative
   label is the PRIMARY cue everywhere; raw decimal confidence is supporting
   detail only (e.g. expandable section of HexInspectorPanel).
6. HexInspectorPanel: predicted class + color swatch, confidenceLabel badge,
   caveat chips, full `probabilities[]` as a small horizontal bar list (one bar
   per class, colored via `CLASS_COLORS`, sorted descending), and an expandable
   "why this label?" section calling `onRequestExplanation` and rendering
   `feature_attributions` (max 3; each has `feature_name`, `feature_value`,
   `contribution`, human-readable `description` — render the description).
7. DataReliabilityBlock: no hardcoded invented figures (e.g. "74% ± 8%").
   Shows `review_thresholds` per class with plain-language framing ("reviewed
   below X% confidence"), and `agricultural_burn`/`mining` always paired with
   their known caveat text rather than a bare number. No backend-reported
   accuracy/F1 number available for a class → say so, don't invent one.
8. ClassificationFilters renders whatever `availableClasses` the parent passes
   (never a hardcoded class list) so `unclassified` only appears when actually
   present in the current data.
9. OfflineBanner: "Showing demo data — live backend unreachable" when
   `mode === 'mock'`, renders nothing when `'live'`, doesn't block interaction.

VERIFICATION:
- `npm run lint` (no test script exists).
- Manually confirm with your own harness / `forceMockMode(true|false)`:
  caveat_flag splits into multiple chips on `" | "`; `agricultural_burn` always
  shows "Needs review", never a bare confidence number as the primary cue;
  DataReliabilityBlock shows no fabricated numbers; OfflineBanner appears/
  disappears on mock-mode toggles.
- Append a final `AGENT_LOG.md` entry listing every file changed, every exported
  function/component signature you altered (that's what Agent A imports
  against), and any open questions you couldn't verify from the schema alone.
