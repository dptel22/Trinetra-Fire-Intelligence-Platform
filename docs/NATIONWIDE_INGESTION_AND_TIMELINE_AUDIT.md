# Audit & Improvement Plan: Timeline Service, Land-Use Context, and Nationwide Ingestion (28 States + 8 UTs)

**Document:** `docs/NATIONWIDE_INGESTION_AND_TIMELINE_AUDIT.md`  
**Date:** 2026-09-19  
**Status:** In Progress / Implementation Ready  

---

## 1. Executive Summary & Problem Breakdown

During interactive testing and analyst review, three interrelated issues were identified:

1. **Timeline 503 Error on Hex Inspector**:
   - **Symptom**: `Failed to fetch timeline for <h3_index>: HTTP 503`.
   - **Root Cause**: Backend `/cells/{h3_index}/timeline` checks for pre-computed parquet layers (`h3_timeline_daily.parquet`, `monthly`, `yearly`) in `data/processed/timeline/`. When these files or their manifest are missing, it checks `settings.timeline_allow_fallback()`. Because `TIMELINE_ALLOW_FALLBACK` is `0` by default in `.env`, the endpoint fails closed with a `503 Service Unavailable` (`TimelineMaterializationError`).
   - **Solution**: 
     - Configure `TIMELINE_ALLOW_FALLBACK=1` in `.env` so local dev and live serving gracefully fall back to raw `h3_daily` records.
     - Materialize the timeline parquet layers in `data/processed/timeline/` using `pipeline/timeline_materializer.py` / `scripts/build_timeline.py`.

2. **Misleading Historical Land-Use Context Copy**:
   - **Symptom**: `Historical Land-Use Context: Cannot check historical land use in this environment`.
   - **Root Cause**: In `frontend/src/components/HexInspectorPanel.jsx:418`, when `timeline?.context?.historical_context_available !== true` (which is always `False` in the backend by design, because OSM and WRI represent present-day snapshot layers, not multi-year historical land-use ground truth), the UI renders an error-like phrase `"Cannot check historical land use in this environment"`.
   - **Solution**: Update copy to clear, model-honest explanation: `"Historical OSM/WRI land-use evidence unavailable; showing present-day context only."`

3. **Ingestion Provenance & Nationwide 36 Administrative Entities (28 States + 8 Union Territories)**:
   - **Symptom**: Ingestion provenance reported `"18 states/UTs represented by detections · 0 outside-India detections rejected · 0 rows outside the validated 10-state training geography (analyst review required). States/UTs with no satellite detections are omitted; this is nationwide inference, not nationwide validation."`
   - **Confusion**: The user noted that India consists of **28 self-governing States** and **8 Union Territories** (total 36 entities) and requested ensuring complete ingestion awareness and clarity across the system.
   - **Root Cause & Facts**:
     - The spatial boundary mask (`India_State_Boundary.shp`) already covers the entire landmass of India with 37 shapes mapped to all **36 unique Indian States and Union Territories**.
     - Runtime inference is already **nationwide (all-India)**. Detections outside the 10 training states are served with an analyst review flag (`outside_training_geography`).
     - On any single day (e.g., 2026-09-19), VIIRS satellite thermal sensors detect fire anomalies in a subset of states (18 on that day). The remaining 18 States/UTs had **zero fire detections** on that satellite pass.
     - However, the UI provenance and state filtering need to explicitly communicate that the system monitors all **36 administrative entities (28 States + 8 UTs)** nationwide, and explain that "18 states/UTs" refers to *active fire hotspots detected today*, not the ingestion scope.

---

## 2. Comprehensive Inventory of Codebase Places Checked

### A. Timeline & Recent Thermal History
| File | Lines Checked | Finding / Role | Action Needed |
|---|---|---|---|
| `app/api/endpoints/timeline.py` | 18–63 | Handles `GET /cells/{h3_index}/timeline`. Catches `TimelineMaterializationError` and raises HTTP 503. | Retain fail-closed design; test with fallback and materialized layers. |
| `app/services/timeline_service.py` | 40–120, 265–335 | Resolves materialization; if missing and fallback disabled, raises `TimelineMaterializationError`. Provides `context.historical_context_available = False`. | Verified backend contract. |
| `pipeline/timeline_materializer.py` | 1–53 | Materializes `h3_timeline_daily.parquet`, `monthly`, `yearly` and writes `materialization_manifest.json`. | Run materializer to build layers in `data/processed/timeline`. |
| `scripts/build_timeline.py` | 1–27 | CLI wrapper for `build_materialized_layers()`. | Can be invoked to refresh timeline data. |
| `.env` | 1–48 | Currently lacks `TIMELINE_ALLOW_FALLBACK=1`. | Add `TIMELINE_ALLOW_FALLBACK=1`. |
| `frontend/src/services/api.js` | 980–1060 | `fetchTimeline()` makes GET to `/cells/{h3_index}/timeline`. Handles mock fallback. | Verified frontend contract. |

### B. Historical Land-Use Context & Inspector UX
| File | Lines Checked | Finding / Role | Action Needed |
|---|---|---|---|
| `frontend/src/components/HexInspectorPanel.jsx` | 411–421 | Line 418: `<div ...>Cannot check historical land use in this environment</div>` | Change text to: `"Historical OSM/WRI land-use evidence unavailable; showing present-day context only."` |
| `frontend/src/components/HexInspectorPanel.jsx` | 400–410 | Line 407: `"Thermal evidence only. Current OSM/WRI context is not historical land-use evidence."` | Retain, matches model honesty guidelines. |
| `docs/archive/internal/FRONTEND_HISTORICAL_AUDIT_PLAN.md` | 99–103 | Item 6: "Historical land-use context text is confusing... Fix: phrase as 'Historical OSM/WRI land-use evidence unavailable; showing present-day context only.'" | Confirms plan alignment. |

