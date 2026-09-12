"""Validated local FIRMS historical backfill and provenance manifest."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import pandas as pd

from ingestion.aggregate import build_daily_frame
from ingestion.firms_pull import harmonize_points
from pipeline.timeline_materializer import build_materialized_layers


REQUIRED_COLUMNS = {"latitude", "longitude", "acq_date", "acq_time", "satellite", "frp", "bright_ti4", "confidence", "daynight"}


def validate_historical_points(points: pd.DataFrame) -> dict[str, Any]:
    missing = sorted(REQUIRED_COLUMNS - set(points.columns))
    if missing:
        raise ValueError(f"Historical FIRMS input missing columns: {missing}")
    dates = pd.to_datetime(points["acq_date"], errors="raise").dt.date
    dedup_cols = ["latitude", "longitude", "acq_date", "acq_time", "satellite"]
    duplicate_candidates = int(points.duplicated(dedup_cols).sum())
    return {
        "raw_rows": int(len(points)),
        "date_start": dates.min().isoformat() if len(dates) else None,
        "date_end": dates.max().isoformat() if len(dates) else None,
        "calendar_days": int((dates.max() - dates.min()).days + 1) if len(dates) else 0,
        "satellites": sorted(points["satellite"].dropna().astype(str).unique().tolist()),
        "duplicate_candidates": duplicate_candidates,
    }


def load_historical_csvs(input_dir: str | Path) -> tuple[pd.DataFrame, list[dict[str, Any]]]:
    files = sorted(Path(input_dir).rglob("*.csv"))
    if not files:
        raise FileNotFoundError(f"No FIRMS CSV files found under {input_dir}")
    frames = []
    file_manifest = []
    for path in files:
        frame = pd.read_csv(path)
        validation = validate_historical_points(frame)
        frame["_source_file"] = path.name
        frames.append(frame)
        file_manifest.append({"file": path.name, "sha256": _sha256(path), **validation})
    return pd.concat(frames, ignore_index=True), file_manifest


def build_historical_backfill(input_dir: str | Path, output_dir: str | Path) -> dict[str, Any]:
    points, files = load_historical_csvs(input_dir)
    raw_validation = validate_historical_points(points)
    harmonized = harmonize_points(points)
    daily = build_daily_frame(harmonized)
    paths = build_materialized_layers(daily, output_dir)
    manifest = {
        "pipeline_version": "historical_backfill_v1",
        "validated": True,
        "files": files,
        "raw": raw_validation,
        "harmonized_rows": int(len(harmonized)),
        "daily_rows": int(len(daily)),
        "output_layers": {name: path.name for name, path in paths.items()},
    }
    manifest_path = Path(output_dir) / "h3_timeline_backfill_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    return manifest


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()
