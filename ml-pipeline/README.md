# ML Pipeline — SIH 2026 PS26162

Production ML code for wildfire detection using FIRMS satellite data.

## Structure
```
ml-pipeline/
├── ingest/          # FIRMS API fetch + schema harmonization
├── features/        # H3 grid, persistence_90d, history_days
├── rules/           # Threshold-based labeling logic
├── train/           # XGBoost training script
├── src/             # Shared utilities, config, logging
└── tests/           # Unit tests
```

## Pipeline Flow
1. **Ingest**: Fetch CSVs from FIRMS API or local files → harmonize schema → output Parquet
2. **Features**: Add H3 cell indices (res 7, 8), persistence, history, temporal features
3. **Rules**: Apply threshold cascade → labels {high_risk, medium_risk, low_risk, no_fire}
4. **Train**: XGBoost on labeled data → model.xgb + metrics.json

## Key Thresholds (configurable via train/config.yaml)
- FRP > 40 MW
- Brightness (bright_ti4) > 320 K
- Confidence >= nominal
- Persistence (90-day) >= 3 fires in same H3 cell

## Running
```bash
# Install dependencies
pip install -e .

# Run full pipeline
python -m ml_pipeline.train

# Or run individual stages
python -m ml_pipeline.ingest.harmonize
python -m ml_pipeline.features
python -m ml_pipeline.rules.labeler
```

## Data Schema
See `docs/eda-findings.md` for FIRMS column details and harmonization decisions.