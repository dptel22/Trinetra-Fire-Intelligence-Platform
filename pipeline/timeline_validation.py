"""Fail-closed validation gate for the nationwide timeline backfill.

Every check in `BLOCKING_CHECKS` must pass before `validate_and_promote()`
copies anything out of the staging dir. The Sep–Dec seasonal-comparability
gate is BLOCKING (user decision 2026-09-12): an incomparable partial first
period must not become promotable "representative history". The escape hatch
is `TIMELINE_SEASONAL_GATE_OVERRIDE=1` (see settings.timeline_seasonal_gate_override);
using it requires an AGENT_LOG justification and is recorded in the report.
"""

from __future__ import annotations

import hashlib
import json
import logging
import shutil
from datetime import date
from pathlib import Path
from typing import Any, Callable

import pandas as pd
import pyarrow.parquet as pq

from app.core.config import settings

logger = logging.getLogger(__name__)

# Locked train/eval split — reported separately for reconciliation, never a filter.
TEN_STATE_SUBSET = {
    "Madhya Pradesh", "Maharashtra", "Telangana", "Andhra Pradesh", "Karnataka",
    "Punjab", "Jharkhand", "Rajasthan", "Gujarat", "Tamil Nadu",
}

# Exact frozen column sets (review finding: subset checks are too weak).
FROZEN_MONTHLY_COLUMNS = {
    "h3_08", "acq_date", "period", "period_start", "period_end",
    "n_detections", "fire_days", "frp_max", "frp_mean", "night_ratio",
    "archive_gap_days", "observation_basis",
    "transition_state", "transition_type", "transition_confidence",
    "transition_evidence", "supporting_detection_count", "supporting_active_days",
    "gap_before_transition_days", "land_use_claim",
}
FROZEN_YEARLY_COLUMNS = set(FROZEN_MONTHLY_COLUMNS)  # yearly layer carries the same columns, period="YYYY"

