# Out-of-State Model Sanity & Disclosure Verification Report (A.5)

**Date:** 2026-09-12  
**Target Architecture:** SIH 2026 PS26162 Fire Map Model Serving  
**Model Evaluated:** 55-feature CatBoost Classifier + Isotonic Calibration  

---

## 1. Mandatory Sample-Size Honesty Disclosure

> [!IMPORTANT]
> **SAMPLE SIZE NOTICE:** The current live parquet store (`data/processed/sih2026_h3_daily_features_with_osm_wri.parquet`) 
> contains **exactly 44 out-of-training cell-days** across 10 non-training states (resulting from single-day NRT spillover). 
> Specifically: **Kerala (N=5)**, **Assam (N=2)**, **Uttar Pradesh (N=2)**, Arunachal Pradesh (N=12), Haryana (N=7), 
> Odisha (N=6), West Bengal (N=4), Chhattisgarh (N=3), Himachal Pradesh (N=2), Manipur (N=1).
> 
> **These numbers are strictly anecdotal and must NOT be interpreted as rigorous population-scale validation.** 
> They serve solely to verify the mechanical integrity of the model serving pipeline, isotonic calibration behavior, 
> out-of-training disclosure flags, and automatic review triggers.

---

## 2. Executive Verification Summary

| Gate / Requirement | Invariant | Verified Value | Status |
|---|---|---|---|
| Geography Attribution | `geography == 'india_outside_training'` | 100% (44/44) | **PASS** |
| Mandatory Review Trigger | `needs_review == True` | 100% (44/44) | **PASS** |
| Geography Caveat Flag | `'Outside validated training geography' in caveat_flag` | 100% (44/44) | **PASS** |
| Score Parity Artifact | Materialized parquet table | `data/processed/out_of_state_sanity_scores.parquet` | **PASS** |

---

## 3. Predicted Class Distribution & Comparison

### Out-of-Training States (N=44)

| Predicted Class | Count | Percentage |
|---|---|---|
| `industrial` | 39 | 88.6% |
| `wildfire` | 3 | 6.8% |
| `agricultural_burn` | 2 | 4.5% |

### In-Training Baseline Distribution (Sampled N=1,000 across 10 training states)

| Class | In-Training Baseline % |
|---|---|
| `industrial` | 84.0% |
| `mining` | 8.8% |
| `wildfire` | 5.5% |
| `agricultural_burn` | 1.7% |

---

## 4. State-by-State Breakdown (Focus States: Assam, Kerala, Uttar Pradesh)

| State | Sample Count | Mean Calibrated Conf | Max Conf | Class Breakdown |
|---|---|---|---|---|
| Arunachal Pradesh | 12 | 1.000 | 1.000 | `industrial`: 10, `agricultural_burn`: 1, `wildfire`: 1 |
| **Assam** | 2 | 1.000 | 1.000 | `industrial`: 2 |
| Chhattisgarh | 3 | 1.000 | 1.000 | `industrial`: 3 |
| Haryana | 7 | 1.000 | 1.000 | `industrial`: 7 |
| Himachal Pradesh | 2 | 1.000 | 1.000 | `industrial`: 2 |
| **Kerala** | 5 | 1.000 | 1.000 | `industrial`: 2, `wildfire`: 2, `agricultural_burn`: 1 |
| Manipur | 1 | 1.000 | 1.000 | `industrial`: 1 |
| Odisha | 6 | 1.000 | 1.000 | `industrial`: 6 |
| **Uttar Pradesh** | 2 | 1.000 | 1.000 | `industrial`: 2 |
| West Bengal | 4 | 1.000 | 1.000 | `industrial`: 4 |

---

## 5. End-to-End Disclosure Verification (Pass 1 & Pass 2)

- **API Layer (`model_service.py`):**
  - Non-training state cells are automatically detected via spatial polygon / state assignment.
  - The `outside_training` flag unconditionally triggers `needs_review = True` and appends:
    `'Outside validated training geography — analyst review required.'` to the `caveat_flag`.
- **UI Layer (`HexInspectorPanel.jsx`):**
  - Verified via SSR test in `frontend/verify_disclosure_pass1.mjs` against live Kerala payload (`cell_id: 8860314ec3fffff`).
  - Confirmed that the caveat chip renders visibly on the inspector panel with the warning badge.
  - Saved rendered DOM artifact: `frontend/disclosure_pass1_dom.html`.

---

## 6. Guidance & Recommendations for Operators

1. **Never suppress the caveat:** Out-of-state thermal events lack localized OSM/WRI historical ground calibration.
2. **Analyst Review Required:** All 44 out-of-training cells were automatically routed to the review queue (`needs_review=True`).
3. **Do not use raw confidence scores:** Isotonic calibration is trained on the 10 locked states; treat probabilities on non-training states as ordinal rankings rather than calibrated probabilities.
