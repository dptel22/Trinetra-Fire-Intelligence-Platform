#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR"
# The maintained app lives under backend/; the top-level frontend/ is the
# legacy tree and must not be used for the demo launcher.
FRONTEND_DIR="$ROOT_DIR/frontend"
LOG_DIR="$ROOT_DIR/.demo-logs"
mkdir -p "$LOG_DIR"

INGESTION_ON_STARTUP="${INGESTION_ON_STARTUP:-1}"

if ! curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then
  (
    cd "$BACKEND_DIR"
    INGESTION_ON_STARTUP="$INGESTION_ON_STARTUP" .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
  ) >"$LOG_DIR/backend.log" 2>&1 &
  backend_pid=$!
else
  backend_pid="already-running"
fi

if ! curl -fsS http://127.0.0.1:5173/ >/dev/null 2>&1; then
  (
    cd "$FRONTEND_DIR"
    npm run dev -- --host 127.0.0.1 --port 5173
  ) >"$LOG_DIR/frontend.log" 2>&1 &
  frontend_pid=$!
else
  frontend_pid="already-running"
fi

for attempt in $(seq 1 30); do
  backend_ready=0
  frontend_ready=0
  curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1 && backend_ready=1 || true
  curl -fsS http://127.0.0.1:5173/ >/dev/null 2>&1 && frontend_ready=1 || true
  if [ "$backend_ready" -eq 1 ] && [ "$frontend_ready" -eq 1 ]; then
    break
  fi
  sleep 1
done

if ! curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then
  echo "Backend did not become healthy. See $LOG_DIR/backend.log" >&2
  exit 1
fi
if ! curl -fsS http://127.0.0.1:5173/ >/dev/null 2>&1; then
  echo "Frontend did not become ready. See $LOG_DIR/frontend.log" >&2
  exit 1
fi

echo "TRINETRA demo is ready"
echo "Frontend: http://localhost:5173"
echo "Backend:  http://localhost:8000/health"
echo "Backend PID: $backend_pid"
echo "Frontend PID: $frontend_pid"
echo "Ingestion on startup: $INGESTION_ON_STARTUP"
