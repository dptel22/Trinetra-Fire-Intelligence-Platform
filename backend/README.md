# Backend — SIH 2026 PS26162

## Tech Stack: TBD

This directory will contain the FastAPI backend service.

**Planned structure:**
```
backend/
├── src/
│   ├── main.py              # FastAPI app entry point
│   ├── config.py            # Pydantic Settings
│   ├── api/v1/              # Versioned API routes
│   │   ├── fires.py         # Fire data endpoints
│   │   ├── predictions.py   # ML prediction endpoints
│   │   ├── model.py         # Model metadata endpoints
│   │   └── alerts.py        # Alert endpoints + WebSocket
│   ├── services/            # Business logic
│   ├── models/              # Pydantic schemas
│   ├── database/            # SQLAlchemy models, migrations
│   └── ml/                  # Model loading utilities
├── tests/
├── pyproject.toml
└── Dockerfile
```

**Decisions pending:**
- Database: PostgreSQL + PostGIS vs SQLite + SpatiaLite
- Auth: JWT stub vs none for hackathon
- Real-time: WebSocket vs Server-Sent Events
- Model serving: In-process vs separate model server