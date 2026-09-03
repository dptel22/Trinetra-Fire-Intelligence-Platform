# PS26162 Backend image. Runtime paths are configurable via env vars.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY pipeline ./pipeline
COPY models ./models

ENV MODEL_PATH=/app/models/catboost_hotspot_classifier_v1.cbm
ENV H3_DAILY_PARQUET=/data/sih2026_h3_daily_features_firms.parquet
ENV OSMWRI_PARQUET=/data/sih2026_h3_daily_features_with_osm_wri.parquet
ENV DUCKDB_PATH=/data/feature_store.duckdb
ENV H3_RESOLUTION=8

COPY data/processed/sih2026_h3_daily_features_firms.parquet /data/
COPY data/processed/sih2026_h3_daily_features_with_osm_wri.parquet /data/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
