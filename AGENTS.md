# PS26162 Fire Map — Shared Agent Context (Frontend Split)

**Project:** SIH 2026, PS26162, client NTRO — detects and classifies
industrial fires / thermal hotspots across India from NASA FIRMS VIIRS fire
data fused with OSM and WRI power-plant data. Frontend scope only — do not
touch backend code.

## Repo reality (read this before trusting any older task doc)

- `FireMapPage.jsx` lives at **`frontend/src/components/FireMapPage.jsx`** — there
  is no `frontend/src/pages/` directory and no `FireMapPage.css` yet.
- `frontend/src/services/api.js` **already implements the full interface
  contract** (`CLASS_COLORS`, `CLASS_LABELS`, `INDIA_CENTER`, `INDIA_BOUNDS`,
  `fetchPredictions` with 2500-cap 2×2 tiling, `fetchHealth`, `fetchCellDetail`,
  `fetchExplanation`, `getApiMode`, `setApiMode`, `forceMockMode`,
  `onApiModeChange`, `parseCaveatFlag`, `confidenceLabel`, `getH3Boundary`).
- All five Agent-B components already exist and match the contract:
  `ClassificationFilters.jsx`, `HexInspectorPanel.jsx`, `Legend.jsx`,
  `OfflineBanner.jsx`, `DataReliabilityBlock.jsx`.
- `FireMapPage.jsx` is **MapLibre GL via `react-map-gl/maplibre` + deck.gl
  (`MapboxOverlay`) + PMTiles protocol** — Agent A's rebuild is **complete**
  (verified 2026-09-10). `react-leaflet`/`leaflet` remain in `package.json`
  with zero imports (dead weight; safe to drop in a dependency cleanup, but
  do not "migrate back").
- Frontend has **no test script** — only `npm run lint` (oxlint), `dev`, `build`,
  `preview`.
- `QuickSearchModal.jsx` and `FireAlertsPage.jsx` are owned by **neither** agent
  but import `FIRE_COLORS`, `FIRE_LABELS`, `FIRE_CAVEATS` from `api.js` — those
  aliases must never be removed.

## Locked taxonomy and colors (do not invent a 5th trained class)

| Class | Color |
|---|---|
| `industrial` | `#E67E22` |
| `mining` | `#95A5A6` |
| `agricultural_burn` | `#F1C40F` |
| `wildfire` | `#E74C3C` |
| `unclassified` (fallback, not a trained class) | `#787878` |

## Confirmed live backend contract

- Canonical routes under `/api/v1` (prefix confirmed in `app/core/config.py`):
  `GET /predictions`, `GET /predictions/{cell_id}`,
  `GET /predictions/{cell_id}/explain`; `GET /health`.
- `GET /predictions?min_lat&max_lat&min_lon&max_lon&acq_date&zoom` — `zoom`
  optional (default 8, range 1–20). **One `acq_date` per request**, no date range.
  Response: `ViewportPredictionsResponse { mode, zoom, total_predictions,
  predictions: PredictionResponse[] }`.
- **Hard cap: `LIMIT 2500` server-side, no offset/cursor param.** Large bboxes
  must be tiled client-side (already implemented in `api.js`).
- `PredictionResponse`: `cell_id, latitude, longitude, h3_index, predicted_class,
  probabilities: [{class_name, probability}], confidence (0–1), calibrated,
  needs_review (bool), caveat_flag (string|null, multiple joined with " | "),
  latency_ms`.
- Review thresholds: `wildfire 0.7, industrial 0.7, mining 0.85,
  agricultural_burn 1.01` → **`agricultural_burn` is always `needs_review=true`**
  (mechanical, not a bug).
- **`unclassified` visibility is empirical:** only show the `unclassified`
  legend/filter entry if the current prediction batch actually contains
  `predicted_class === "unclassified"`. Do not rely on any health-endpoint flag
  (`target_classes` is a fixed list, not an abstention indicator). Never hardcode
  a confidence cutoff client-side.
- H3 resolution fixed at **8**.
- Verbatim caveat texts (as stored in `api.js` `KNOWN_CAVEATS`): mining —
  `"Mining has lower labeled support and should be read cautiously."`;
  review — `"Calibrated confidence is below the per-class review threshold;
  treat as provisional."`

## Decisions already made — don't relitigate

- Stack: React + **MapLibre GL via `react-map-gl/maplibre`** (not Leaflet) +
  deck.gl `H3HexagonLayer` (`@deck.gl/geo-layers`) as a `MapboxOverlay`
  (`@deck.gl/mapbox`) + self-hosted **PMTiles** base tiles + `h3-js` v4.5.0.
- Never show a fabricated or unverifiable numeric confidence figure — always
  render the backend's actual `caveat_flag` text.
- `agricultural_burn`'s low reliability and `mining`'s thin sample must always be
  visually caveated, never shown as a bare accuracy number.
- Mock/demo data mode must be visibly flagged to the user (OfflineBanner), never
  silent.

## Logging protocol (mandatory)

`AGENT_LOG.md` at repo root is append-only. Read it before starting work and
before every commit; append an entry after every meaningful change (files
touched, what changed, interface impact). If you need to touch a file outside
your ownership list, stop and log a note flagging it instead of editing it.

## File ownership

| Agent A — Map Engine | Agent B — Data Layer & Model-Honesty UI (audit) |
|---|---|
| `frontend/src/components/FireMapPage.jsx` | `frontend/src/services/api.js` |
| `frontend/src/components/FireMapPage.css` (new) | `frontend/src/components/DataReliabilityBlock.jsx` |
| PMTiles build step / docs | `frontend/src/components/ClassificationFilters.jsx` |
| `frontend/src/services/mapLocation.js` (new) | `frontend/src/components/HexInspectorPanel.jsx` |
| `package.json` / lockfile (map deps only) | `frontend/src/components/OfflineBanner.jsx` |
| | `frontend/src/components/Legend.jsx` |

Agent A imports from `api.js` and renders Agent B's components inside
`FireMapPage.jsx`; Agent B never opens `FireMapPage.jsx`. Per-agent task lists:
`docs/archive/internal/AGENT_A_PROMPT.md`, `docs/archive/internal/AGENT_B_PROMPT.md`.

## Worktrees

- Agent A session cwd: `../frontend-agent-a` (branch `agent-a/map-engine`)
- Agent B session cwd: `../frontend-agent-b` (branch `agent-b/data-layer`)
- Each worktree has its own `AGENT_LOG.md` copy (append-only per worktree;
  integrator merges). Each worktree needs its own `npm ci` in `frontend/`.
- Known issue: `origin` remote currently returns "Repository not found" —
  all git sync is local until that is fixed.
