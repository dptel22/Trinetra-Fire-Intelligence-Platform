# Backend — SIH 2026 PS26162

**The FastAPI backend lives at the repo root in `app/`, not in this folder.**

```text
app/
├── main.py                 # FastAPI entrypoint
├── core/config.py          # Model + data path settings
├── api/endpoints/          # Route handlers
├── services/               # Feature store, model, audit
└── schemas/                # Pydantic response models
```

## Run locally

```powershell
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Deploy

Use the root `Dockerfile` (not this directory):

```powershell
docker build -t sih2026-backend .
docker run -p 8000:8000 sih2026-backend
```

See `BACKEND_DOCUMENTATION.md` for the canonical API contract.
