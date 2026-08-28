# EDA Findings — SIH 2026 PS26162

*Living document — update as exploration progresses*

## Data Overview

| Source | Rows | Date Range | Satellites | Notes |
|--------|------|------------|------------|-------|
| SUOMI_VIIRS_C2_South_Asia_7d | 3,215 | 2026-08-14 to 2026-08-20 | N (NOAA-20) | Recent 7-day |
| viirs-snpp_2024_India | 552,313 | 2024-01-01 to 2024-12-31 | N (Suomi-NPP) | Full year, has `instrument`, `type` |
| fire_archive_SV-C2_793311 | 534,572 | Various 2024 | S (Suomi-NPP) | Archive |
| fire_nrt_SV-C2_793311 | 100,330 | Recent | S (Suomi-NPP) | Near real-time |

**Total: ~1.19M rows**

## Schema Differences Across Sources

| Column | SUOMI 7d | viirs-snpp 2024 | SV-C2 Archive | SV-C2 NRT | Harmonized |
|--------|----------|-----------------|---------------|-----------|------------|
| latitude | ✓ | ✓ | ✓ | ✓ | ✓ |
| longitude | ✓ | ✓ | ✓ | ✓ | ✓ |
| bright_ti4 | ✓ | ✓ | ✓ | ✓ | ✓ |
| scan | ✓ | ✓ | ✓ | ✓ | ✓ |
| track | ✓ | ✓ | ✓ | ✓ | ✓ |
| acq_date | ✓ | ✓ | ✓ | ✓ | ✓ (date) |
| acq_time | ✓ | ✓ | ✓ | ✓ | ✓ (time) |
| satellite | ✓ | ✓ | ✓ | ✓ | ✓ |
| instrument | ✗ | ✓ (VIIRS) | ✗ | ✗ | Infer from satellite |
| confidence | ✓ | ✓ | ✓ | ✓ | ✓ (low/nominal/high) |
| version | ✓ (str) | ✓ (int) | ✓ | ✓ | ✓ (str) |
| bright_ti5 | ✓ | ✓ | ✓ | ✓ | ✓ |
| frp | ✓ | ✓ | ✓ | ✓ | ✓ |
| daynight | ✓ | ✓ | ✓ | ✓ | ✓ |
| type | ✗ | ✓ (0/1/2/3) | ✗ | ✗ | ✓ (nullable) |

### Key Harmonization Decisions
1. **`instrument`**: Infer from `satellite` column (N/S → VIIRS, T/A → MODIS)
2. **`version`**: Cast all to string (preserve "2.0NRT" format)
3. **`type`**: Nullable integer, only populated where source has it
4. **`acq_time`**: Parse HHMM int → time object, combine with acq_date for `acquired_at` UTC

## Data Quality Observations

### Confidence Distribution
```
nominal: ~65%
high: ~25%
low: ~10%
```

### FRP Distribution (Fire Radiative Power)
- Median: ~5 MW
- 95th percentile: ~150 MW
- Max: ~3000 MW (outliers - likely industrial/volcanic)

### Brightness Temperature (bright_ti4)
- Range: 250K - 450K
- Fire pixels typically > 310K
- Threshold 320K captures ~top 15% of detections

### Temporal Coverage
- 2024 data: Full year, but gaps in monsoon (cloud cover)
- 2026 data: Only 7 days (NRT)
- Need to handle seasonal bias in training

### Spatial Coverage
- India bounding box: ~68-98°E, 6-38°N
- ~50K unique H3 cells at resolution 7
- Heavy concentration in central India, Northeast, Western Ghats

## Feature Engineering Insights

### H3 Resolution Trade-offs
| Resolution | Cell Area | Cells (India) | Use Case |
|------------|-----------|---------------|----------|
| 6 | ~0.8 km² | ~12K | Too coarse |
| 7 | ~1.2 km² | ~50K | **Good default** |
| 8 | ~1.8 km² | ~200K | Fine-grained, more sparse |

### Persistence_90d
- Definition: Count of fire detections in same H3 cell within 90-day rolling window
- Distribution: Highly skewed (mostly 0-1, long tail to 50+)
- Log transform recommended: `log1p(persistence_90d)`

### History_days
- Definition: Number of unique days with ≥1 fire in cell over full history
- Correlates with persistence but captures seasonal recurrence
- Useful for distinguishing chronic vs sporadic fire zones

## Labeling Strategy

### Rule-Based Thresholds (Initial)
```
HIGH_RISK:    FRP > 40 MW AND bright_ti4 > 320K AND confidence >= nominal AND persistence_90d >= 3
MEDIUM_RISK:  (FRP > 20 MW OR bright_ti4 > 310K) AND confidence >= nominal
LOW_RISK:     confidence >= nominal
NO_FIRE:      confidence == low OR below all thresholds
```

### Class Balance (Preliminary on 2024 data)
| Label | Count | % |
|-------|-------|---|
| high_risk | ~15K | ~2.7% |
| medium_risk | ~85K | ~15% |
| low_risk | ~200K | ~36% |
| no_fire | ~250K | ~45% |

**Imbalance**: High-risk is rare (~3%). Will need class weights / focal loss / sampling strategy.

## Open Questions
1. How to handle `type` column (only in one source)? Use as feature where available, impute?
2. Satellite-specific biases? NOAA-20 vs Suomi-NPP detection efficiency?
3. Day/night detection differences? (daynight column)
4. Scan/track geometry effects on FRP/brightness?
5. Cloud cover gaps → temporal interpolation needed?