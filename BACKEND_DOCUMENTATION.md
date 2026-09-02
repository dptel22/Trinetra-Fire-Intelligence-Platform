# NASA FIRMS Hotspot Classification & Geospatial AI Backend
## NTRO-Compliant Defense-Grade Decision Support Platform

---

## 1. Executive Summary

This backend platform provides real-time classification, explainability, and spatial analytics for **NASA FIRMS (VIIRS/MODIS)** thermal hotspot data. Engineered specifically to comply with the operational and ethical constraints of the **National Technical Research Organization (NTRO)**, the system solves the three critical challenges of geospatial AI:

1. **High-Cardinality Spatial Data:** Uses CatBoost with native **Ordered Target Statistics** to handle millions of Uber H3 hexagonal cells without memory explosion or arbitrary label encoding.
2. **Spatio-Temporal Autocorrelation & Leakage:** Implements **Spatial Cross-Validation (SCV)** with $\ge 50\text{km}$ spatial buffers to ensure realistic generalization on unseen territories.
3. **Defense-Grade Explainability & Auditability:** Integrates on-demand **SHAP (TreeExplainer)** local feature attributions and an **immutable append-only audit trail** for human-in-the-loop analyst overrides.

---

## 2. System Architecture & Tech Stack

```
                               ┌────────────────────────┐
                               │   Deck.gl / Frontend   │
                               └───────────┬────────────┘
                                           │ (HTTP / JSON)
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FastAPI Gateway                                │
│  ├── /api/v1/classify          (Sub-50ms 6-class Multi-Class Inference)     │
│  ├── /api/v1/explain           (On-demand SHAP TreeExplainer Local Drivers) │
│  ├── /api/v1/ingest/batch      (Pydantic Validation + Dead-Letter Queue)    │
│  ├── /api/v1/spatial/viewport  (Viewport-Culling & Zoom Aggregation)        │
│  └── /api/v1/audit/override    (Append-Only Tamper-Resistant Audit Trail)   │
└──────────────────────┬───────────────────────────────┬──────────────────────┘
                       │                               │
                       ▼                               ▼
       ┌───────────────────────────────┐ ┌───────────────────────────────┐
       │   DuckDB H3 Feature Store     │ │   CatBoost Classifier Engine  │
       │  - Land-use / OSM tags        │ │  - 6-Class MultiClass Model   │
       │  - Distance to Water / Roads  │ │  - Balanced Class Weights     │
       │  - Canopy Cover %             │ │  - Native String CatFeatures  │
       │  - <10ms Columnar Lookups     │ │  - SHAP Attribution Matrix    │
       └───────────────────────────────┘ └───────────────────────────────┘
```

### Core Technologies:
- **Web Framework:** FastAPI (Asynchronous, OpenAPI/Swagger auto-documentation, Pydantic v2 schemas).
- **Machine Learning:** CatBoost (`CatBoostClassifier` with `MultiClass`, `auto_class_weights='Balanced'`).
- **Feature Store:** DuckDB (In-process columnar analytical engine for fast spatial joins).
- **Spatial Indexing:** Uber H3 (`h3-py`) at Resolution 8 ($\approx 0.737 \text{ km}^2$ per cell).
- **Explainability:** SHAP (`TreeExplainer` for exact polynomial-time game-theoretic feature attribution).
- **Spatial Validation:** Scikit-Learn + Geopy (`SpatialKFold` with 50 km cluster buffers).

---

## 3. Machine Learning & Ingestion Innovations

### 3.1 Why CatBoost Was Chosen Over Alternatives

| Model Family | Key Limitations in FIRMS Spatial Tasks | Why CatBoost Succeeds |
| :--- | :--- | :--- |
| **XGBoost / LightGBM** | Requires external encoding for H3 strings; One-Hot Encoding crashes memory (OOM), while Label Encoding imposes false numeric order. Susceptible to spatial target leakage. | **Native Ordered Target Statistics** encodes H3 cells internally per tree split without memory growth. **Ordered Boosting** eliminates gradient calculation target leakage. |
| **Deep Learning (TabNet / Transformers)** | Requires GPU, slow CPU inference, black-box decision boundaries. | Runs efficiently on standard CPUs ($<50\text{ms}$ inference); native tree structure enables exact SHAP values. |
| **Graph Neural Networks (GNNs)** | Complex custom graph loaders on H3 adjacencies; over-engineered for tabular inference. | Formulates features as aggregated spatial cells, offering superior accuracy with low engineering overhead. |

