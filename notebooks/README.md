# Notebooks — SIH 2026 PS26162

Exploration and experimentation notebooks only. **Never imported by production code.**

## Actual structure (verified 2026-09-10)

```text
notebooks/
├── eda/
│   ├── data-eda.ipynb                        # FIRMS corpus EDA
│   ├── osi-wri-data.ipynb                    # OSM/WRI enrichment provenance
│   │                                           # (ingestion/osm_wri_load.py ports this)
│   ├── state_class_heatmap.png               # label-evidence artifact
│   ├── state_evidence_table.csv              # per-state label evidence (copied to docs/)
│   └── Jupyter Notebook — generated with runcell.pdf   # exported output (evidence record)
└── training/
    └── sih-catboost-training.ipynb           # CatBoost training provenance
```

An earlier version of this README listed `01_eda_fire_data.ipynb`,
`01_xgboost_baseline.ipynb`, and an `ml-pipeline/` promotion target, plus
notebook-era parquet artifacts in `eda/` — none of those exist in the current
tree. The notebooks above are the real ones.

## Promotion rule

Once a piece of logic works in a notebook (feature function, threshold,
training loop), it is rewritten as a module under `ingestion/` or `app/` and
the notebook stays as the record of how we got there. Real examples:
`ingestion/osm_wri_load.py` ports `eda/osi-wri-data.ipynb`; the served model
bundle comes from `training/sih-catboost-training.ipynb` (tracked at
`models/PS26162_catboost_final/`).

## Hygiene

- Strip outputs before commit: `nbstripout` or "Clear All Outputs" in Jupyter.
  CI runs an output-strip check but it is **advisory** (`continue-on-error`)
  — it will not block a merge, so do not rely on it as a gate.
- Committed output cells with images/data are the #1 cause of merge conflicts.
- Use small test datasets in notebooks; do not commit large derived parquets
  when a script can regenerate them.