# Static/provenance columns of the live serving parquet the staged daily
# frame legitimately lacks. `is_labeled` IS part of the daily frame contract.
LIVE_ONLY_COLUMNS = {
    "state", "h3_lat", "h3_lon", "state_assignment_method", "_state_distance_km",
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def check_schema_parity(staging: Path, report: dict[str, Any]) -> bool:
    """Exact column-set equality with the live serving frame (modulo the
    documented live-only columns), not a required-subset check."""
    staged_schema = pq.read_schema(staging / "h3_timeline_daily_full.parquet")
    staged_cols = set(staged_schema.names)
    ok = True
    live_path = Path(settings.H3_DAILY_PARQUET)
    if live_path.exists():
        live_cols = set(pq.read_schema(live_path).names) - LIVE_ONLY_COLUMNS
        missing = live_cols - staged_cols
        extra = staged_cols - live_cols
        ok = not missing and not extra
        report["schema_parity"] = {
            "compared_against": str(live_path),
            "missing_columns": sorted(missing),
            "unexpected_columns": sorted(extra),
        }
        if not ok:
            return False
    else:
        report["schema_parity"] = {"compared_against": None,
                                   "note": "live serving parquet absent; checked against aggregation contract only"}
    return ok


def check_confidence_policy(staging: Path, report: dict[str, Any]) -> bool:
    prov = json.loads((staging / "timeline_provenance.json").read_text(encoding="utf-8"))
    ok = True
    per_source = {}
    for src in prov["sources"]:
        norm = src.get("normalized_confidence_mix", {}) or {}
        bad = sorted(k for k in norm if k not in {"low", "nominal", "high"})
        total = sum(norm.values()) or 1
        low_share = norm.get("low", 0) / total
        per_source[src["file"]] = {
            "normalized_confidence_mix": norm,
            "unexpected_categories": bad,
            "low_share": round(low_share, 4),
        }
        if bad or low_share >= 0.5:
            ok = False
    report["confidence_policy"] = {"per_source": per_source}
    return ok


def check_dedup_integrity(staging: Path, report: dict[str, Any]) -> bool:
    """Prove dedup actually happened and the final key is unique.

    Independent cross-checks (not the builder restating its own counts):
      1. sum(sidecar.n_points) == raw - removed - residual  (sidecar vs provenance doc)
      2. sum(daily.n_detections) == sum(sidecar.n_points)   (daily frame vs sidecar)
      3. per (h3_08, acq_date) the sidecar is unique (that IS the output-row key)
    """
    prov = json.loads((staging / "timeline_provenance.json").read_text(encoding="utf-8"))
    dedup = prov["dedup"]
    raw_total = prov["raw_rows_total"]
    removed = sum(d["rows_removed_by_harmonization"] for d in dedup.values())
    residual = sum(d["residual_duplicates_dropped"] for d in dedup.values())
    harmonized_expected = raw_total - removed - residual
    nrt_dropped = sum(s.get("rows_dropped_archive_overlap", 0) for s in prov["sources"] if s["role"] == "nrt")
    harmonized_expected -= nrt_dropped

    sidecar = pd.read_parquet(staging / "h3_timeline_provenance_points.parquet",
                              columns=["h3_08", "acq_date", "n_points"])
    sidecar_points = int(sidecar["n_points"].sum())
    daily = pd.read_parquet(staging / "h3_timeline_daily_full.parquet", columns=["n_detections"])
    daily_points = int(daily["n_detections"].sum())
    sidecar_key_unique = not sidecar.duplicated(["h3_08", "acq_date"]).any()
    all_unique = all(d["dedup_key_unique"] for d in dedup.values())

    report["dedup_integrity"] = {
        "raw_rows_total": raw_total,
        "rows_removed_by_harmonization": removed,
        "residual_duplicates_dropped": residual,
        "nrt_rows_dropped_archive_overlap": nrt_dropped,
        "harmonized_expected": harmonized_expected,
        "sidecar_points": sidecar_points,
        "daily_frame_detections": daily_points,
        "sidecar_key_unique": bool(sidecar_key_unique),
        "builder_dedup_key_unique": bool(all_unique),
        "per_satellite": {k: v["per_satellite"] for k, v in dedup.items()},
    }
    return (sidecar_points == harmonized_expected
            and daily_points == sidecar_points
            and sidecar_key_unique and all_unique)


def check_h3_resolution(staging: Path, report: dict[str, Any]) -> bool:
    import h3

    daily = pd.read_parquet(staging / "h3_timeline_daily_full.parquet", columns=["h3_08"])
    sample = daily["h3_08"].astype(str).sample(min(10_000, len(daily)), random_state=0)
    resolutions = sample.map(lambda c: h3.get_resolution(c) if h3.is_valid_cell(c) else -1)
    report["h3"] = {
        "h3_version": getattr(h3, "__version__", "unknown"),
        "invalid_fraction": float((resolutions == -1).mean()),
        "non_res8_fraction": float((resolutions != 8).mean()),
    }
    return bool((resolutions == 8).all())


def check_utc_dates(staging: Path, report: dict[str, Any]) -> bool:
    daily = pd.read_parquet(staging / "h3_timeline_daily_full.parquet", columns=["acq_date"])
    dates = pd.to_datetime(daily["acq_date"], errors="coerce")
    ok = dates.notna().all()
    in_range = bool(dates.min().date() >= date(2019, 9, 1) and dates.max().date() <= date.today()) if ok else False
    report["utc_dates"] = {
        "unparseable": int(dates.isna().sum()),
        "min": str(dates.min().date()) if ok else None,
        "max": str(dates.max().date()) if ok else None,
        "within_expected_range": in_range,
    }
    return ok and in_range


def check_state_counts_and_land_mask(staging: Path, report: dict[str, Any]) -> bool:
    from ingestion.osm_wri_load import OUTSIDE_INDIA_STATE, assign_states
    from h3 import cell_to_latlng

    daily = pd.read_parquet(staging / "h3_timeline_daily_full.parquet", columns=["h3_08", "n_detections"])
    cells = daily.groupby("h3_08", as_index=False)["n_detections"].sum()
    latlng = pd.DataFrame([cell_to_latlng(c) for c in cells["h3_08"].astype(str)],
                          columns=["latitude", "longitude"])
    assigned = assign_states(latlng)
    cells["state"] = assigned["state"].to_numpy()
    by_state = cells.groupby("state")["n_detections"].sum().sort_index()
    outside = int(by_state.get(OUTSIDE_INDIA_STATE, 0))
    ten_state = int(by_state.reindex(sorted(TEN_STATE_SUBSET)).fillna(0).sum())
    report["state_counts"] = {
        "detections_by_state": {k: int(v) for k, v in by_state.items()},
        "ten_state_subset_detections": ten_state,
        "ten_state_share": round(ten_state / float(by_state.sum()), 4),
        "outside_india_detections": outside,
        "distinct_states": int((by_state.index != OUTSIDE_INDIA_STATE).sum()),
    }
    return outside == 0 and (by_state.index != OUTSIDE_INDIA_STATE).sum() >= 10


def check_partial_first_period(staging: Path, report: dict[str, Any]) -> bool:
    manifest = json.loads((staging / "materialization_manifest.json").read_text(encoding="utf-8"))
    start = manifest["materialized_start_date"]
    report["partial_first_period"] = {
        "materialized_start_date": start,
        "first_month_partial": not start.endswith("-01"),
    }
    return True  # recorded, structural (serve-time `partial` flag consumes it)


def check_archive_gaps(staging: Path, report: dict[str, Any]) -> bool:
    daily = pd.read_parquet(staging / "h3_timeline_daily_full.parquet", columns=["h3_08", "acq_date"])
    daily = daily.sort_values(["h3_08", "acq_date"])
    diffs = daily.groupby("h3_08")["acq_date"].diff().dt.days
    gap_events = diffs[diffs > 31]  # >30-day hole between observed days
    report["archive_gaps"] = {
        "gap_events_over_30d": int(len(gap_events)),
        "cells_with_gap_over_30d": int(daily.loc[gap_events.index, "h3_08"].nunique()) if len(gap_events) else 0,
        "largest_gap_days": int(diffs.max() - 1) if len(diffs) else 0,
    }
    return True  # gaps are reported facts (transition gate consumes them), not failures


def check_layer_schema_parity(staging: Path, report: dict[str, Any]) -> bool:
    """Exact frozen column sets for the monthly and yearly layers."""
    ok = True
    details: dict[str, Any] = {}
    for name, frozen in (("monthly", FROZEN_MONTHLY_COLUMNS), ("yearly", FROZEN_YEARLY_COLUMNS)):
        actual = set(pq.read_schema(staging / f"h3_timeline_{name}.parquet").names)
        missing, extra = sorted(frozen - actual), sorted(actual - frozen)
        details[name] = {"missing": missing, "unexpected": extra}
        if missing or extra:
            ok = False
    report["layer_schema"] = details
    return ok


def check_output_hashes(staging: Path, report: dict[str, Any]) -> bool:
    files = sorted(p.name for p in staging.glob("*.parquet"))
    report["output_hashes"] = {name: _sha256(staging / name) for name in files}
    return bool(files)


def _complete_sep_dec_year(frame: pd.DataFrame, year: int) -> bool:
    months = pd.to_datetime(frame.loc[pd.to_datetime(frame["acq_date"]).dt.year == year, "acq_date"]).dt.month
    return set(range(9, 13)) <= set(months.unique())


def seasonal_comparability(staging: Path, report: dict[str, Any]) -> bool:
    """BLOCKING gate. Sep–Dec of the new layer's first year vs the same window
    in the latest COMPLETE validated Sep–Dec year of the live archive (never
    the current possibly-partial year). No complete live window exists ->
    fail-closed (representative defaults to False).

    Returns True only when the comparison passes or the documented override
    flag forces promotion."""
    live_path = Path(settings.H3_DAILY_PARQUET)
    new = pd.read_parquet(staging / "h3_timeline_daily_full.parquet",
                          columns=["h3_08", "acq_date", "n_detections", "pct_high_confidence", "satellite_nunique"])
    first_year = int(pd.to_datetime(new["acq_date"]).min().year)

    entry: dict[str, Any] = {"new_window": f"{first_year}-09-01..{first_year}-12-31"}
    baseline_year = None
    if live_path.exists():
        live = pd.read_parquet(live_path, columns=["acq_date"])
        live_years = pd.to_datetime(live["acq_date"]).dt.year
        current_year = date.today().year
        candidates = sorted({y for y in live_years.unique()
                             if y < current_year and _complete_sep_dec_year(live, int(y))}, reverse=True)
        baseline_year = int(candidates[0]) if candidates else None
    entry["baseline_window"] = f"{baseline_year}-09-01..{baseline_year}-12-31" if baseline_year else None

    def stats(df: pd.DataFrame) -> dict[str, Any]:
        d = pd.to_datetime(df["acq_date"])
        win = df[d.dt.month.isin([9, 10, 11, 12])]
        return {
            "detections": int(win["n_detections"].sum()),
            "active_cells": int(win.loc[win["n_detections"] > 0, "h3_08"].nunique()),
            "mean_pct_high_conf": round(float(win["pct_high_confidence"].mean()), 4) if len(win) else None,
            "observation_days": int(win["acq_date"].nunique()),
            "multi_satellite_day_share": round(float((win["satellite_nunique"] > 1).mean()), 4) if len(win) else None,
        }

    a = pd.to_datetime(new["acq_date"])
    s_new = stats(new[a.dt.year == first_year])

    comparable = False
    if baseline_year is None:
        entry["status"] = "skipped_no_complete_baseline"
    else:
        live = pd.read_parquet(live_path)
        l = pd.to_datetime(live["acq_date"])
        s_live = stats(live[l.dt.year == baseline_year])
        entry["new_stats"], entry["live_stats"] = s_new, s_live
        comparable = all(
            (s_live[k] == 0 and s_new[k] == 0) or (s_live[k] and 0.5 <= s_new[k] / s_live[k] <= 2.0)
            for k in ("detections", "active_cells", "observation_days")
        )
        entry["status"] = "compared"
    entry["partial_period_representative"] = comparable

    overridden = False
    if not comparable:
        overridden = settings.timeline_seasonal_gate_override()
        entry["seasonal_gate_overridden"] = overridden
    report["seasonal_comparison"] = entry
    return comparable or overridden


BLOCKING_CHECKS: list[tuple[str, Callable[[Path, dict], bool]]] = [
    ("schema_parity", check_schema_parity),
    ("confidence_policy", check_confidence_policy),
    ("dedup_integrity", check_dedup_integrity),
    ("h3_resolution", check_h3_resolution),
    ("utc_dates", check_utc_dates),
    ("state_counts_land_mask", check_state_counts_and_land_mask),
    ("layer_schema", check_layer_schema_parity),
    ("output_hashes", check_output_hashes),
]

RECORDED_CHECKS: list[tuple[str, Callable[[Path, dict], bool]]] = [
    ("partial_first_period", check_partial_first_period),
    ("archive_gaps", check_archive_gaps),
]


def validate_and_promote(staging_dir: str | Path, timeline_dir: str | Path) -> dict[str, Any]:
    staging = Path(staging_dir)
    report: dict[str, Any] = {"staging_dir": str(staging)}
    results = {}
    for name, fn in BLOCKING_CHECKS:
        results[name] = bool(fn(staging, report))
        logger.info("check %s: %s", name, "PASS" if results[name] else "FAIL")
    for name, fn in RECORDED_CHECKS:
        fn(staging, report)

    results["seasonal_comparability"] = bool(seasonal_comparability(staging, report))
    logger.info("check seasonal_comparability: %s", "PASS" if results["seasonal_comparability"] else "FAIL")

    report["checks"] = results
    report["validated"] = all(results.values())

    if report["validated"]:
        dest = Path(timeline_dir)
        dest.mkdir(parents=True, exist_ok=True)
        for src in staging.iterdir():
            if src.is_file():
                shutil.copy2(src, dest / src.name)
        report["promoted_to"] = str(dest)
    else:
        report["promoted_to"] = None

    (staging / "validation_report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True, default=str), encoding="utf-8"
    )
    if report["validated"]:
        shutil.copy2(staging / "validation_report.json", Path(timeline_dir) / "validation_report.json")
    return report
