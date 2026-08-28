# Documentation — SIH 2026 PS26162

## Structure
```
docs/
├── problem-statement.md      # PS26162 requirements + interpretation
├── architecture.md           # System diagram, data flow (Mermaid)
├── eda-findings.md           # Living doc: schema quirks, coverage gaps
├── decisions/                # One file per major call
│   └── 0001-model-choice.md  # XGBoost vs Isolation Forest vs RF vs SMOTE
└── demo-script.md            # Judge presentation walkthrough
```

## Decision Log Format
Each decision in `docs/decisions/`:
- Title + date
- Context / problem
- Options considered
- Decision + rationale
- Consequences / trade-offs