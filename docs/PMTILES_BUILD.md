# PMTiles Basemap Build (Agent A — F1)

How to regenerate the offline India basemap served to the frontend.

> Note (2026-09-10): this build is **optional**. The repo ships NASA Blue
> Marble raster tiles (`frontend/public/tiles/bluemarble/`) that work offline
> today; the PMTiles archive produced by this guide enables the fully offline
> Streets and Topographic vector styles. No `.pmtiles` archive is currently
> present — the app uses disclosed public raster fallbacks until this guide is
> run. See
> [`docs/CURRENT_PROJECT_TRUTH.md`](CURRENT_PROJECT_TRUTH.md) §15.

## Why

The basemap styles in `frontend/src/services/basemapStyles.js` expect an
**OpenMapTiles-schema** vector tile archive with source-layers `landcover`,
`water`, and `boundary` (filtered on `admin_level` 2 and 4). The tileset below is
built with Planetiler's OpenMapTiles profile, so those layer names match
unchanged — **the style JSON is not regenerated; the tileset is built to fit it.**
(These styles previously lived in `FireMapPage.jsx` as
`buildPMTilesStyle()`; they have since moved to `basemapStyles.js`.)

The output is served as a single self-hosted PMTiles archive from
`frontend/public/tiles/`, so the map renders with **zero network requests
outside localhost** (demo-day requirement: works with wifi disabled).

## Inputs

- OSM extract: `data/raw/india-260907.osm.pbf` (~1.7 GB, India-only —
  confirmed; no `--bounds` clip needed). If you get a fresh extract, any
  India-only Geofabrik-style `.osm.pbf` works.
- Java 21+ (`java -version` to check).

## Build

1. Download the pinned Planetiler jar — the release used for the current
   archive is recorded in `AGENT_LOG.md` (v0.10.2 at time of writing); check
   https://github.com/onthegomap/planetiler/releases for the tag you use:

   ```bash
   wget https://github.com/onthegomap/planetiler/releases/download/<TAG>/planetiler.jar
   ```

   The release `planetiler.jar` ships the **OpenMapTiles profile** as its
   default (verified: the run banner shows `Building OpenMapTilesProfile`),
   emitting the `landcover` / `water` / `boundary` source-layers the style
   consumes — no separate profile jar needed.

2. Generate the archive. **Run from inside `frontend/public/tiles/` and use a
   bare relative `--output` name** — on Windows an absolute `C:\...` path is
   misparsed by Planetiler's URI-based archive config
   (`Unsupported scheme C`). `--download` fetches the three auxiliary
   datasets the OpenMapTiles profile needs (~1.4 GB: lake centerlines, water
   polygons, Natural Earth) into a `data/` working dir next to the output —
   **delete that `data/` dir after the build** so it is never served or
   committed (it is gitignored):

   ```bash
   cd frontend/public/tiles
   java -Xmx6g -jar <path-to>/planetiler.jar \
     --download \
     --osm-path=<abs-path-to>/data/raw/india-260907.osm.pbf \
     --output=india.pmtiles \
     --force
   cd .. && rm -rf tiles/data
   ```

   Needs roughly 0.5× PBF size in RAM and ~10 GB free disk for the aux
   downloads + temp feature db (observed peak temp ~7 GB for the India
   extract).

3. Sanity-check the archive contains the layers the style needs (any
   OMT-schema tile inspector, or load the map and confirm land/water/
   boundaries render).

## Serving

- `frontend/public/tiles/*.pmtiles` is **gitignored** — never commit the
  binary. Regenerate locally with the command above.
- `frontend/.env` (also gitignored) sets `VITE_PMTILES_URL=/tiles/india.pmtiles`;
  Vite serves `frontend/public/` at the root, in both `npm run dev` and
  `npm run build && npm run preview`.
- With the env var unset, the map falls back to the flat dark background
  (`MAP_STYLE_FALLBACK`) — that is the intended signal that the tileset is
  missing, not a bug.
