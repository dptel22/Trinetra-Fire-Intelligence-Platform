# Architecture — SIH 2026 PS26162

> **STATUS: CURRENT.** Rewritten 2026-09-10 to describe the running system.
> Every box in the diagram is a real component; every claim carries a
> registry ID (`C-xx`) from [`CLAIMS_AND_EVIDENCE.md`](CLAIMS_AND_EVIDENCE.md).
> The previous version of this file described the never-built Era-0 stack
> (XGBoost, H3 res 7, PostgreSQL/Redis/WebSocket) — see
> [`CURRENT_PROJECT_TRUTH.md`](CURRENT_PROJECT_TRUTH.md) §25 for that history.

## System Overview

```mermaid
graph TB
  subgraph Sources
    FIRMS["NASA FIRMS area API<br/>VIIRS SNPP NRT + NOAA-20 NRT only<br/>(no MODIS) [C-15]"]
    OSM["OSM India PBF<br/>(~1.7 GB)"]
    WRI["WRI Global Power Plant DB v1.3.0<br/>(India rows)"]
    SHP["Pinned India state shapefile<br/>(hash-verified)"]
  end

  subgraph Ingestion["ingestion/"]
    PULL["firms_pull.py<br/>harmonize · confidence filter · dedup<br/>SSRF-hardened · 5-day ceiling [C-15]"]
    RAW["raw_archive.py<br/>immutable raw evidence parts<br/>written pre-harmonization [C-36]"]
    AGG["aggregate.py<br/>H3 res-8 cell-day · shift(1) before<br/>7d/30d/90d rolling (leakage-safe) [C-17]"]
    ENR["osm_wri_load.py<br/>OSM 6 tag filters (5 km) · WRI per-fuel<br/>(10 km) · state assignment [C-16]"]
    MAN["manifest.py<br/>run history → data/ingestion.duckdb [C-36]"]
  end

  subgraph Data[("data/ — gitignored")]
    PQ[("sih2026_h3_daily_features_firms.parquet<br/>28 cols")]
    PQ2[("sih2026_h3_daily_features_with_osm_wri.parquet<br/>61 cols · 459,972 cells · 20 states/UTs [C-18]")]
    FSD[("data/feature_store.duckdb<br/>h3_daily + osm_wri_static")]
    AUD[("data/audit_log.duckdb<br/>audit trail + alert lifecycle events")]
  end

  subgraph Backend["app/ — FastAPI (fail-closed startup) [C-20]"]
    MODEL["model_service.py<br/>CatBoost .cbm + isotonic calibrators<br/>55-feature contract check [C-01–C-03]"]
    PRED["predictions · detail · explain<br/>(CatBoost SHAP top-3, on demand) [C-09]"]
    ARC["archive_service.py<br/>provenance: live/historical/offline/<br/>failed/plausibility_warning [C-36]"]
    ALR["alert lifecycle + audit override<br/>(append-only) [C-36]"]
    API["/api/v1 routes · LIMIT 2500 ·<br/>one acq_date per request [C-22]"]
  end

  subgraph Frontend["frontend/ — React 19 + Vite [C-25]"]
    MAP["MapLibre GL + deck.gl MapboxOverlay<br/>+ PMTiles protocol + h3-js"]
    HON["honesty UI: OfflineBanner · SIMULATED labels ·<br/>LIVE/HISTORICAL/DEMO/OFFLINE pills ·<br/>verbatim caveat_flag [C-27]"]
    PAGES["fire map · alerts review · archive"]
  end

  BUNDLE["models/PS26162_catboost_final/<br/>inference_bundle/ (git-tracked contract)<br/>[C-02]"]

  FIRMS --> PULL
  PULL --> RAW
  PULL --> AGG
  AGG --> ENR
  OSM --> ENR
  WRI --> ENR
  SHP --> ENR
  ENR --> PQ2
  AGG --> PQ
  PULL --> MAN
  PQ --> FSD
  PQ2 --> FSD
  FSD --> MODEL
  BUNDLE --> MODEL
  MODEL --> PRED
  FSD --> ARC
  AUD --> ALR
  MAN --> ARC
  PRED --> API
  ARC --> API
  ALR --> API
  API --> PAGES
  API --> HON
  MAP --> PAGES
```

