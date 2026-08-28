# Data — SIH 2026 PS26162

## Structure
```
data/
├── raw/              # Gitignored - FIRMS CSVs live here locally/on Kaggle
├── processed/        # Gitignored - Harmonized/merged parquet output
├── sample/           # Committed - Small samples (~500 rows) for CI/tests
└── README.md         # This file
```

## Data Sources
- **FIRMS API**: https://firms.modaps.eosdis.nasa.gov/api/area/
- **VIIRS 375m**: Suomi-NPP (S) and NOAA-20 (N) satellites
- **MODIS**: Terra (T) and Aqua (A) satellites

## CSV Files (Current)
| File | Rows | Description |
|------|------|-------------|
| `SUOMI_VIIRS_C2_South_Asia_7d.csv` | 3,215 | Recent 7-day South Asia |
| `viirs-snpp_2024_India.csv` | 552,313 | Full 2024 India (VIIRS-SNPP) |
| `fire_archive_SV-C2_793311.csv` | 534,572 | SV-C2 Archive |
| `fire_nrt_SV-C2_793311.csv` | 100,330 | SV-C2 Near Real-Time |

## Schema Harmonization Notes
- `instrument` column: only in viirs-snpp (VIIRS), infer for others
- `version`: string in SUOMI (2.0NRT), int in viirs-snpp (2)
- `type` column: only in viirs-snpp (0=vegetation, 1=other, etc.)

## Sample Data
Place small parquet samples in `data/sample/` for CI:
```bash
# Generate sample from processed data
python -c "
import pandas as pd
df = pd.read_parquet('data/processed/fires_harmonized.parquet')
df.sample(500, random_state=42).to_parquet('data/sample/fires_sample.parquet')
"
```