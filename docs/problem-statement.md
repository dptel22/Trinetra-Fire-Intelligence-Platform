# Problem Statement — SIH 2026 PS26162

## Original Problem Statement
[Paste verbatim PS26162 requirements here]

## Our Interpretation

### Core Objective
Build an end-to-end wildfire detection and alerting system using NASA FIRMS satellite data that:
1. **Ingests** real-time and historical fire detection data from VIIRS/SUOMI satellites
2. **Processes** data through a rule-based + ML pipeline to classify fire risk
3. **Serves** predictions via a REST API
4. **Visualizes** fires, risk zones, and alerts on an interactive dashboard

### Key Requirements
- **Data Source**: NASA FIRMS API (VIIRS 375m, MODIS) + local CSV archives
- **Geographic Scope**: India / South Asia (configurable)
- **Temporal Scope**: Near real-time (NRT) + historical archive (2024+)
- **Output**: Risk classification per H3 hexagon cell (high/medium/low/no fire)
- **Latency**: API < 200ms p99; Dashboard updates < 5s

### Success Criteria
- Model AUC > 0.85 on temporal holdout
- Rule-based labeling precision > 0.8 for high-risk class
- Dashboard loads in < 3s on 3G
- Zero-downtime deployments via docker-compose