## Data Flow (actual implementation)

1. **Ingest** — `ingestion/firms_pull.py` pulls VIIRS SNPP + NOAA-20 NRT
   detections (FIRMS area API, max 5-day windows), harmonizes, drops
   low-confidence rows, validates physical ranges [C-15].
2. **Archive raw** — `ingestion/raw_archive.py` writes immutable
   hive-style parquet parts (including rejected rows) before harmonization;
   zero-detection days still produce parts [C-36].
3. **Aggregate** — `ingestion/aggregate.py` buckets to one row per
   `(h3_08, acq_date)` at H3 resolution 8; history features use shift(1)
   before rolling so the current day never contributes to its own history
   (regression-gated) [C-14, C-17].
4. **Enrich** — `ingestion/osm_wri_load.py` adds 16 WRI + 12 OSM distance/
   count features and assigns states via pinned-shapefile point-in-polygon
   with nearest-boundary tie-break; outside-India rows are rejected [C-16, C-18].
5. **Serve** — `app/services/feature_store.py` seeds DuckDB from both
   parquets (atomic two-table swap, single lock; static staging filtered to
   valid assignment methods). `model_service.py` enforces the 55-feature
   contract against the tracked bundle at startup and **fails closed** if it
   does not match — it never invents fallback predictions [C-03, C-20].
6. **Explain & audit** — SHAP on demand per cell; alert lifecycle events and
   audit overrides are append-only in DuckDB [C-09, C-36].

## Technology Choices (current)

| Component | Choice | Evidence |
|---|---|---|
| Model | CatBoost multiclass (4 classes, 55 features, categoricals `h3_08`+`daynight`) | [C-01, C-03, C-04, C-05] |
| Calibration | Per-class one-vs-rest isotonic regression | [C-08] |
| Explainability | CatBoost-native SHAP, top-3, on demand | [C-09] |
| Spatial index | H3 resolution 8 (cell-day units) | [C-14] |
| Data format | Parquet (+ 3 DuckDB files) | [C-21] |
| API | FastAPI + uvicorn, fail-closed startup | [C-20] |
| Storage | DuckDB + Parquet — **no PostgreSQL, no Redis, no WebSockets** (removed 2026-09-02) | [C-21] |
| Frontend | React 19 + Vite, MapLibre GL + deck.gl + PMTiles + h3-js | [C-25] |
| Base tiles | Blue Marble raster (shipped); OpenMapTiles PMTiles optional, not built here | [C-26] |

## Deployment Topology

One containerized backend service (`docker-compose.yml`, port 8000): the
image bakes the inference bundle and serving parquets, seeds a writable
volume on first boot, and mounts `./app` for dev reload. The frontend runs
via Vite (`npm run dev` / `build`) and calls `http://localhost:8000` with
server-side CORS. There is no frontend image, no service mesh, no queue
[C-28]. Live ingestion inside the image is unavailable (raw OSM/FIRMS inputs
are not copied in) — freshness comes from host runs or the optional startup
hook outside Docker.

## Scale & Performance — what is and is not known

- Verified facts: 459,972 static cells across 20 states/UTs in the serving
  artifact; 810,218 daily/static rows after the 2026-09-10 refresh; server
  cap `LIMIT 2500` per bbox request; archive summary capped at 31 days/request
  [C-18, C-22].
- Model metrics: see [C-10] — pseudo-label-derived macro-F1 with the mandatory
  ablation + caveat context. They are **not** accuracy claims.
- Not measured: end-to-end latency SLAs, concurrent-user throughput, memory
  ceilings under load. The `latency_ms: 8.2` in API examples is an
  illustrative sample, not a benchmark [C-30]. Do not cite "<1 ms inference"
  anywhere — that claim belongs to the removed demo [C-34].
