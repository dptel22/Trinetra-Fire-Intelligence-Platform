"""Live FIRMS ingestion package (PS26162).

Modules:
- firms_pull: NASA FIRMS area-API pull (VIIRS SNPP + NOAA-20 NRT).
- aggregate: notebook-verbatim H3-day aggregation (locked serving contract).
- osm_wri_load: OSM/WRI static features + state assignment from raw local data.
- run_ingestion: orchestration -> the two serving parquets FeatureStoreService reads.
"""
