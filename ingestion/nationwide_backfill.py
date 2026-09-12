"""Nationwide FIRMS archive backfill: archive-first ingestion with NRT fill.

Reads the two local VIIRS archive products plus their NRT companions, keeps
NRT rows only for dates the archive does not cover (per satellite), and
reuses the Step-1 harmonization/aggregate/materializer stack.

Memory-bounded: each source file is read, renamed, validated, harmonized and
reduced to the aggregation columns INDEPENDENTLY (peak ≈ one file), then the
reduced frames are combined for aggregation. All artifacts go to a staging
directory; promotion to the serving timeline dir happens only after
`pipeline.timeline_validation` passes.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import pandas as pd

from ingestion.aggregate import build_daily_frame
from ingestion.firms_pull import harmonize_points
from ingestion.historical_backfill import _sha256, validate_historical_points
from pipeline.timeline_materializer import build_materialized_layers

logger = logging.getLogger(__name__)

ARCHIVE_GLOB = "fire_archive_*.csv"
NRT_GLOB = "fire_nrt_*.csv"
DEDUP_COLS = ["latitude", "longitude", "acq_date", "acq_time", "satellite"]
ARCHIVE_RENAMES = {"brightness": "bright_ti4", "bright_t31": "bright_ti5", "type": "fire_type"}

# Columns kept after per-file harmonization; everything else is dropped to
# bound memory before the per-file frames are combined.
AGG_COLUMNS = [
    "latitude", "longitude", "acq_date", "acq_time", "satellite", "confidence",
    "daynight", "bright_ti4", "frp", "scan", "track", "is_static_land", "is_offshore",
]


def _provenance_row(path: Path, role: str, raw: pd.DataFrame) -> dict[str, Any]:
    conf = raw["confidence"].astype(str).value_counts().to_dict() if "confidence" in raw else {}
    return {
        "file": path.name,
        "role": role,
        "row_count": int(len(raw)),
        "original_confidence_mix": {k: int(v) for k, v in conf.items()},
        "sha256": _sha256(path),
    }


def _load_and_reduce(path: Path, role: str) -> tuple[pd.DataFrame, dict[str, Any], dict[str, Any]]:
    """One file: read -> rename -> validate -> harmonize -> reduce.

    Returns (reduced harmonized frame, raw provenance, dedup accounting)."""
    raw = pd.read_csv(path)
    raw = raw.rename(columns={k: v for k, v in ARCHIVE_RENAMES.items() if k in raw.columns})
    validation = validate_historical_points(raw)
    prov = {**_provenance_row(path, role, raw),
            "date_start": validation["date_start"], "date_end": validation["date_end"]}
    logger.info("%s %s: %d rows %s..%s", role, path.name, validation["raw_rows"],
                validation["date_start"], validation["date_end"])

    per_satellite = {
        str(sat): {
            "raw_rows": int(len(group)),
            "duplicate_candidates": int(group.duplicated(DEDUP_COLS).sum()),
        }
        for sat, group in raw.groupby("satellite")
    }
    harmonized = harmonize_points(raw)
    del raw
    # Dedup is per-satellite by construction; a residual duplicate here means
    # the key is not unique and downstream provenance would be ambiguous.
    residual_dupes = int(harmonized.duplicated(DEDUP_COLS).sum())
    if residual_dupes:
        harmonized = harmonized.drop_duplicates(subset=DEDUP_COLS, keep="first")
    dedup = {
        "per_satellite": per_satellite,
        "rows_removed_by_harmonization": int(validation["raw_rows"] - len(harmonized) - residual_dupes),
        "residual_duplicates_dropped": residual_dupes,
        "dedup_key_unique": True,  # guaranteed by the drop above; asserted by the validator
        "normalized_confidence_mix": {
            k: int(v) for k, v in harmonized["confidence"].astype(str).value_counts().to_dict().items()
        },
    }

    harmonized["_source_file"] = path.name
    reduced = harmonized[[c for c in AGG_COLUMNS if c in harmonized.columns] + ["_source_file"]]
    return reduced, prov, dedup


def load_nationwide_points(
    input_dirs: list[str | Path],
) -> tuple[pd.DataFrame, list[dict[str, Any]], dict[str, Any]]:
    """Archive files first; NRT rows kept only for (satellite, date) pairs the
    archive product for that satellite does not already cover.

    Returns (harmonized points with _source_file, per-file provenance, dedup
    accounting)."""
    # Pass 1: lightweight raw reads to learn archive (satellite, date) coverage.
    archive_dates: set[tuple[str, str]] = set()
    plans: list[tuple[Path, str]] = []
    for input_dir in map(Path, input_dirs):
        for path in sorted(input_dir.rglob(ARCHIVE_GLOB)):
            plans.append((path, "archive"))
        for path in sorted(input_dir.rglob(NRT_GLOB)):
            plans.append((path, "nrt"))
    if not plans:
        raise FileNotFoundError(f"No FIRMS archive/NRT CSVs found under {input_dirs}")
    for path, role in plans:
        if role == "archive":
            probe = pd.read_csv(path, usecols=["satellite", "acq_date"])
            archive_dates.update(zip(probe["satellite"].astype(str), probe["acq_date"].astype(str)))
            del probe

    frames: list[pd.DataFrame] = []
    provenance: list[dict[str, Any]] = []
    dedup: dict[str, Any] = {}
    for path, role in plans:
        reduced, prov, file_dedup = _load_and_reduce(path, role)
        if role == "nrt":
            probe = reduced[["satellite", "acq_date"]].copy()
            probe["acq_date"] = probe["acq_date"].astype(str)
            kept_mask = ~pd.Series(
                list(zip(probe["satellite"], probe["acq_date"])), index=probe.index
            ).isin(archive_dates)
            dropped = int((~kept_mask).sum())
            kept = int(kept_mask.sum())
            prov["rows_kept_after_archive_overlap"] = kept
            prov["rows_dropped_archive_overlap"] = dropped
            reduced = reduced[kept_mask]
            logger.info("nrt %s: kept %d, dropped %d archive-covered", path.name, kept, dropped)
        else:
            prov["rows_kept_after_archive_overlap"] = prov["row_count"]
            prov["rows_dropped_archive_overlap"] = 0
        provenance.append(prov)
        dedup[path.name] = file_dedup
        frames.append(reduced)

    points = pd.concat(frames, ignore_index=True)
    del frames
    return points, provenance, dedup


def _point_provenance_sidecar(points: pd.DataFrame) -> pd.DataFrame:
    """Per output row (h3_08, acq_date): which source files/satellites fed it.

    Built BEFORE aggregation so the daily frame can be traced back to its
    sources. h3_08 is assigned here with the same helper the aggregator uses.
    """
    from ingestion.aggregate import assign_h3

    located = assign_h3(points)
    sidecar = located.groupby(["h3_08", "acq_date"], sort=False).agg(
        n_points=("frp", "size"),
        satellites=("satellite", lambda s: ",".join(sorted(set(s.astype(str))))),
        source_files=("_source_file", lambda s: ",".join(sorted(set(s)))),
        n_high_confidence=("confidence", lambda s: int((s == "high").sum())),
        n_nominal_confidence=("confidence", lambda s: int((s == "nominal").sum())),
    ).reset_index()
    return sidecar


def build_nationwide_backfill(input_dirs: list[str | Path], staging_dir: str | Path) -> dict[str, Any]:
    points, provenance, dedup = load_nationwide_points(input_dirs)
    total_raw = sum(p["row_count"] for p in provenance)
    logger.info("combined harmonized points: %d (raw %d)", len(points), total_raw)

    staging = Path(staging_dir)
    staging.mkdir(parents=True, exist_ok=True)

    sidecar = _point_provenance_sidecar(points)
    sidecar.to_parquet(staging / "h3_timeline_provenance_points.parquet", index=False)
    logger.info("provenance sidecar: %d cell-days", len(sidecar))
    del sidecar

    daily = build_daily_frame(points.drop(columns=["_source_file"]))
    layers = build_materialized_layers(daily, staging)

    provenance_doc = {
        "pipeline_version": "nationwide_backfill_v1",
        "sources": provenance,
        "dedup": dedup,
        "raw_rows_total": int(total_raw),
        "harmonized_rows": int(len(points)),
        "daily_rows": int(len(daily)),
        "output_layers": {name: path.name for name, path in layers.items()},
        "provenance_sidecar": "h3_timeline_provenance_points.parquet",
    }
    (staging / "timeline_provenance.json").write_text(
        json.dumps(provenance_doc, indent=2, sort_keys=True), encoding="utf-8"
    )
    daily.to_parquet(staging / "h3_timeline_daily_full.parquet", index=False)
    return provenance_doc
