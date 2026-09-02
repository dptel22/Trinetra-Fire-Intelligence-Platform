# 🚀 Frontend Integration Guide & Complete API Reference
### NASA FIRMS Geospatial AI & NTRO Decision Support System

---

## 🌐 Server Info & Base URLs

* **Base API URL:** `http://localhost:8000/api/v1`
* **Health Check:** `http://localhost:8000/health`
* **Interactive Swagger UI:** [http://localhost:8000/docs](http://localhost:8000/docs)
* **ReDoc Documentation:** [http://localhost:8000/redoc](http://localhost:8000/redoc)
* **CORS:** Enabled for all origins (`*`)

---

## 🎨 Recommended UI Color Palette for the 6 Target Classes

When rendering **Deck.gl `H3HexagonLayer`** or UI tags, use these colors:

| Class Name | Hex Code | RGB (for Deck.gl) | Meaning / Context |
| :--- | :--- | :--- | :--- |
| **`Wildfire`** | `#FF3B30` | `[255, 59, 48, 200]` | High-danger forest fire |
| **`Agricultural Burn`** | `#FF9500` | `[255, 149, 0, 200]` | Seasonal crop / stubble burn |
| **`Industrial/Gas Flare`** | `#AF52DE` | `[175, 82, 222, 200]` | Refineries & chemical plants |
| **`Mining Activity`** | `#FFCC00` | `[255, 204, 0, 200]` | Open-cast blasting & mines |
| **`Urban/Infrastructure`** | `#007AFF` | `[0, 122, 255, 200]` | City & residential heat |
| **`False Positive/Noise`** | `#8E8E93` | `[142, 142, 147, 160]` | Sensor glint / cloud reflections |

---

## 📡 API Endpoints Reference

---

### 1. Viewport Culling & Map Loading (Deck.gl)

Use this when the map pans or zooms. It prevents browser DOM memory crashes by returning only hexagons in the user's viewport.

* **Method:** `GET`
* **Path:** `/api/v1/spatial/viewport`
* **Query Parameters:**
  * `min_lat` (float, required): South latitude bound (e.g. `20.0`)
  * `max_lat` (float, required): North latitude bound (e.g. `25.0`)
  * `min_lon` (float, required): West longitude bound (e.g. `75.0`)
  * `max_lon` (float, required): East longitude bound (e.g. `80.0`)
  * `zoom` (float, optional, default `8.0`): Current map zoom level
  * `limit` (int, optional, default `500`): Max number of hexagons to return

#### Example JavaScript `fetch`:
```javascript
const response = await fetch(
  `http://localhost:8000/api/v1/spatial/viewport?min_lat=20.0&max_lat=25.0&min_lon=75.0&max_lon=80.0&zoom=8`
);
const data = await response.json();
console.log(data.hexagons); // Pass directly to Deck.gl H3HexagonLayer data
```

#### Example Response:
```json
{
  "mode": "detailed_hexagons",
  "zoom": 8.0,
  "total_hexagons": 2,
  "hexagons": [
    {
      "h3_index": "88609b49b3fffff",
      "landuse_tag": "forest",
      "canopy_cover_pct": 82.5,
      "distance_to_road_km": 14.2,
      "distance_to_water_km": 8.1
    },
    {
      "h3_index": "88609b49b1fffff",
      "landuse_tag": "farmland",
      "canopy_cover_pct": 12.0,
      "distance_to_road_km": 1.2,
      "distance_to_water_km": 4.5
    }
  ]
}
```

---

### 2. Real-Time Hotspot Classification

Classifies a single NASA FIRMS detection in **$<50\text{ms}$** with full class probability distribution.

* **Method:** `POST`
* **Path:** `/api/v1/classify`
* **Headers:** `Content-Type: application/json`

#### Request Payload:
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

#### Example Response:
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

### 3. On-Demand SHAP Explainability (Pop-up Driver Breakdown)

Call this when an analyst clicks on a specific hotspot to inspect **why** the AI made this decision.

* **Method:** `POST`
* **Path:** `/api/v1/explain`
* **Headers:** `Content-Type: application/json`

#### Request Payload:
*(Same object as `/api/v1/classify`)*

#### Example Response:
```json
{
  "hotspot_id": "FIRMS-IND-1001",
  "predicted_class": "Wildfire",
  "base_value": -0.8421,
  "feature_attributions": [
    {
      "feature_name": "canopy_cover_pct",
      "feature_value": "82.5",
      "shap_value": 1.4821,
      "contribution": "Increases Risk"
    },
    {
      "feature_name": "frp",
      "feature_value": "85.5",
      "shap_value": 1.1205,
      "contribution": "Increases Risk"
    },
    {
      "feature_name": "landuse_tag",
      "feature_value": "forest",
      "shap_value": 0.9412,
      "contribution": "Increases Risk"
    },
    {
      "feature_name": "distance_to_road_km",
      "feature_value": "14.2",
      "shap_value": 0.451,
      "contribution": "Increases Risk"
    }
  ],
  "summary_statement": "This thermal anomaly was classified as 'Wildfire' primarily driven by: canopy_cover_pct (82.5), frp (85.5), landuse_tag (forest)."
}
```

---

### 4. Submit Analyst Override (NTRO Audit Trail)

Call this when a human analyst disagrees with the AI and submits a manual correction with defense justification.

* **Method:** `POST`
* **Path:** `/api/v1/audit/override`
* **Headers:** `Content-Type: application/json`

#### Request Payload:
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

#### Example Response:
```json
{
  "event_id": "AUDIT-EVT-4A7BC892E10F",
  "timestamp": "2026-08-28T17:35:12.458921+00:00",
  "hotspot_id": "FIRMS-IND-1001",
  "analyst_id": "NTRO_OFFICER_409",
  "original_prediction": "Wildfire",
  "override_class": "Industrial/Gas Flare",
  "justification": "Verified oil refinery gas flare via high-resolution optical imagery cross-reference.",
  "confidence_rating": 5
}
```

---

### 5. Fetch Audit Trail Logs

Call this to render an immutable audit history table on your dashboard.

* **Method:** `GET`
* **Path:** `/api/v1/audit/logs?limit=50`

#### Example Response:
```json
{
  "total_logs": 1,
  "logs": [
    {
      "event_id": "AUDIT-EVT-4A7BC892E10F",
      "timestamp": "2026-08-28T17:35:12.458921+00:00",
      "hotspot_id": "FIRMS-IND-1001",
      "analyst_id": "NTRO_OFFICER_409",
      "original_prediction": "Wildfire",
      "override_class": "Industrial/Gas Flare",
      "justification": "Verified oil refinery gas flare via high-resolution optical imagery cross-reference.",
      "confidence_rating": 5
    }
  ]
}
```

---

### 6. Batch NASA FIRMS Ingestion (with Dead-Letter Queue)

Use this when uploading a batch of NASA records (or CSV converted to JSON array). Any invalid rows are automatically quarantined to the DLQ rather than failing the whole batch.

* **Method:** `POST`
* **Path:** `/api/v1/ingest/batch`
* **Headers:** `Content-Type: application/json`

#### Request Payload:
```json
[
  {
    "hotspot_id": "FIRMS-01",
    "latitude": 22.0,
    "longitude": 79.0,
    "brightness": 340.0,
    "scan": 0.5,
    "track": 0.5,
    "acq_date": "2026-08-20",
    "acq_time": "1200",
    "satellite": "SNPP",
    "confidence": 90.0,
    "bright_t31": 295.0,
    "frp": 45.0,
    "daynight": "D"
  }
]
```

#### Example Response:
```json
{
  "total_received": 1,
  "total_valid": 1,
  "total_quarantined_dlq": 0,
  "message": "Ingested 1 valid records. Quarantined 0 records into DLQ.",
  "quarantined_errors": []
}
```

---

## 🛠️ Frontend Integration Best Practices

1. **Deck.gl H3 Layer Binding:**
   Bind the hexagon index using `getHexagon: d => d.h3_index` and set colors dynamically using the palette above.
2. **On-Demand SHAP Calls:**
   Only call `/api/v1/explain` inside the `onClick` handler of a hexagon to keep map interactions silky-smooth (60 FPS).
3. **Viewport Debouncing:**
   When the map pans/zooms, debounce the `/api/v1/spatial/viewport` API call by ~250ms so you don't spam the server on every frame.
