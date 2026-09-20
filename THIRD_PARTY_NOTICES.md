# Third-Party Notices and Data Attributions

This project (Trinetra Fire Intelligence Platform, SIH 2026 PS26162) is MIT
licensed — see [`LICENSE`](LICENSE) — but it builds on third-party data,
tiles, fonts, and libraries that keep their own licenses and attribution
requirements. This file lists what we use, from where, and the attribution we
render. When a source's terms are "see linked terms", that link is
authoritative — this file summarizes, it does not restate legal terms.

## Data sources

| Source | Used for | Where it enters the system | Terms / attribution |
|---|---|---|---|
| **NASA FIRMS** (VIIRS 375 m, SNPP + NOAA-20) | The fire/thermal-anomaly observations being classified | `ingestion/` pulls from the FIRMS API; archive CSVs | NASA/LANCE/EOSDIS data use policy — https://firms.modaps.eosdis.nasa.gov/ (freely available; cite NASA FIRMS) |
| **WRI Global Power Plant Database v1.3.0** | Power-plant proximity features | `data/raw/globalpowerplantdatabasev130/` (local input), joined in `ingestion/` | CC-BY 4.0 — World Resources Institute, https://datasets.wri.org/dataset/globalpowerplantdatabase |
| **OpenStreetMap** (via Geofabrik India extract) | Land-use/land-cover context features and the vector basemap | `data/raw/india-*.osm.pbf` (local input); basemap tiles | © OpenStreetMap contributors, ODbL — https://www.openstreetmap.org/copyright — attribution is rendered in every basemap style (`© OpenMapTiles © OpenStreetMap contributors`) |
| **State boundary shapefile** | State/UT assignment of cells | `ingestion/osm_wri_load.py` (pinned source URL + commit, SHA256-verified per file — see that module's header constants) | Pinned upstream; verify at the URL recorded in `ingestion/osm_wri_load.py` |

## Map tiles, terrain, and fonts (frontend)

| Asset | Source | Terms / attribution |
|---|---|---|
| **Blue Marble** raster basemap (zoom ≤ 8) | NASA GIBS WMTS (`BlueMarble_ShadedRelief_Bathymetry`), loaded remotely — see `frontend/src/services/basemapStyles.js` | NASA open data; rendered attribution: "NASA Visible Earth · Blue Marble Next Generation (Shaded Relief & Bathymetry)" |
| **Esri World Imagery / Street Map / Topo / Boundaries & Places** (raster fallbacks and satellite basemap) | ArcGIS Online tile services, loaded remotely | Esri Master Agreement terms — attribution rendered per Esri guidance ("Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community") |
| **Mapzen / AWS Terrain terrarium DEM** (hillshade relief in the topographic style) | `s3.amazonaws.com/elevation-tiles-prod` (AWS Open Data), loaded remotely | Public per the AWS Terrain Tiles dataset terms; attribution: "Mapzen" |
| **OpenMapTiles-schema vector tiles** (the local PMTiles archive, if built) | Generated locally from OSM data with **Planetiler** (build tool only; Planetiler itself is not redistributed by this repo) | Rendered attribution: `© OpenMapTiles © OpenStreetMap contributors`; build guide: `docs/PMTILES_BUILD.md` |
| **Noto Sans** glyph pages (self-hosted MapLibre glyphs in `frontend/public/fonts/glyphs/`) | Self-hosted extracts of Google Noto Sans | SIL Open Font License 1.1 |
| **Inter** (UI font in `frontend/src/index.css`) | Bundled with the web stack | SIL Open Font License 1.1 |

## Software libraries

Backend and frontend dependencies are declared in `pyproject.toml`,
`requirements.txt`, and `frontend/package.json`; each keeps its own license.
Principal ones:

- **CatBoost** (Apache-2.0), **DuckDB** (MIT), **FastAPI** (MIT),
  **SHAP** (MIT), **scikit-learn** (BSD-3), **H3** / h3-js (Apache-2.0),
  **Pydantic** (MIT), **uvicorn** (BSD-3)
- **MapLibre GL JS** (BSD-3-Clause), **deck.gl** (MIT),
  **react-map-gl** (MIT), **pmtiles** (BSD-3-Clause),
  **React** (MIT), **Recharts** (MIT), **react-router-dom** (MIT),
  **lucide-react** (ISC)

## Redistribution notes

- The **served model bundle** is tracked in git as the deployed contract; the
  larger model-derived outputs are distributed via GitHub Releases. The
  model is trained on FIRMS/OSM/WRI-derived features — the derived feature
  tables inherit the upstream data terms above.
- The **PMTiles vector basemap** (when distributed, e.g. as a Release asset)
  is derived from OpenStreetMap data and must carry the
  `© OpenStreetMap contributors` attribution — it is embedded in the map
  styles that consume it.
- NASA imagery/data attribution is embedded in the rendered map styles; do
  not strip source attributions from any redistribution.
