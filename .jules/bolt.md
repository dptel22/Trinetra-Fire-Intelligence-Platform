## 2026-03-30 - DuckDB Connection Overhead in Real-Time Spatial Context Lookups

**Learning:** Re-opening a DuckDB database connection (`duckdb.connect(db_path)`) on every single spatial context lookup in `FeatureStoreService.get_context_for_h3` adds ~20ms of file I/O and setup overhead per request. Since H3 hexagon spatial context (landuse, canopy cover, distances to roads/water) is static for a given dataset, caching H3 context lookups via LRU cache reduces lookup latency from ~20ms to <0.001ms (warm).

**Action:** Cache static spatial context lookups or pool DuckDB read connections when performing point-wise lookups during real-time inference.