### 3.2 Target Classification Classes (6 NTRO Classes)
1. **`Wildfire`**: High FRP, high brightness, low road density, high forest canopy cover.
2. **`Agricultural Burn`**: Moderate brightness, low canopy, near farmland/roads, low persistence.
3. **`Industrial/Gas Flare`**: High persistence ($\ge 70$ out of 90 days), high FRP, zero canopy, industrial land-use.
4. **`Mining Activity`**: High persistence, moderate FRP, bare terrain / open pit signatures.
5. **`Urban/Infrastructure`**: Moderate brightness, near dense road network, low canopy.
6. **`False Positive/Noise`**: Low confidence, water reflection, high temperature anomaly artifact.

### 3.3 Persistence Normalization (Handling Data Gaps)
Rather than dividing the 90-day persistence count by a static divisor of 90, the pipeline normalizes by actual observed satellite passes:
$$\text{persistence\_90d\_norm} = \frac{\text{persistence\_90d}}{\text{observed\_days\_in\_90d}}$$
This prevents spuriously low persistence scores during sensor outages (e.g. 11 missing days).

---

## 4. API Reference

Base URL: `http://localhost:8000/api/v1`

### 4.1 Real-Time Classification
- **Endpoint:** `POST /classify`
- **Description:** Returns the predicted class, confidence, and complete probability distribution in $<50\text{ms}$.
- **Request Body:**
```json
{
  "hotspot_id": "FIRMS-IND-1001",
  "latitude": 22.05,
  "longitude": 79.12,
  "bright_ti4": 360.5,
  "bright_ti5": 305.0,
  "scan": 0.4,
  "track": 0.4,
  "acq_date": "2026-08-20",
  "acq_time": "1345",
  "satellite": "N",
  "confidence": "high",
  "frp": 85.5,
  "daynight": "D",
  "persistence_90d": 4,
  "observed_days_in_90d": 85
}
```
- **Response:**
```json
{
  "hotspot_id": "FIRMS-IND-1001",
  "latitude": 22.05,
  "longitude": 79.12,
  "h3_index": "88609b49b3fffff",
  "predicted_class": "Wildfire",
  "confidence": 99.82,
  "probabilities": [
    { "class_name": "Wildfire", "probability": 0.9982 },
    { "class_name": "Agricultural Burn", "probability": 0.0011 },
    { "class_name": "Industrial/Gas Flare", "probability": 0.0002 },
    { "class_name": "Mining Activity", "probability": 0.0003 },
    { "class_name": "Urban/Infrastructure", "probability": 0.0001 },
    { "class_name": "False Positive/Noise", "probability": 0.0001 }
  ],
  "latency_ms": 12.4,
  "context": {
    "landuse_tag": "forest",
    "canopy_cover_pct": 82.5,
    "distance_to_road_km": 14.2,
    "distance_to_water_km": 8.1
  }
}
```

---

### 4.2 On-Demand SHAP Explainability
- **Endpoint:** `POST /explain`
- **Description:** Computes exact game-theoretic SHAP feature attributions on-demand to avoid freezing background workers.
- **Response:**
```json
{
  "hotspot_id": "FIRMS-IND-1001",
  "predicted_class": "Wildfire",
  "base_value": -0.8421,
  "feature_attributions": [
    { "feature_name": "canopy_cover_pct", "feature_value": "82.5", "shap_value": 1.4821, "contribution": "Increases Risk" },
    { "feature_name": "frp", "feature_value": "85.5", "shap_value": 1.1205, "contribution": "Increases Risk" },
    { "feature_name": "landuse_tag", "feature_value": "forest", "shap_value": 0.9412, "contribution": "Increases Risk" },
    { "feature_name": "distance_to_road_km", "feature_value": "14.2", "shap_value": 0.4510, "contribution": "Increases Risk" }
  ],
  "summary_statement": "This thermal anomaly was classified as 'Wildfire' primarily driven by: canopy_cover_pct (82.5), frp (85.5), landuse_tag (forest)."
}
```

