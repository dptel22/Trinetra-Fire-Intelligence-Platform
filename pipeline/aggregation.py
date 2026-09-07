"""FIRMS VIIRS point stream -> exact H3-day cell aggregation.

Produces the daily per-cell feature frame whose column contract is locked by
``app/core/config.H3_DAILY_FEATURES``: the shipped product
``sih2026_h3_daily_features_firms.parquet`` (28 columns) plus the 3
``acq_date``-derived calendar features (``acq_month``, ``doy_sin``,
``doy_cos``) required by the v3 model contract.

IMPORTANT (read before trusting live ingestion): the raw-FIRMS *field mapping*
below (e.g. ``ti4_max`` from ``bright_ti4``, ``daynight`` values, confidence
enum) is a best-effort projection of the standard VIIRS/FIRMS schema. The
serving path does NOT depend on this module today — ``h3_daily`` is seeded
directly from the already-aggregated parquet. Before using this for live point
ingestion against a judge-facing number, validate the per-field mapping against
``notebooks/.../sih-catboost-training.ipynb`` (aggregation cell).

Designed contracts enforced here:
- Resolution-8 H3 cells, UTC date bucketing (FIRMS timestamps are UTC).
- Shift-before-rolling temporal features: per h3_08, sort by date, then
  ``shift(1)`` before rolling 7D/30D/90D so history NEVER peeks at the current
  day (leakage-safe; mirrored as a pytest gate).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.core.config import H3_DAILY_FEATURES, settings
from pipeline.feature_engineering import latlng_to_h3


def assign_cells(points: pd.DataFrame, resolution: int = settings.H3_RESOLUTION) -> pd.DataFrame:
    """Add an ``h3_08`` column from point lat/lon."""
    df = points.copy()
    if "h3_08" not in df.columns:
        df["h3_08"] = df.apply(
            lambda r: latlng_to_h3(float(r["latitude"]), float(r["longitude"]), resolution),
            axis=1,
        )
    return df


def _daily_cell_aggregate(points: pd.DataFrame) -> pd.DataFrame:
    """Collapse one (h3_08, acq_date) group to the 28-column daily frame."""

    def _pct(series: pd.Series) -> float:
        try:
            return float(series.mean())
        except (TypeError, ValueError):
            return 0.0

    def _max_if(series: pd.Series, mask: pd.Series) -> float:
        try:
            sub = series[mask.fillna(False)]
            return float(sub.max()) if len(sub) else 0.0
        except (TypeError, ValueError):
            return 0.0

    conf = points["confidence"] if "confidence" in points.columns else pd.Series([""] * len(points), index=points.index)
    high_mask = conf.astype(str).str.strip().str.lower().isin(["h", "high"])
    daynight_series = points["daynight"] if "daynight" in points.columns else pd.Series(["D"] * len(points), index=points.index)
    night_mask = daynight_series.astype(str).str.upper().isin(["N", "NIGHT"])

    frp_col = points["frp"] if "frp" in points.columns else pd.Series([0.0] * len(points), index=points.index)
    frp = pd.to_numeric(frp_col, errors="coerce").fillna(0.0)

    if "bright_ti4" in points.columns:
        ti4_col = points["bright_ti4"]
    elif "ti4" in points.columns:
        ti4_col = points["ti4"]
    else:
        ti4_col = pd.Series([0.0] * len(points), index=points.index)
    ti4 = pd.to_numeric(ti4_col, errors="coerce").fillna(0.0)

    sat = points["satellite"] if "satellite" in points.columns else pd.Series(["N"] * len(points), index=points.index)
    scan_col = points["scan"] if "scan" in points.columns else pd.Series([0.0] * len(points), index=points.index)
    scan = pd.to_numeric(scan_col, errors="coerce").fillna(0.0)
    track_col = points["track"] if "track" in points.columns else pd.Series([0.0] * len(points), index=points.index)
    track = pd.to_numeric(track_col, errors="coerce").fillna(0.0)
    sat_col = points["is_saturated"] if "is_saturated" in points.columns else pd.Series([0] * len(points), index=points.index)
    is_sat = pd.to_numeric(sat_col, errors="coerce").fillna(0)

    row: dict = {
        "h3_08": str(points["h3_08"].iloc[0]),
        "acq_date": str(pd.to_datetime(points["acq_date"]).iloc[0].date()),
        "frp_max": float(frp.max()),
        "frp_mean": float(frp.mean()),
        "n_detections": len(points),
        "ti4_max": float(ti4.max()),
        "is_saturated_max": int(is_sat.max()),
        "scan_mean": float(scan.mean()),
        "track_mean": float(track.mean()),
        "confidence_high_any": int(bool(high_mask.any())),
        "pct_high_confidence": _pct(high_mask.astype(int)),
        "frp_max_night": _max_if(frp, night_mask),
        "frp_max_day": _max_if(frp, ~night_mask),
        "n_detections_night": int(night_mask.sum()),
        "n_detections_day": int((~night_mask).sum()),
        "scan_max": float(scan.max()),
        "track_max": float(track.max()),
        "daynight": "Day" if night_mask.sum() < (~night_mask).sum() else "Night",
        "satellite_nunique": int(sat.nunique()),
    }
    return pd.DataFrame([row])


def aggregate_daily(points: pd.DataFrame) -> pd.DataFrame:
    """Full pipeline: assign cells, group by (h3_08, acq_date), add temporal hist.

    Temporal columns are added after a shift-before-rolling step so history never
    includes the current day (leakage-safe).
    """
    df = assign_cells(points)
    req = ["latitude", "longitude", "acq_date"]
    missing = [c for c in req if c not in df.columns]
    if missing:
        raise ValueError(f"Points missing required columns: {missing}")
    df["acq_date"] = pd.to_datetime(df["acq_date"], utc=True).dt.date.astype(str)

    groups = []
    for (_h3, _key), g in df.groupby(["h3_08", "acq_date"]):
        groups.append(_daily_cell_aggregate(g))
    if not groups:
        return pd.DataFrame(columns=H3_DAILY_FEATURES)
    daily = pd.concat(groups, ignore_index=True)

    daily = _add_temporal_history(daily)
    daily = daily.reindex(columns=H3_DAILY_FEATURES)
    return daily


def _add_temporal_history(daily: pd.DataFrame) -> pd.DataFrame:
    """Shift-before-rolling temporal features (leakage-safe, per h3_08)."""
    if daily.empty:
        return daily.copy()
    out = daily.sort_values(["h3_08", "acq_date"]).copy()
    out["_date"] = pd.to_datetime(out["acq_date"])
    out = out.set_index("_date")

    # Calendar features (v3 model contract). Must stay numerically identical
    # to the DuckDB derivation in app/services/feature_store.py::load():
    # 1-indexed day-of-year, 365.25-day period. A pytest gate pins the two.
    doy = out.index.dayofyear
    out["acq_month"] = out.index.month.astype(int)
    out["doy_sin"] = np.sin(2 * np.pi * doy / 365.25)
    out["doy_cos"] = np.cos(2 * np.pi * doy / 365.25)

    grouped = out.groupby("h3_08")["frp_max"]

    out["frp_max_lag7"] = (
        grouped.transform(lambda s: s.shift(1).rolling("7D", min_periods=1).max())
        .fillna(0.0)
    )
    out["frp_max_lag30"] = (
        grouped.transform(lambda s: s.shift(1).rolling("30D", min_periods=1).max())
        .fillna(0.0)
    )

    out["active_days_7d"] = (
        grouped.transform(lambda s: s.shift(1).rolling("7D", min_periods=0).count())
        .fillna(0)
        .astype(int)
    )
    out["active_days_30d"] = (
        grouped.transform(lambda s: s.shift(1).rolling("30D", min_periods=0).count())
        .fillna(0)
        .astype(int)
    )
    out["active_days_90d"] = (
        grouped.transform(lambda s: s.shift(1).rolling("90D", min_periods=0).count())
        .fillna(0)
        .astype(int)
    )

    out["is_first_observation"] = (
        grouped.transform(lambda s: s.shift(1).isna()).astype(int)
    )
    return out.reset_index(drop=True)