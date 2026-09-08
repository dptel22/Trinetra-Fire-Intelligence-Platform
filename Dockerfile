# PS26162 Backend image. Runtime paths are configurable via env vars.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
# Dev-only deps (pytest/httpx/ruff) are installed to keep one pinned file,
# then pruned in the SAME layer so the runtime image stays lean.
RUN pip install --no-cache-dir -r requirements.txt \
    && pip uninstall -y pytest httpx ruff 2>/dev/null; true

COPY app ./app
COPY pipeline ./pipeline
# The startup hook imports ingestion.run_ingestion — without this COPY the
# import fails silently (caught and logged), and live ingestion stays
# permanently off inside the container.
COPY ingestion ./ingestion
COPY models/PS26162_catboost_final/inference_bundle ./models/PS26162_catboost_final/inference_bundle

ENV MODEL_PATH=/app/models/PS26162_catboost_final/inference_bundle/catboost_hotspot_classifier.cbm
ENV H3_DAILY_PARQUET=/data/sih2026_h3_daily_features_firms.parquet
ENV OSMWRI_PARQUET=/data/sih2026_h3_daily_features_with_osm_wri.parquet
ENV DUCKDB_PATH=/data/feature_store.duckdb
ENV H3_RESOLUTION=8

COPY data/processed/sih2026_h3_daily_features_firms.parquet /data/
COPY data/processed/sih2026_h3_daily_features_with_osm_wri.parquet /data/

EXPOSE 8000

# Bootstrap: seed the writable volume's parquets from the baked-in /data copy
# on first boot (so a fresh volume boots green), then run uvicorn. Subsequent
# boots keep whatever live ingestion last wrote to the volume.
CMD ["sh", "-c", "mkdir -p /data_writable && for f in /data/*.parquet; do [ -f \"$f\" ] && cp -n \"$f\" /data_writable/ || true; done; exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