### C. Nationwide Ingestion & 28 States + 8 Union Territories
| File | Lines Checked | Finding / Role | Action Needed |
|---|---|---|---|
| `ingestion/osm_wri_load.py` | 50–90, 429–465 | `load_state_polygons()` asserts `len({name for name, _ in out_4326}) == 36`. Uses `STATE_NAME_FIXES` to map 37 shapefile records to 36 unique entities. | Verify that all 28 states + 8 UTs are represented in the 36 entities. Add canonical roster constant. |
| `app/core/config.py` | 230–245 | `TRAINING_GEOGRAPHY_STATES` contains 10 validated states. Detections in other 26 states/UTs get caveat flag. | Document the separation between 10-state training benchmark and 36-entity nationwide serving. |
| `ingestion/run_ingestion.py` | 10–30, 150–175 | Line 167: surfaces `states_served` as `"all-India bbox; {states_served} states/UTs represented by detections"`. | Clarify terminology: `{states_served} of 36 States/UTs with active detections`. |
| `frontend/src/components/FireMapPage.jsx` | 650–666 | Line 659: `"Ingestion provenance: {ingestionInfo.states_served ?? '—'} states/UTs represented by detections..."` | Update copy to clarify "out of 36 States & UTs nationwide". |
| `frontend/src/components/FireAlertsPage.jsx` | 1016–1022 | `availableIndianStates` populates from batch. | Add support for displaying state names clearly and showing full nationwide awareness. |
| `frontend/src/services/api.js` | Top / Constants | Lacks exported list of all 28 States and 8 Union Territories. | Add canonical `INDIAN_STATES_AND_UTS` roster (28 states + 8 UTs) for UI and filter consistency. |

---

## 3. Official Administrative Roster: 28 States & 8 Union Territories

### 28 Self-Governing States
1. Andhra Pradesh
2. Arunachal Pradesh
3. Assam
4. Bihar
5. Chhattisgarh (normalized from "Chhattishgarh")
6. Goa
7. Gujarat
8. Haryana
9. Himachal Pradesh
10. Jharkhand
11. Karnataka
12. Kerala
13. Madhya Pradesh
14. Maharashtra
15. Manipur
16. Meghalaya
17. Mizoram
18. Nagaland
19. Odisha (Orissa)
20. Punjab
21. Rajasthan
22. Sikkim
23. Tamil Nadu (normalized from "Tamilnadu")
24. Telangana (normalized from "Telengana")
25. Tripura
26. Uttar Pradesh
27. Uttarakhand (Uttaranchal)
28. West Bengal

### 8 Union Territories
1. Andaman and Nicobar Islands
2. Chandigarh
3. Dadra and Nagar Haveli and Daman and Diu (merged entity)
4. Delhi (National Capital Territory of Delhi)
5. Jammu and Kashmir
6. Ladakh
7. Lakshadweep
8. Puducherry (Pondicherry)

**Total Nationwide Coverage: 36 Administrative Entities.**

---

## 4. Step-by-Step Implementation Tasks

### Task 1: Fix Timeline 503 Error
1. **Update `.env`**: Add `TIMELINE_ALLOW_FALLBACK=1` so development and production environments never crash with 503 if pre-computed rollups are rebuilding.
2. **Build Materialized Layers**: Execute `pipeline/timeline_materializer.py` using existing daily features to generate `h3_timeline_daily.parquet`, `h3_timeline_monthly.parquet`, `h3_timeline_yearly.parquet`, and `materialization_manifest.json` in `data/processed/timeline/`.
3. **Verify**: Test `GET /api/v1/cells/8860927337fffff/timeline?granularity=day` and `granularity=month` to verify HTTP 200 responses.

### Task 2: Fix Historical Land-Use Context Copy in HexInspectorPanel.jsx
1. **Edit `HexInspectorPanel.jsx`**:
   - Replace `"Cannot check historical land use in this environment"` with:
     `"Historical OSM/WRI land-use evidence unavailable; showing present-day context only."`
2. **Verify**: Ensure the panel renders cleanly and informs analysts about evidence vintage without alarming error messages.

### Task 3: Nationwide Coverage & Administrative Roster (36 Entities)
1. **Centralize Roster in `frontend/src/services/api.js`**:
   - Export `INDIAN_STATES` (28 states), `INDIAN_UTS` (8 union territories), and `ALL_INDIA_ADMIN_ENTITIES` (36 total).
2. **Improve Ingestion Provenance Clarity in `FireMapPage.jsx`**:
   - Update provenance text to:
     `"Ingestion provenance: {ingestionInfo.states_served ?? '—'} of 36 States/UTs with active detections · {ingestionInfo.outside_india_rejected ?? 0} outside-India detections rejected · {ingestionInfo.outside_training_geography_rows ?? 0} rows outside the validated 10-state training geography (analyst review required). States/UTs with no satellite detections have zero thermal hotspots today; monitoring is nationwide across all 28 States and 8 Union Territories."`
3. **Improve State Filtering in `FireAlertsPage.jsx` and `ArchivePage.jsx`**:
   - Ensure the dropdown indicates `All States & UTs (36)` and displays state counts accurately.

---

## 5. Verification Plan
- **Backend**: Run timeline tests (`pytest tests/test_timeline_service.py tests/test_timeline_endpoint.py`).
- **Frontend**: Run `npm run lint` (`oxlint`) and `npm run build` in `frontend/`.
- **Live Integration**: Check timeline endpoint response and inspect UI elements.
- **Log**: Append changes to `AGENT_LOG.md`.
