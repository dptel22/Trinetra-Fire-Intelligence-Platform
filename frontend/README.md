# Trinetra Frontend — SIH 2026 PS26162

React 19 + Vite dashboard for the Trinetra Fire Intelligence Platform: an
interactive India fire map with per-class detection layers, analyst review
workflow, historical archive, and model-honesty UI (confidence caveats,
provenance pills, visible mock-data banner).

## Stack

- **React 19** + **Vite** (JavaScript/JSX, linted with **oxlint**)
- **MapLibre GL** via `react-map-gl/maplibre`
- **deck.gl** layers (`H3HexagonLayer`, icon layers) via `@deck.gl/mapbox` `MapboxOverlay`
- **PMTiles** protocol for the self-hosted OpenMapTiles vector basemap
- **h3-js** v4.5.0 (H3 resolution 8 cell-days)

## Run

```powershell
npm ci
npm run dev        # Vite dev server on :5173 (backend expected on :8000)
npm run lint       # oxlint
npm run build      # production build
npm run preview    # serve the production build
```

The backend base URL is read from `VITE_API_URL` (default
`http://localhost:8000`; the SPA appends `/api/v1/...` itself — see the root
`.env.example`). The optional local vector basemap is enabled with
`VITE_PMTILES_URL=/tiles/india.pmtiles` after building the archive per
[`../docs/PMTILES_BUILD.md`](../docs/PMTILES_BUILD.md).

There is no frontend test script — `lint` and `build` are the verification
hooks (both also run in GitHub Actions).

## Application pages

`/home` · `/fire-map` (main map + hex inspector + filters + legend) ·
`/fire-alerts` (analyst review) · `/archive` (historical browsing) ·
`/announcements` · `/tutorial`

## Structure

- `src/components/` — page and map components (`FireMapPage.jsx` is the map
  engine; `HexInspectorPanel`, `ClassificationFilters`, `Legend`,
  `OfflineBanner`, `DataReliabilityBlock` are the honesty-UI pieces)
- `src/services/api.js` — the full backend contract (2500-cap 2×2 bbox
  tiling, mock/live mode switching, caveat text rendered verbatim)
- `src/services/basemapStyles.js` — the four basemaps (see
  [`../docs/PMTILES_BUILD.md`](../docs/PMTILES_BUILD.md) for which basemaps
  need local vs remote tiles)
