# Notebooks — SIH 2026 PS26162

Exploration and experimentation notebooks only. **Never imported by production code.**

## Structure
```
notebooks/
├── eda/              # Exploratory Data Analysis
│   └── 01_eda_fire_data.ipynb
├── experiments/      # Model experiments
│   └── 01_xgboost_baseline.ipynb
└── README.md         # This file
```

## Promotion Rule
Once a piece of logic works in a notebook (feature function, rule threshold, training loop):
1. Rewrite as a proper module in `ml-pipeline/`
2. Open a small PR to promote it
3. The notebook stays as a record of *how* you got there

## Hygiene
- Strip outputs before commit: `nbstripout` or "Clear All Outputs" in Jupyter
- Committed output cells with images/data = #1 cause of merge conflicts
- Use `data/sample/` for small test datasets in notebooks