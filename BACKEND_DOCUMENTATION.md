# PS26162 Backend Documentation

## Current Contract

The backend serves Dhruv's real H3-day CatBoost classifier, not the older synthetic point-level demo model.

- Model artifact: `models/PS26162_catboost_final/inference_bundle/catboost_hotspot_classifier.cbm` with tracked calibration, schema, threshold, and runtime files.
- Prediction unit: one `(h3_08, acq_date)` cell-day
- H3 resolution: 8
- Feature schema: 55 CatBoost features in `models/PS26162_catboost_final/inference_bundle/feature_schema.json` and `app/core/config.py`
- Categorical features: `h3_08`, `daynight`
- Classes: `industrial`, `mining`, `agricultural_burn`, `wildfire`
- Optional abstention: `UNCLASSIFIED_THRESHOLD`, disabled unless set in the environment

Startup fails loudly if the configured model artifact does not match the 55-feature contract.

## Data Sources

The DuckDB feature store is seeded from processed parquet artifacts:

- `data/processed/sih2026_h3_daily_features_firms.parquet` -> `h3_daily`
- `data/processed/sih2026_h3_daily_features_with_osm_wri.parquet` -> `osm_wri_static`

The backend does not train a model at startup and does not invent fallback predictions when artifacts are missing.

## API Surfaces

Base API path: `http://localhost:8000/api/v1`

Root prediction aliases are also exposed at `http://localhost:8000/predictions`.

### Health

`GET /health`

Returns model loaded state, schema version/hash, artifact path, startup latency, and target classes.

### Bounding Box Predictions

`GET /predictions?min_lat=34.34&max_lat=34.36&min_lon=73.79&max_lon=73.86&acq_date=2025-01-26`

Returns H3-day cell predictions inside the bbox for the requested UTC acquisition date. SHAP is not computed for this list response.

### Cell Detail

`GET /predictions/{cell_id}?acq_date=2025-01-26`

Returns class, confidence, probabilities, context, and top explanation fields for one H3-day cell.

### Cell Explanation

`GET /predictions/{cell_id}/explain?acq_date=2025-01-26`

Runs CatBoost native TreeSHAP on demand and returns the top three SHAP drivers.

## Response Shape

```json
{
  "cell_id": "88209a2011fffff",
  "latitude": 34.353099,
  "longitude": 73.794692,
  "h3_index": "88209a2011fffff",
  "predicted_class": "wildfire",
  "probabilities": [
    { "class_name": "agricultural_burn", "probability": 0.01 },
    { "class_name": "industrial", "probability": 0.02 },
    { "class_name": "mining", "probability": 0.03 },
    { "class_name": "wildfire", "probability": 0.94 }
  ],
  "confidence": 0.94,
  "caveat_flag": null,
  "latency_ms": 8.2
}
```

## Honest Caveats

The API may surface caveats for:

- Pseudo-label circularity: labels partly derive from FIRMS/OSM/WRI features.
- Satellite handling: only `satellite_nunique` is modeled, not raw satellite identity.
- Mining support: mining has lower labeled support and should be interpreted cautiously.

## Verification

```bash
python -c "from app.main import app; print(app.title)"
python -m pytest tests/test_backend.py
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
