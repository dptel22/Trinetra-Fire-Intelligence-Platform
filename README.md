# 🛰️ NTRO NASA FIRMS Geospatial AI Platform
## High-Cardinality Spatio-Temporal Classification, Feature Store & Decision Support Backend

---

## 📋 Table of Contents
1. [Executive Summary & Problem Statement](#1-executive-summary--problem-statement)
2. [High-Level System Architecture](#2-high-level-system-architecture)
3. [Algorithmic & Machine Learning Core](#3-algorithmic--machine-learning-core)
   - [Why CatBoost Outperforms XGBoost, LightGBM & Deep Learning](#31-why-catboost-outperforms-xgboost-lightgbm--deep-learning)
   - [Native Handling of Uber H3 Hexagonal Grid (Ordered Target Statistics)](#32-native-handling-of-uber-h3-hexagonal-grid-ordered-target-statistics)
   - [Spatial Autocorrelation & Spatial Cross-Validation (SCV)](#33-spatial-autocorrelation--spatial-cross-validation-scv)
   - [Missing-Day Persistence Normalization](#34-missing-day-persistence-normalization)
   - [The 6 NTRO Target Classes](#35-the-6-ntro-target-classes)
4. [Data Layer & DuckDB H3 Feature Store](#4-data-layer--duckdb-h3-feature-store)
5. [Defense-Grade Explainability (SHAP) & Immutable Audit Trail](#5-defense-grade-explainability-shap--immutable-audit-trail)
   - [On-Demand SHAP TreeExplainer Engine](#51-on-demand-shap-treeexplainer-engine)
   - [Append-Only NTRO Audit Trail](#52-append-only-ntro-audit-trail)
6. [Resilience & Defensive Architecture (5 Failure Modes)](#6-resilience--defensive-architecture-5-failure-modes)
7. [Directory Structure & Code Walkthrough](#7-directory-structure--code-walkthrough)
8. [Complete API Specification](#8-complete-api-specification)
9. [Quickstart & Verification Guide](#9-quickstart--verification-guide)

---

## 1. Executive Summary & Problem Statement

NASA's **Fire Information for Resource Management System (FIRMS)** provides satellite-detected thermal anomaly (hotspot) data from the **VIIRS** (on Suomi-NPP and NOAA-20) and **MODIS** (on Aqua and Terra) sensors.

### The Operational Challenge for NTRO:
NASA FIRMS points only detect raw **heat on the ground** (coordinates, brightness temperature, fire radiative power). However, a defense intelligence analyst at the **National Technical Research Organization (NTRO)** needs to immediately determine:
* *What is the physical source of the thermal event?* (Is it a wildfire, crop stubble burning, an oil refinery flare, a blast in an open-cast mine, or a false positive?)
* *Why did the AI classify it this way?* (Defense decisions require mathematically verifiable, transparent explanations).

### Core Technical Pillars of this Backend:
1. **High-Cardinality Spatial Tabular AI:** Handles millions of Uber H3 hexagonal cells without memory explosion using **CatBoost Ordered Target Statistics**.
2. **Spatial Autocorrelation Mitigation:** Prevents target leakage across geographically proximate points via **Spatial Cross-Validation (`SpatialKFold`)** with $\ge 50\text{km}$ buffer separation.
3. **Sub-50ms Inference & Viewport Culling:** Powered by an in-process **DuckDB H3 Feature Store** and viewport bounding-box spatial filtering for 60 FPS **Deck.gl** map rendering.
4. **Defense-Grade Explainability & Compliance:** Computes on-demand **SHAP (TreeExplainer)** local feature attributions and logs analyst decisions in an **immutable append-only audit trail**.

---

## 2. High-Level System Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT / FRONTEND (Deck.gl)                               │
│     - WebGL GPU-accelerated H3 Hexagon rendering                                       │
│     - Viewport culling (requests only visible bounding boxes)                          │
│     - On-demand SHAP explanation popups on user click                                  │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │ HTTP / JSON
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                            FASTAPI INGESTION & INFERENCE GATEWAY                       │
│  ├── /api/v1/classify          (Sub-50ms 6-class MultiClass Prediction)                │
│  ├── /api/v1/explain           (On-Demand SHAP TreeExplainer Local Attribution)        │
│  ├── /api/v1/ingest/batch      (Pydantic Validation + Dead-Letter Queue Isolation)     │
│  ├── /api/v1/spatial/viewport  (Spatial Bounding-Box Culling & Macro Aggregation)      │
│  └── /api/v1/audit/override    (Append-Only Tamper-Resistant Decision Logging)         │
└─────────────────────┬────────────────────────────────────────┬─────────────────────────┘
                      │                                        │
                      ▼                                        ▼
┌──────────────────────────────────────────────┐ ┌───────────────────────────────────────┐
│         DUCKDB H3 FEATURE STORE              │ │       CATBOOST ML ENGINE              │
│  - Columnar in-process storage               │ │  - 6-Class MultiClass Model           │
│  - Pre-computed OSM Land-use tags            │ │  - Balanced Class Weights             │
│  - Distance to Water / Road networks (km)    │ │  - Native String Categorical Features │
│  - Forest Canopy Cover %                     │ │  - Ordered Boosting (Anti-Leakage)    │
│  - Sub-10ms Feature Vector Lookups           │ │  - SHAP TreeExplainer Engine          │
└──────────────────────────────────────────────┘ └───────────────────┬───────────────────┘
                                                                     │
                                                                     ▼
                                                 ┌───────────────────────────────────────┐
                                                 │      IMMUTABLE AUDIT DATABASE         │
                                                 │  - Append-only DuckDB table           │
                                                 │  - Microsecond UTC timestamps         │
                                                 │  - Analyst ID, Overrides, Reasoning   │
                                                 └───────────────────────────────────────┘
```

---

## 3. Algorithmic & Machine Learning Core

### 3.1 Why CatBoost Outperforms XGBoost, LightGBM & Deep Learning

| Model Family | Vulnerabilities on NASA FIRMS Spatial Data | CatBoost Solution |
| :--- | :--- | :--- |
| **XGBoost** | Cannot natively handle high-cardinality H3 string categories. One-Hot Encoding (OHE) causes Out-of-Memory (OOM) crashes. Label Encoding imposes false numeric hierarchy. Susceptible to spatial target leakage. | **Native Ordered Target Statistics (TS)** computes encodings internally within tree splits. **Ordered Boosting** prevents spatial target leakage. |
| **LightGBM** | Leaf-wise tree growth causes severe overfitting on noisy/clustered satellite data. Relies on external categorical transformations. | Symmetric (oblivious) decision trees act as strong regularizers against spatial noise. |
| **Deep Learning (TabNet / Transformers)** | Requires GPU acceleration (disqualified in CPU-constrained or edge environments). Incompatible with exact tree SHAP explanations. | Runs in milliseconds on commodity CPUs; supports exact polynomial-time **TreeSHAP**. |
| **Graph Neural Networks (GNNs)** | Building H3 adjacency graphs at runtime introduces massive software engineering overhead and slow inference. | Models aggregated spatial attributes in tabular format, achieving SOTA accuracy with low latency. |

---

### 3.2 Native Handling of Uber H3 Hexagonal Grid (Ordered Target Statistics)
The Earth is partitioned into discrete H3 hexagonal cells (Resolution 8 $\approx 0.737 \text{ km}^2$). Passing millions of unique alphanumeric H3 hashes (e.g. `"88609b49b3fffff"`) as features usually creates prohibitive memory usage:
* **The CatBoost Advantage:** CatBoost processes `h3_index`, `satellite`, and `landuse_tag` directly as **raw string categorical features** (`cat_features`).
* **Target Statistics (TS):** Converts categories to continuous values based on the target variable mean calculated over random permutations of prior data points, completely preventing sample target leakage.

---

### 3.3 Spatial Autocorrelation & Spatial Cross-Validation (SCV)
Thermal anomalies exhibit strong spatial clustering (fires near other fires). Traditional random $K$-Fold Cross-Validation leaks training map coordinates into validation sets, yielding artificially inflated metrics that fail on unseen regions.

* **Implementation (`pipeline/spatial_cv.py`):**
  1. Partitions data into spatial clusters using K-Means on latitude and longitude coordinates.
  2. For each validation fold, calculates the cluster centroid.
  3. Enforces a **$\ge 50\text{km}$ buffer zone** exclusion around the validation centroid, completely isolating training points from validation points.

$$\text{Distance}(\mathbf{x}_{\text{train}}, \mathbf{c}_{\text{val\_centroid}}) \ge 50\text{ km}$$

---

### 3.4 Missing-Day Persistence Normalization
In real-world operations, satellite sensors have temporal coverage gaps (e.g. 11 missing observation days in a 90-day window). A static division by 90 produces spuriously low persistence scores:
$$\text{persistence\_90d\_norm} = \frac{\text{persistence\_90d}}{\text{observed\_days\_in\_90d}}$$
This ensures fair, unskewed temporal persistence scores even during sensor blackout periods.

---

### 3.5 The 6 NTRO Target Classes

1. **`Wildfire`**: High Fire Radiative Power (FRP), high brightness, high forest canopy cover, isolated from road networks, short 90-day persistence.
2. **`Agricultural Burn`**: Moderate brightness/FRP, farmland land-use, near rural roads, low seasonal persistence.
3. **`Industrial/Gas Flare`**: High 90-day persistence ($\ge 75$ days of heat), high FRP, zero canopy, industrial land-use.
4. **`Mining Activity`**: Repetitive persistence, bare ground / open pit terrain, high heat from machinery and slag.
5. **`Urban/Infrastructure`**: Moderate heat, dense road proximity, commercial or residential land cover.
6. **`False Positive/Noise`**: Low FRP, near water bodies or wetlands, high reflectance / cloud edge artifacts.

---

## 4. Data Layer & DuckDB H3 Feature Store

To achieve $<50\text{ms}$ total inference latency, spatial joins (e.g., calculating distance to water, roads, and land cover) are **never computed synchronously during inference**.

* **The Feature Store (`app/services/feature_store.py`):**
  * Powered by **DuckDB**, an embeddable, in-process columnar analytical database.
  * Stores pre-computed spatial vectors keyed by `h3_index`.
  * **Table Schema (`h3_spatial_context`):**
    * `h3_index` (VARCHAR, Primary Key)
    * `landuse_tag` (VARCHAR)
    * `canopy_cover_pct` (DOUBLE)
    * `distance_to_road_km` (DOUBLE)
    * `distance_to_water_km` (DOUBLE)
    * `updated_at` (TIMESTAMP)
  * Point lookups execute in **$<5\text{ms}$**.

---

## 5. Defense-Grade Explainability (SHAP) & Immutable Audit Trail

### 5.1 On-Demand SHAP TreeExplainer Engine
Black-box AI is unacceptable in defense contexts. CatBoost integrates with **TreeSHAP** to calculate exact game-theoretic Shapley values:
$$\phi_i = \sum_{S \subseteq F \setminus \{i\}} \frac{|S|!(|F| - |S| - 1)!}{|F|!} \left( f(S \cup \{i\}) - f(S) \right)$$
* **On-Demand Flow:** SHAP computation is triggered only when an analyst clicks on a specific hotspot (`POST /api/v1/explain`), ensuring background inference threads remain unblocked.

### 5.2 Append-Only NTRO Audit Trail
When an intelligence analyst overrides a model classification, the decision must have an immutable chain of custody:
* **Table Schema (`ntro_audit_trail`):**
  * `event_id`: Unique identifier (e.g. `AUDIT-EVT-4A7BC892E10F`)
  * `timestamp`: ISO-8601 UTC with microsecond precision
  * `hotspot_id`: Target FIRMS detection ID
  * `analyst_id`: Authenticated defense analyst identifier
  * `original_prediction`: Model's assigned class
  * `override_class`: Analyst's corrected class
  * `justification`: Mandatory forensic reasoning (e.g., optical satellite cross-verification)
  * `confidence_rating`: 1 to 5 analyst confidence score

---

## 6. Resilience & Defensive Architecture (5 Failure Modes)

| Failure Scenario | Risk | Implemented Defense Mitigation |
| :--- | :--- | :--- |
| **1. NASA API Blackout** | Upstream API is rate-limited or goes offline during demo/operation. | Fallback synthetic & cached historical CSV ingestion stream generator (`data/mock_generator.py`). |
| **2. "Zoom Out" Browser Crash** | Large bounding-box queries serialize millions of points, crashing browser DOM. | Viewport Culling API (`/api/v1/spatial/viewport`) automatically switches to aggregated macro mode if bounding box exceeds $20^\circ \times 20^\circ$. |
| **3. SHAP Latency Spike** | Computing global SHAP on thousands of points freezes CPU. | Strictly enforced on-demand per-instance explanation (`POST /api/v1/explain`). |
| **4. WebGL Context Loss** | Client GPU running out of VRAM. | Viewport data limits capped to 500 hexagons per request; frontend fallback instructions provided. |
| **5. NASA Schema Drift** | Upstream API changes column names or injects malformed data. | Strict Pydantic validation at `/api/v1/ingest/batch`. Malformed rows are routed to the **Dead-Letter Queue (DLQ)** without failing valid records. |

---

## 7. Directory Structure & Code Walkthrough

```text
SIH-BACKEND/
├── app/
│   ├── api/
│   │   ├── endpoints/
│   │   │   ├── classify.py          # Real-time inference & SHAP explanation endpoints
│   │   │   ├── ingest.py            # Async batch ingestion gateway with DLQ
│   │   │   ├── spatial.py           # Viewport-culling spatial query for Deck.gl
│   │   │   └── audit.py             # NTRO immutable audit trail logging & retrieval
│   │   └── api_router.py            # Central FastAPI router
│   ├── core/
│   │   └── config.py                # Global settings, class names, feature definitions
│   ├── schemas/
│   │   ├── firms.py                 # Pydantic schema for NASA FIRMS records & DLQ responses
│   │   ├── prediction.py            # Output schemas for predictions & SHAP explanations
│   │   └── audit.py                 # Schemas for analyst overrides and audit logs
│   ├── services/
│   │   ├── feature_store.py         # DuckDB H3 columnar feature store service
│   │   ├── model_service.py         # CatBoost model loader, inference & SHAP engine
│   │   └── audit_service.py         # Append-only audit logger service
│   └── main.py                      # FastAPI app entrypoint, CORS & lifespan hooks
├── pipeline/
│   ├── feature_engineering.py       # H3 hex conversion & persistence normalization
│   ├── spatial_cv.py                # SpatialKFold cross-validation splitter (50km buffer)
│   └── train_catboost.py            # Model training pipeline with SCV evaluation
├── data/
│   ├── sample_firms.csv             # Synthetic 2500-sample benchmark dataset
│   ├── catboost_hotspot_model.cbm   # Serialized trained CatBoost model artifact
│   ├── feature_store.duckdb         # Pre-computed DuckDB spatial context database
│   └── audit_log.duckdb             # Append-only NTRO audit database
├── tests/
│   └── test_backend.py              # Pytest automated test suite (7 comprehensive tests)
├── requirements.txt                 # Python dependencies
├── FRONTEND_INTEGRATION_GUIDE.md    # Frontend team quickstart and fetch examples
└── README.md                        # Master documentation manual
```

---

## 8. Complete API Specification

Base URL: `http://localhost:8000/api/v1`

### 1. `POST /classify`
* **Purpose:** Real-time classification of a single FIRMS detection in $<50\text{ms}$.
* **Request:**
```json
{
  "hotspot_id": "FIRMS-IND-1001",
  "latitude": 22.05,
  "longitude": 79.12,
  "brightness": 360.5,
  "scan": 0.4,
  "track": 0.4,
  "acq_date": "2026-08-20",
  "acq_time": "1345",
  "satellite": "SNPP",
  "confidence": 95.0,
  "bright_t31": 305.0,
  "frp": 85.5,
  "daynight": "D",
  "persistence_90d": 4,
  "observed_days_in_90d": 85
}
```
* **Response (200 OK):**
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

### 2. `POST /explain`
* **Purpose:** On-demand SHAP local feature attribution breakdown for popup cards.
* **Response (200 OK):**
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

### 3. `POST /audit/override`
* **Purpose:** Submit analyst override decision to the immutable audit database.
* **Request:**
```json
{
  "hotspot_id": "FIRMS-IND-1001",
  "analyst_id": "NTRO_OFFICER_409",
  "original_prediction": "Wildfire",
  "override_class": "Industrial/Gas Flare",
  "justification": "Verified oil refinery gas flare via high-resolution optical imagery cross-reference.",
  "confidence_rating": 5
}
```

---

### 4. `GET /spatial/viewport`
* **Purpose:** Viewport-culling bounding box query for Deck.gl map rendering.
* **Query Params:** `min_lat`, `max_lat`, `min_lon`, `max_lon`, `zoom`, `limit`.

---

### 5. `POST /ingest/batch`
* **Purpose:** Bulk ingestion with Pydantic validation & Dead-Letter Queue (DLQ) quarantine.

---

## 9. Quickstart & Verification Guide

### 1. Setup Python Environment & Install Dependencies
```powershell
pip install -r requirements.txt
```

### 2. Train CatBoost Model with Spatial Cross-Validation
```powershell
python pipeline/train_catboost.py
```

### 3. Run Automated Tests
```powershell
python -m pytest tests/test_backend.py
```
*(All 7 unit and integration tests will pass)*

### 4. Start the FastAPI Server
```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 5. Open Interactive Documentation
* **Swagger UI:** [http://localhost:8000/docs](http://localhost:8000/docs)
* **ReDoc:** [http://localhost:8000/redoc](http://localhost:8000/redoc)
