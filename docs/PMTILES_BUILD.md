# PMTiles Basemap Build

How to regenerate the offline India basemap served to the frontend.

> Note (2026-09-19, basemap table updated 2026-09-20): the archive **was
> built** with this guide (Planetiler v0.10.2, Geofabrik
> `india-latest.osm.pbf`). `frontend/public/tiles/india.pmtiles` is
> local-only (gitignored) — reproduce it here or on a new machine by
> following the steps below, or download it from the
> `basemap-pmtiles-YYYY-MM-DD` GitHub Release when published (see
> [`docs/RELEASES.md`](RELEASES.md)).

## Which basemap uses which assets

`frontend/src/services/basemapStyles.js` ships four switchable basemaps.
Only the two vector ones are offline-capable:

| Basemap | Tiles | Offline? |
|---|---|---|
| **Blue Marble** | NASA GIBS WMTS raster, remote (`gibs.earthdata.nasa.gov`), physically capped at zoom 8 | No — needs internet |
| **Satellite HD** | Esri World Imagery raster, remote, zoom 19 | No — needs internet |
| **Streets** | OpenMapTiles-schema **PMTiles archive** (local, self-hosted) | **Yes**, when the archive is present |
| **Topographic** | Same PMTiles archive + Mapzen/AWS terrarium hillshade (remote) | Partial — relief tiles are remote |
| Fallbacks (no archive) | Streets/Topo fall back to Esri raster tiles; Blue Marble overlay labels fall back to Esri reference tiles | No |

The archive therefore enables the fully offline **Streets** style and the
Blue Marble boundary/label overlay; no basemap mode ships all its raster
tiles in-repo. Third-party attribution for every remote source is rendered
in-map and listed in [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

## Why

The basemap styles in `frontend/src/services/basemapStyles.js` expect an
**OpenMapTiles-schema** vector tile archive with source-layers `landcover`,
`water`, and `boundary` (filtered on `admin_level` 2 and 4) — plus
`landuse`, `park`, `transportation`, `transportation_name`, `building`,
`place`, and `mountain_peak` for the full Streets/Topographic cartography and
the Blue Marble boundary/label overlay. The tileset below is
built with Planetiler's OpenMapTiles profile, so those layer names match
unchanged — **the style JSON is not regenerated; the tileset is built to fit it.**
(These styles previously lived in `FireMapPage.jsx` as
`buildPMTilesStyle()`; they have since moved to `basemapStyles.js`.)

The output is served as a single self-hosted PMTiles archive from
`frontend/public/tiles/`, so the **Streets** style renders with **zero
network requests outside localhost** (demo-day requirement: works with wifi
disabled). Blue Marble / Satellite HD are remote-only by design (see the
table above).

## Inputs

- OSM extract: `data/raw/india-latest.osm.pbf` (~1.7 GB, India-only —
  confirmed; no `--bounds` clip needed). Downloaded from
  `https://download.geofabrik.de/asia/india-latest.osm.pbf` (beware: the
  `india-latest-free.osm.pbf` variant 404s — India has no `-free` file). Any
  fresh India-only Geofabrik-style `.osm.pbf` works.
- Java 21+ (`java -version` to check).

## Build

1. Download the pinned Planetiler jar — the archive in this checkout was
   built with **v0.10.2**:

   ```bash
   # bash (Linux/macOS/Git Bash)
   wget -O planetiler.jar \
     https://github.com/onthegomap/planetiler/releases/download/v0.10.2/planetiler.jar
   ```

   ```powershell
   # PowerShell (Windows)
   Invoke-WebRequest -Uri "https://github.com/onthegomap/planetiler/releases/download/v0.10.2/planetiler.jar" -OutFile planetiler.jar
   ```

   (No SHA256 is recorded here yet — verify the jar against the checksums
   published on the Planetiler release page. The exact version used for the
   current archive is also recorded in `AGENT_LOG.md`.)

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
   # bash (Linux/macOS/Git Bash)
   cd frontend/public/tiles
   java -Xmx6g -jar <abs-path-to>/planetiler.jar \
     --download \
     --osm-path=<abs-path-to>/data/raw/india-latest.osm.pbf \
     --output=india.pmtiles \
     --force
   cd ../.. && rm -rf frontend/public/tiles/data
   ```

   ```powershell
   # PowerShell (Windows) — same flags
   cd frontend\public\tiles
   java "-Xmx6g" -jar <abs-path-to>\planetiler.jar `
     --download `
     "--osm-path=<abs-path-to>\data\raw\india-latest.osm.pbf" `
     --output=india.pmtiles `
     --force
   cd ..\..\.. ; Remove-Item -Recurse -Force frontend\public\tiles\data -ErrorAction SilentlyContinue
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
- With the env var unset (or the archive file missing), Streets and Topo fall
  back to remote Esri raster tiles and the map still renders — see the
  basemap/asset table at the top. The UI surfaces whether the local vector
  pack is active (`PMTILES_AVAILABLE` in `basemapStyles.js`), so the fallback
  is disclosed, not silent.
