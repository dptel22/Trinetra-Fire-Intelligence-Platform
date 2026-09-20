"""Build immutable FIRMS timeline parquet layers from H3-day evidence."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

from app.core.config import settings
from app.services.timeline_service import TimelineService
from pipeline.timeline_features import build_timeline_features


def build_materialized_layers(daily: pd.DataFrame, output_dir: str | Path) -> dict[str, Path]:
    if daily.empty:
        raise ValueError("Cannot materialize an empty FIRMS timeline")
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    features = build_timeline_features(daily)
    features["acq_date"] = pd.to_datetime(features["acq_date"])

    paths = {
        "daily": output / "h3_timeline_daily.parquet",
        "monthly": output / "h3_timeline_monthly.parquet",
        "yearly": output / "h3_timeline_yearly.parquet",
    }
    features.to_parquet(paths["daily"], index=False)
    for granularity in ("month", "year"):
        frame = TimelineService._period_frame(features, granularity)
        if granularity == "year":
            frame["period"] = frame["period_start"].map(lambda value: str(value.year))
        else:
            frame["period"] = frame["period_start"].map(lambda value: f"{value.year:04d}-{value.month:02d}")
        frame.to_parquet(paths["monthly" if granularity == "month" else "yearly"], index=False)

    _write_manifest(output, features, paths)
    return paths


def _write_manifest(output: Path, features: pd.DataFrame, paths: dict[str, Path]) -> Path:
    """Record provenance so the serving layer can prove freshness, not guess it."""
    manifest_path = output / settings.TIMELINE_MANIFEST_FILE
    manifest = {
        "materialization_version": settings.TIMELINE_MATERIALIZATION_VERSION,
        "materialized_at": datetime.now(UTC).isoformat(),
        "materialized_start_date": features["acq_date"].min().date().isoformat(),
        "materialized_end_date": features["acq_date"].max().date().isoformat(),
        "layers": {name: path.name for name, path in paths.items()},
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest_path
