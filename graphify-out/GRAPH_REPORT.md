# Graph Report - SIH_2026  (2026-09-16)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1153 nodes · 2380 edges · 61 communities (48 shown, 13 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 69 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `35e5c7e2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 58
- Community 59

## God Nodes (most connected - your core abstractions)
1. `run_ingestion()` - 49 edges
2. `CatBoostModelService` - 33 edges
3. `react` - 22 edges
4. `_get()` - 21 edges
5. `FeatureStoreService` - 20 edges
6. `build_materialized_layers()` - 20 edges
7. `build_daily_frame()` - 20 edges
8. `annotate_transitions()` - 19 edges
9. `AuditTrailService` - 18 edges
10. `TimelineService` - 17 edges

## Surprising Connections (you probably didn't know these)
- `test_validate_raw_inputs_fail_loud()` --uses--> `RawInputError`  [INFERRED]
  tests/test_ingestion.py → ingestion/osm_wri_load.py
- `test_reload_is_safe_under_concurrent_queries()` --uses--> `FeatureStoreService`  [INFERRED]
  tests/test_ingestion.py → app/services/feature_store.py
- `test_run_ingestion_end_to_end_schema_and_store_contract()` --uses--> `FeatureStoreService`  [INFERRED]
  tests/test_ingestion.py → app/services/feature_store.py
- `TestIngestionHook` --uses--> `RawInputError`  [INFERRED]
  tests/test_raw_archive.py → ingestion/osm_wri_load.py
- `test_fetch_firms_parses_nrt_csv_and_tags()` --calls--> `fetch_firms()`  [EXTRACTED]
  tests/test_ingestion.py → ingestion/firms_pull.py

## Import Cycles
- None detected.

## Communities (61 total, 13 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (47): get_cell_timeline(), BaseModel, TimelineContext, TimelineModel, TimelineResponse, _gaps(), _number_or_none(), Any (+39 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (37): FeatureStoreService, Any, Force a re-seed from the parquets (after ingestion updates them)., Newest acq_date in the daily table (ISO yyyy-mm-dd), or None if empty. Lets the…, All distinct acq_dates in the daily table, sorted ascending., DuckDB-backed H3-day feature store seeded from the real parquet artifacts.…, All H3-day feature rows for one acq_date (static OSM/WRI columns joined).…, (state, state_assignment_method) provenance for a cell, or None. (+29 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (18): available_dates(), client(), fixture, Path, requires_data, Tests for Agent 1: backend archive + provenance foundation. Covers: - Archive…, data_mode must be derived from the NEWEST ingestion run for the date., An older clean live_firms run must NOT make the date live once a newer run for… (+10 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (32): get_alert_history(), post, Alert lifecycle endpoints: analyst review actions on H3-day hotspots. Every…, Full append-only event history for one hotspot (oldest first)., {h3_08}_{acq_date}' — the same convention the audit override uses., Server-side resolution of the model output + run provenance. 404 when absent., Append an analyst lifecycle action (acknowledge/confirm/dismiss/note/reopen)., record_alert_action() (+24 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (43): get_alert_states(), Replay-derived lifecycle state for every hotspot of one acquisition date., get_archive_dates(), get_archive_predictions(), get_archive_summary(), _iso_date(), Dates available in the H3-day archive, plus honest serving provenance., Paginated archived predictions for one acq_date, with provenance. Unknown dates… (+35 more)