---

### 4.3 Ingestion Gateway with Dead-Letter Queue (DLQ)
- **Endpoint:** `POST /ingest/batch`
- **Description:** Validates raw NASA JSON/CSV feeds. Valid records proceed; malformed or drifting schema rows are quarantined in the DLQ.
- **Response:**
```json
{
  "total_received": 100,
  "total_valid": 98,
  "total_quarantined_dlq": 2,
  "message": "Ingested 98 valid records. Quarantined 2 records into DLQ.",
  "quarantined_errors": [...]
}
```

---

### 4.4 Viewport-Culling Spatial Query
- **Endpoint:** `GET /spatial/viewport?min_lat=20.0&max_lat=25.0&min_lon=75.0&max_lon=80.0&zoom=8.0`
- **Description:** Returns only visible H3 hexagons intersecting the active map viewport, guarding against browser DOM memory crashes during large zoom-outs.

---

### 4.5 NTRO Immutable Audit Trail
- **Endpoint:** `POST /audit/override`
- **Description:** Records human analyst overrides with microsecond timestamps and defense justifications into an append-only DuckDB table.
- **Request Body:**
```json
{
  "hotspot_id": "FIRMS-IND-1001",
  "analyst_id": "NTRO_ANALYST_04",
  "original_prediction": "Wildfire",
  "override_class": "Industrial/Gas Flare",
  "justification": "Cross-referenced with Sentinel-2 RGB imagery; verified stationary methane burn flare.",
  "confidence_rating": 5
}
```
- **Endpoint:** `GET /audit/logs` (Returns audit trail for compliance inspection).

---

## 5. Project Directory Structure

```text
SIH-BACKEND/
├── app/
│   ├── api/
│   │   ├── endpoints/
│   │   │   ├── classify.py          # Real-time inference & SHAP explainability
│   │   │   ├── ingest.py            # Ingestion gateway & Dead-Letter Queue
│   │   │   ├── spatial.py           # Viewport-culling spatial query
│   │   │   └── audit.py             # Append-only audit trail logging
│   │   └── api_router.py            # Central router
│   ├── core/
│   │   └── config.py                # Global settings, classes, feature lists
│   ├── schemas/
│   │   ├── firms.py                 # Pydantic schemas for NASA FIRMS data
│   │   ├── prediction.py            # Prediction & SHAP schemas
│   │   └── audit.py                 # Audit log schemas
│   ├── services/
│   │   ├── feature_store.py         # DuckDB H3 columnar feature store
│   │   ├── model_service.py         # CatBoost model inference & SHAP engine
│   │   └── audit_service.py         # Tamper-resistant append-only audit logger
│   └── main.py                      # FastAPI app entrypoint & lifespan management
├── pipeline/
│   ├── feature_engineering.py       # H3 hex conversion & persistence normalization
│   ├── spatial_cv.py                # Spatial Cross-Validation (50km buffer)
│   └── train_catboost.py            # CatBoost model training pipeline
├── data/
│   ├── sample_firms.csv             # Synthetic benchmark dataset (2500 samples)
│   ├── catboost_hotspot_model.cbm   # Serialized trained CatBoost model
│   ├── feature_store.duckdb         # Columnar H3 spatial context database
│   └── audit_log.duckdb             # Append-only NTRO audit database
├── tests/
│   └── test_backend.py              # Automated pytest test suite
├── requirements.txt                 # Project dependencies
└── BACKEND_DOCUMENTATION.md         # Comprehensive system manual
```

---

## 6. How to Run & Verify

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Train the CatBoost Model with Spatial CV
```bash
python pipeline/train_catboost.py
```

### 3. Run the Automated Test Suite
```bash
python -m pytest tests/test_backend.py
```
*(All 7 unit and integration tests will execute and validate H3 indexing, spatial CV, API endpoints, DLQ quarantine, and audit logging)*

### 4. Start the FastAPI Server
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 5. Access Interactive Documentation
Open your browser and navigate to:
- **Swagger UI:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc:** [http://localhost:8000/redoc](http://localhost:8000/redoc)
