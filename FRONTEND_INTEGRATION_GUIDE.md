# Frontend Integration Guide

## Base URLs

- API prefix: `http://localhost:8000/api/v1`
- Health: `http://localhost:8000/health`
- Root prediction alias: `http://localhost:8000/predictions`

## Classes

Render exactly these four model classes (plus `unclassified` fallback):

| Class | Suggested color |
| --- | --- |
| `industrial` | `#E67E22` |
| `mining` | `#95A5A6` |
| `agricultural_burn` | `#F1C40F` |
| `wildfire` | `#E74C3C` |
| `unclassified` | `#787878` |

## Load Map Predictions

Use the bbox endpoint when the map pans or the acquisition date changes.

```javascript
const params = new URLSearchParams({
  min_lat: "34.34",
  max_lat: "34.36",
  min_lon: "73.79",
  max_lon: "73.86",
  acq_date: "2025-01-26",
  zoom: "8"
});

const response = await fetch(`http://localhost:8000/api/v1/predictions?${params}`);
const data = await response.json();
```

Response:

```json
{
  "mode": "aggregated_macro",
  "zoom": 8,
  "total_predictions": 1,
  "predictions": [
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
      "calibrated": true,
      "needs_review": false,
      "caveat_flag": null,
      "latency_ms": 8.2
    }
  ]
}
```

## Load Detail Panel

Use this when an analyst clicks a cell:

```javascript
const detail = await fetch(
  "http://localhost:8000/predictions/88209a2011fffff?acq_date=2025-01-26"
).then((res) => res.json());
```

## Load SHAP Explanation

Call SHAP only for an opened detail panel:

```javascript
const explanation = await fetch(
  "http://localhost:8000/predictions/88209a2011fffff/explain?acq_date=2025-01-26"
).then((res) => res.json());
```

The explanation response returns only the top three feature attributions to keep the UI concise.

## Frontend Notes

- Treat `cell_id` and `h3_index` as the same H3 cell identifier for now.
- Always include `acq_date`; the model serves H3-day predictions, not timeless H3 cells.
- Display `confidence` as a 0-1 score or convert it to a percentage in the UI.
- If `predicted_class` is `unclassified`, show the configured caveat instead of forcing a class color.
- Surface `caveat_flag` near the prediction label when present.