### Community 5 - "Community 5"
Cohesion: 0.10
Nodes (41): add_temporal_history(), _rolling(), aggregate_detections(), AggregationValidationError, assign_h3(), build_daily_frame(), cast_daily_dtypes(), finalize_daily() (+33 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (40): _activity_regime(), _annotate_cell(), _accept(), _row_for(), annotate_transitions(), _confidence(), Any, DataFrame (+32 more)

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (32): _add_temporal_history(), aggregate_daily(), assign_cells(), _daily_cell_aggregate(), DataFrame, FIRMS VIIRS point stream -> exact H3-day cell aggregation. Produces the daily…, Full pipeline: assign cells, group by (h3_08, acq_date), add temporal hist.…, Shift-before-rolling temporal features (leakage-safe, per h3_08). (+24 more)

### Community 8 - "Community 8"
Cohesion: 0.14
Nodes (12): CatBoostModelService, Any, ndarray, Pool, Inference service for Dhruv's real PS26162 H3-day CatBoost model., Map raw per-class probabilities through the bundle's isotonic calibrators. Per-…, Review gate is evaluated against the pre-policy class so that 'unclassified'…, Explain model prediction for a cell via SHAP values. Note: This intentionally… (+4 more)

### Community 9 - "Community 9"
Cohesion: 0.10
Nodes (24): App(), ArchivePage, FireAlertsPage, FireMapPage, AnnouncementsModal(), INITIAL_ANNOUNCEMENTS, FeedbackModal(), Header() (+16 more)

### Community 10 - "Community 10"
Cohesion: 0.10
Nodes (26): ClassificationFilters(), DataReliabilityBlock(), CLASS_ORDER, CLASS_RGB, hexToRgb(), ICON_RGB, INDIA_FILTER, INDIA_MAX_BOUNDS (+18 more)

### Community 11 - "Community 11"
Cohesion: 0.13
Nodes (29): _empty_frame(), fetch_firms(), fetch_firms_both(), _pull(), harmonize_points(), IngestionError, load_map_key(), _parse_csv() (+21 more)

### Community 12 - "Community 12"
Cohesion: 0.11
Nodes (29): _centroid_lonlat(), compute_osm_features(), compute_wri_features(), ensure_state_shapefile(), extract_osm_points_from_pbf(), load_state_polygons(), _from_3857(), load_wri_india() (+21 more)

### Community 13 - "Community 13"
Cohesion: 0.13
Nodes (24): RFC-4180, FireMapPage(), load(), useDebounce(), DEFAULT_ACQ_DATE(), fetchCellDetail(), fetchExplanation(), fetchPredictions() (+16 more)

### Community 14 - "Community 14"
Cohesion: 0.11
Nodes (25): AlertActionBar(), AlertCard(), LIFECYCLE_STYLES, loadAnalystId(), pillButtonStyle(), RawEvidencePanel(), saveAnalystId(), smallButtonStyle (+17 more)

### Community 15 - "Community 15"
Cohesion: 0.13
Nodes (26): build_osm_feature_cache(), Extract once, cache to data/processed/osm_features_cache.parquet. Rebuilds when…, _append_run_history(), _atomic_write_parquet(), _backup_originals_once(), ensure_fresh_for_backend(), is_ingestion_current(), _load_parquet_frame() (+18 more)

### Community 16 - "Community 16"
Cohesion: 0.10
Nodes (25): plausibility_violations(), Order-of-magnitude sanity gates for a single-day live pull. The historical…, live, _copy_parquet_slice(), _firms_row(), Path, skipif, Tests for the live FIRMS ingestion pipeline. Covers: - fetch_firms against a… (+17 more)

### Community 17 - "Community 17"
Cohesion: 0.15
Nodes (24): check_archive_gaps(), check_confidence_policy(), check_dedup_integrity(), check_h3_resolution(), check_layer_schema_parity(), check_output_hashes(), check_partial_first_period(), check_schema_parity() (+16 more)

### Community 18 - "Community 18"
Cohesion: 0.14
Nodes (23): SSRF gate: https-only, fixed-host allowlist, resolve and require public IPs., check_criterion_1_pyosmium(), check_criterion_2_egress(), check_criterion_3_download(), evaluate_probe_decision(), main(), Any, Path (+15 more)

### Community 19 - "Community 19"
Cohesion: 0.17
Nodes (16): ArchivePage(), selectStyle, smallButtonStyle, summaryCardStyle, FireAlertsPage(), OfflineBanner(), deriveAlertsStatus(), exportPredictionsToCsv() (+8 more)

### Community 20 - "Community 20"
Cohesion: 0.15
Nodes (23): _BrokenCalibrator, _calendar_features(), _pool_from_row(), Pool, skipif, Test that get_cell_detail correctly merges review caveat and explanation…, The DuckDB seed derivation and the pandas aggregation formula must be…, UNCLASSIFIED_THRESHOLD cells keep full inference: still returned, with review… (+15 more)

### Community 21 - "Community 21"
Cohesion: 0.10
Nodes (18): _load_dotenv(), Path, Runtime configuration for the PS26162 backend contract., Populate os.environ from a .env file without overriding existing vars. Real…, Archive + provenance service: historical H3-day prediction browsing. Reads the…, _a_real_store_cell(), client(), fixture (+10 more)

### Community 22 - "Community 22"
Cohesion: 0.18
Nodes (10): _active_days(), classify_regime(), Any, Thermal-regime classification: persistent sources vs new anomalies. Separates…, (thermal_regime, basis) from trailing activity features. The basis states the…, _cell(), Tests for the thermal-regime classifier (persistent vs new anomaly). The regime…, The regime must ride along on serving responses (live + archive). (+2 more)

### Community 23 - "Community 23"
Cohesion: 0.09
Nodes (21): name, private, type, version, @deck.gl/core, @deck.gl/extensions, @deck.gl/geo-layers, @deck.gl/layers (+13 more)

### Community 24 - "Community 24"
Cohesion: 0.14
Nodes (12): client(), _history_file(), DataFrame, fixture, Path, requires_data, Tests for raw FIRMS evidence + ingestion run manifest endpoints. Covers: - GET…, A zero-detection day with a written raw partition is valid evidence. (+4 more)

### Community 25 - "Community 25"
Cohesion: 0.17
Nodes (6): _post_action(), requires_data, Tests for the alert lifecycle: append-only events, replay-derived state.…, TestAlertActions, TestHistory, TestReplayState

### Community 26 - "Community 26"
Cohesion: 0.12
Nodes (17): dependencies, @deck.gl/core, @deck.gl/extensions, @deck.gl/geo-layers, @deck.gl/layers, @deck.gl/mapbox, h3-js, leaflet (+9 more)

### Community 27 - "Community 27"
Cohesion: 0.15
Nodes (16): parametrize, _locate_training_artifact(), Path, Training vs. Serving feature parity test for the PS26162 CatBoost pipeline.…, RoutFeed the raw (h3, date) through feature_store.get_cell (live serving path)., Prove config, feature_schema.json agree exactly in count, set, and order., Prove the 55-feature vector from training matches serving output per column., Verify the serving pipeline yields valid probabilities for the non-trivial cell. (+8 more)

### Community 28 - "Community 28"
Cohesion: 0.22
Nodes (13): classify_batch(), classify_hotspot(), explain_hotspot(), post, Sub-50ms real-time classification of NASA FIRMS thermal anomaly into the…, Batch classification for multi-hotspot ingestion., On-Demand Defense-Grade SHAP TreeExplainer Local Attribution. Computes exact…, FIRMSRecord (+5 more)

### Community 29 - "Community 29"
Cohesion: 0.31
Nodes (5): ArchiveService, Any, Score every H3-day row for the date. State is attached from the provenance…, Calendar days inside the store's span (clipped to the request) that hold no…, Newest decisive run for the date, walking the append-ordered history from the…

### Community 30 - "Community 30"
Cohesion: 0.20
Nodes (12): health_check(), v1 Health Check endpoint alias. Provides identical health contract to the root…, _background_ingestion(), health_check(), lifespan(), Mirror ingestion.* log records into uvicorn's handlers. uvicorn replaces the…, Boot-time freshness check + ingestion, deliberately OFF the hot path. The…, _route_ingestion_logs_into_uvicorn() (+4 more)

### Community 31 - "Community 31"
Cohesion: 0.21
Nodes (13): get_archive_evidence(), Raw FIRMS observations behind a prediction date — immutable evidence. Defaults…, available_raw_dates(), has_parts(), _list_parts(), _part_dir(), Path, Immutable raw FIRMS observation archive. Persists the untouched per-source… (+5 more)

### Community 32 - "Community 32"
Cohesion: 0.31
Nodes (11): CellPredictionDetailResponse, ClassProbability, ExplanationResponse, FeatureAttribution, HealthResponse, HotspotPredictionResponse, PredictionResponse, BaseModel (+3 more)

### Community 33 - "Community 33"
Cohesion: 0.30
Nodes (8): _atomic_write_parquet(), DataFrame, Write one immutable part per (source, acq_date). Returns logical part keys. A…, write_raw_observations(), DataFrame, _raw_frame(), _row(), TestWriteRawObservations

### Community 34 - "Community 34"
Cohesion: 0.24
Nodes (13): skipif, Geographic generalization provenance tests. All-India inference with the…, Nationwide query on the newest ingested day: every returned cell must sit…, get_cell_detail reads the store's real cell, so pick a cell the store actually…, The runtime training partition must come from the bundle's model_metadata.json…, _sample_h3_day_row(), test_cell_detail_carries_geographic_caveat(), test_explain_preserves_geographic_caveat() (+5 more)

### Community 35 - "Community 35"
Cohesion: 0.17
Nodes (7): _firms_csv(), mocked_firms(), _fake_get(), fixture, Replace the HTTP layer; returns a list capturing requested URLs., fixture, TestIngestionHook

### Community 37 - "Community 37"
Cohesion: 0.27
Nodes (6): _json_or_empty(), Durable ingestion run manifest in DuckDB. The JSON run history…, Append one run to the manifest. Returns True when written. Never raises: cross-…, record_run(), Tests for the immutable raw FIRMS observation archive + run manifests. Covers:…, TestManifest

### Community 38 - "Community 38"
Cohesion: 0.29
Nodes (9): active_caveats(), _fmt(), humanize_feature(), Any, Human-readable formatting for SHAP feature attributions + caveat surfacing.…, Format one feature into a human-readable clause for analyst panels., Top-N SHAP drivers (by |shap_value|) as human-readable strings., Judge-facing honesty caveats relevant to a prediction. Always surfaces the… (+1 more)

### Community 39 - "Community 39"
Cohesion: 0.22
Nodes (4): Staleness threshold (hours) for the layer backing this granularity., True only when TIMELINE_ALLOW_FALLBACK is explicitly enabled. Defaults to OFF…, True only when TIMELINE_SEASONAL_GATE_OVERRIDE is explicitly enabled. Fail-…, Settings

### Community 40 - "Community 40"
Cohesion: 0.31
Nodes (8): build_tile(), main(), mercator_y(), ndarray, Build local Web-Mercator tiles from the equirectangular Blue Marble image., tile_range(), Image, range

### Community 41 - "Community 41"
Cohesion: 0.22
Nodes (9): assign_states(), Point-in-polygon state assignment with an India land mask. Returns state /…, All-India serving: TN, Odisha, J&K and Kerala must all be retained., Andaman & Nicobar and Lakshadweep are Indian territory geometry., Sri Lanka and Bay of Bengal open water must never get an Indian state — this is…, test_assign_states_pip_on_pinned_shapefile(), test_assign_states_rejects_sri_lanka_and_open_water(), test_assign_states_retains_island_territories() (+1 more)

### Community 43 - "Community 43"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 44 - "Community 44"
Cohesion: 0.33
Nodes (6): devDependencies, oxlint, @types/react, @types/react-dom, vite, @vitejs/plugin-react

### Community 45 - "Community 45"
Cohesion: 0.40
Nodes (3): Path, Read the train/eval state partition from the bundle metadata. The union of…, Warn (never fail) when serving versions drift from the training runtime.

### Community 46 - "Community 46"
Cohesion: 0.40
Nodes (5): scripts, build, dev, lint, preview

### Community 48 - "Community 48"
Cohesion: 0.67
Nodes (3): placeLocationTags(), TAG_CLASSES, TrinetraSplash()

### Community 49 - "Community 49"
Cohesion: 0.50
Nodes (4): client(), fixture, A real stored hotspot id '{h3_08}_{acq_date}' with its date., sample_hotspot()

### Community 50 - "Community 50"
Cohesion: 0.67
Nodes (3): ArchiveDateNotAvailable, Raised when the requested acq_date is not present in the feature store., LookupError

## Knowledge Gaps
- **65 isolated node(s):** `CLASS_ORDER`, `INDIA_FILTER`, `INDIA_MAX_BOUNDS`, `BASEMAP_ATTRIBUTIONS`, `MOCK_TIMELINES` (+60 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 419 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `_validate_url_safety()` connect `Community 11` to `Community 18`, `Community 4`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `SSRF gate: https-only, fixed-host allowlist, resolve and require public IPs.` connect `Community 18` to `Community 11`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Are the 14 inferred relationships involving `run_ingestion()` (e.g. with `.test_failed_run_reports_offline_and_failed()` and `.test_failure_between_date_run_and_recovery_keeps_date_offline()`) actually correct?**
  _`run_ingestion()` has 14 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `CatBoostModelService` (e.g. with `CellPredictionDetailResponse` and `ClassProbability`) actually correct?**
  _`CatBoostModelService` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `FeatureStoreService` (e.g. with `test_reload_is_safe_under_concurrent_queries()` and `test_run_ingestion_end_to_end_schema_and_store_contract()`) actually correct?**
  _`FeatureStoreService` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `CLASS_ORDER`, `INDIA_FILTER`, `INDIA_MAX_BOUNDS` to the rest of the system?**
  _65 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.053208137715179966 - nodes in this community are weakly interconnected._