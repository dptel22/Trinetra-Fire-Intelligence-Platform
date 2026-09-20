# Release & Artifact Policy

Where every distributed artifact lives, and which one is current. Git tracks
**small, contract-defining** files; GitHub Releases carry **large binaries
and data snapshots** that must not bloat the repository.

## Rules

1. Anything not reproducible from a fresh clone and not small enough to track
   (≈ <1 MB binary) belongs in a Release asset, not in git.
2. Every release carrying data ships a `SHA256SUMS.json` manifest; consumers
   verify before use (see `scripts/fetch_serving_data.py`).
3. Naming convention: `<artifact>-YYYY-MM-DD` (e.g. `serving-data-2026-09-09`).
4. Older releases remain visible for provenance but only the ones marked
   CURRENT below are supported.

## Current artifact map

| Artifact | Where it lives | Status |
|---|---|---|
| **Model inference bundle** (`.cbm` + calibrators + schemas) | Tracked: `models/PS26162_catboost_final/inference_bundle/` | **CURRENT** — this is the deployed contract. The `model-v3` release asset is a zip of the same bundle for convenience; the git copy is authoritative. |
| **Serving parquets** (FIRMS + OSM/WRI features) | GitHub Release `serving-data-2026-09-09` | Pinned snapshot for fresh clones (`python scripts/fetch_serving_data.py`). **Refresh pending**: a nationwide archive backfill is in progress (2026-09-20, see `docs/superpowers/plans/2026-09-20-nationwide-archive-backfill.md` and `AGENT_LOG.md`); a new `serving-data-YYYY-MM-DD` release will be cut only after the rebuild, seasonal gate, and live-tail merge are validated. Until then the 09-09 snapshot does not reflect the latest docs. |
| **PMTiles vector basemap** (`india.pmtiles`, ≈1.98 GiB) | Local only (`frontend/public/tiles/`, gitignored); planned Release asset | A `basemap-pmtiles-YYYY-MM-DD` release is planned. Note the GitHub per-file limit is 2 GiB — the current archive fits, but a materially larger rebuild would need splitting by zoom or a different host. Build instructions: `docs/PMTILES_BUILD.md`. |
| **Historical timeline layers** (`data/processed/timeline/`) | Generated locally by the materializer | Not yet packaged; will join the next serving-data release once the backfill completes. |
| **Raw inputs** (FIRMS CSVs, India OSM PBF, WRI CSV, boundary shapefile) | External sources — never redistributed | See `data/README.md` and `THIRD_PARTY_NOTICES.md` for pinned sources and hashes. |
| **Legacy model releases** (`model` prerelease: v1/v2) | GitHub Releases | LEGACY — unsupported; kept for provenance only. |

## What must never be committed

`data/raw/`, serving parquets, `*.duckdb*`, `.pmtiles` archives, raw model
outputs over 1 MB, and any secret-bearing file — all enforced via
`.gitignore`. The only tracked binaries are the served inference bundle
members.
