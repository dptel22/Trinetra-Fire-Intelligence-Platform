# Prompt for Agent A — Map Engine

Work only inside the `frontend-agent-a` worktree, on branch
`agent-a/map-engine`. Read `AGENT_LOG.md` before starting and before every
commit; append an entry after every meaningful change.

SCOPE — you own and may edit ONLY:
- `frontend/src/components/FireMapPage.jsx`  (note: components/, not pages/)
- `frontend/src/components/FireMapPage.css`  (new file — styling is currently inline JSX + index.css)
- `frontend/src/services/mapLocation.js` (new file)
- `package.json` / `package-lock.json` (adding map-related deps only)

Do not touch `frontend/src/services/api.js` or any other file under
`frontend/src/components/` — Agent B owns those in a separate worktree. Import
from them, don't edit them. **All contract exports already exist in api.js**
(`fetchPredictions`, `fetchHealth`, `fetchCellDetail`, `fetchExplanation`,
`CLASS_COLORS`, `CLASS_LABELS`, `INDIA_CENTER`, `INDIA_BOUNDS`, `getApiMode`,
`onApiModeChange`, `parseCaveatFlag`, `confidenceLabel`) and all five components
(`ClassificationFilters`, `HexInspectorPanel`, `OfflineBanner`, `Legend`,
`DataReliabilityBlock`) already exist — import them, don't rebuild them. If
something you need is missing, add a note to `AGENT_LOG.md` describing exactly
what you need (name, signature, return shape) rather than writing it yourself.

GOAL: Replace the current React-Leaflet map in FireMapPage.jsx with the locked
stack: React + `react-map-gl/maplibre` for the base map, deck.gl's
`H3HexagonLayer` (from `@deck.gl/geo-layers`) wrapped in a `MapboxOverlay`
(`@deck.gl/mapbox`) via `useControl`, and self-hosted PMTiles for base tiles.
(`h3-js` v4.5.0 is already a dependency; `react-leaflet`/`leaflet` can be left
in package.json for now or removed at your discretion — log which.)

TASKS:
1. Base map: `<Map>` from `react-map-gl/maplibre`, initial view centered on
   India (use `INDIA_CENTER` from api.js), styled with the self-hosted PMTiles
   source. If the PMTiles archive isn't built yet, stub the URL as a config
   constant and flag it in `AGENT_LOG.md` as a demo-day dependency for whoever
   owns PMTiles generation.
2. Overlay layer: `H3HexagonLayer` with data from `fetchPredictions`,
   `getHexagon: d => d.h3_index`, fill color from `CLASS_COLORS` keyed by
   `predicted_class`, `pickable: true`, `onClick` sets a selected-cell state
   passed into `<HexInspectorPanel cell={...}>`.
3. `needs_review` visual treatment: cells with `needs_review === true` get a
   visually distinct style — dashed outline via `PathStyleExtension` from
   `@deck.gl/extensions` (`extensions: [new PathStyleExtension({dash: true})]`,
   `getDashArray: d => d.needs_review ? [3,2] : [0,0]`, `dashJustified: true`).
   Confirm agricultural_burn cells always render dashed — check against real
   data; this isn't optional since that class's review threshold is 1.01.
4. Viewport-driven fetching: on `moveend` (debounced ~400ms), read the map's
   current bounds, convert to the bbox shape `fetchPredictions` expects, and
   refetch. Don't fetch on every intermediate pan frame.
5. `unclassified` visibility: pass the currently-loaded prediction set's
   distinct classes to `<ClassificationFilters availableClasses={...}>` — don't
   hardcode the 4+1 list, and don't rely on any health-endpoint flag (see
   AGENTS.md).
5b. India-only clamping (defensive Layer 2 — the real fix lives at data
   ingestion, backend side; this is cheap insurance that must not be skipped):
   (a) set `maxBounds` on the MapLibre `<Map>` to India's bounding box
   (roughly `[[68, 6], [98, 36]]`) so the map can't be panned outside India;
   (b) filter the `H3HexagonLayer` data prop client-side, dropping any
   prediction whose `latitude`/`longitude` falls outside that same box, so a
   backend regression can never render a stray non-India cell.
6. Navigation: build `frontend/src/services/mapLocation.js` exporting a
   `useMapLocation(mapRef)` hook (or plain functions, your call) that (a) reads
   `lat`/`lon`/`h3`/`name` from URL search params and calls
   `map.flyTo({center, zoom: 9, duration: 1500})`, and (b) listens for a global
   `trinetra:locate` window event carrying `{lat, lon}` and does the same.
   Reference implementation exists inline in the current FireMapPage.jsx
   (`MapLocationController`) — extract/improve it, don't regress it.
7. Sidebar: render `<OfflineBanner>`, `<ClassificationFilters>`,
   `<Legend>`, `<HexInspectorPanel>`, and `<DataReliabilityBlock>` (all from
   Agent B) in the sidebar — you compose them, you don't rewrite them.
   Subscribe to `onApiModeChange` to drive `<OfflineBanner>`. Preserve existing
   sidebar features (timeframe/date picker, detection count, Quick Search and
   flyTo integrations from the latest commit) unless Agent B's props make the
   old inline versions redundant — log anything you remove.

VERIFICATION:
- `npm run lint` (no test script exists).
- Manually confirm: map renders centered on India, hexes render with correct
  colors, an agricultural_burn cell shows the dashed/distinct treatment,
  clicking a hex populates the inspector panel, panning triggers a (debounced)
  refetch, flyTo works from a test URL like `?lat=21.14&lon=79.08&name=Nagpur`.
- Append a final `AGENT_LOG.md` entry listing every file changed and a one-line
  summary per file, plus any interface requests you made of Agent B that
  weren't already available.
