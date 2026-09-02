"""FIRMS VIIRS point stream -> exact H3-day cell aggregation.

Produces the daily per-cell feature frame whose column contract is locked by
``app/core/config.H3_DAILY_FEATURES`` / the shipped product
``sih2026_h3_daily_features_firms.parquet`` (28 columns).

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

    point_conf = pd.to_numeric(points.get("confidence"), errors="coerce")
    high_mask = point_conf.notna() & (point_conf.astype(str).str.lower() == "high")
    night_mask = points.get("daynight", pd.Series(["D"] * len(points))).astype(str).str.upper().isin(["N", "NIGHT"])

    frp = pd.to_numeric(points.get("frp"), errors="coerce").fillna(0.0)
    ti4 = pd.to_numeric(points.get("bright_ti4", points.get("ti4")), errors="coerce").fillna(0.0)
    sat = points.get("satellite", pd.Series(["N"] * len(points)))

    row: dict = {
        "h3_08": str(points["h3_08"].iloc[0]),
        "acq_date": str(pd.to_datetime(points["acq_date"]).iloc[0].date()),
        "frp_max": float(frp.max()),
        "frp_mean": float(frp.mean()),
        "n_detections": int(len(points)),
        "ti4_max": float(ti4.max()),
        "is_saturated_max": int(pd.to_numeric(points.get("is_saturated", 0), errors="coerce").fillna(0).max()),
        "scan_mean": float(pd.to_numeric(points.get("scan", 0), errors="coerce").fillna(0.0).mean()),
        "track_mean": float(pd.to_numeric(points.get("track", 0), errors="coerce").fillna(0.0).mean()),
        "confidence_high_any": int(bool(high_mask.any())),
        "pct_high_confidence": _pct(high_mask.astype(int)),
        "frp_max_night": _max_if(frp, night_mask),
        "frp_max_day": _max_if(frp, ~night_mask),
        "n_detections_night": int(night_mask.sum()),
        "n_detections_day": int((~night_mask).sum()),
        "scan_max": float(pd.to_numeric(points.get("scan", 0), errors="coerce").fillna(0.0).max()),
        "track_max": float(pd.to_numeric(points.get("track", 0), errors="coerce").fillna(0.0).max()),
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
    daily = pd.concat(groups, ignore_index=True)

    daily = _add_temporal_history(daily)
    daily = daily.reindex(columns=H3_DAILY_FEATURES)
    return daily


def _add_temporal_history(daily: pd.DataFrame) -> pd.DataFrame:
    """Shift-before-rolling temporal features (leakage-safe, per h3_08)."""
    out = daily.sort_values(["h3_08", "acq_date"]).copy()
    out["_date"] = pd.to_datetime(out["acq_date"])

    out["frp_max_lag7"] = (
        out.groupby("h3_08")["frp_max"]
        .shift(1)
        .rolling("7D", min_periods=1)
        .max()
        .reset_index(level=0, drop=True)
        .fillna(0.0)
    )
    out["frp_max_lag30"] = (
        out.groupby("h3_08")["frp_max"]
        .shift(1)
        .rolling("30D", min_periods=1)
        .max()
        .reset_index(level=0, drop=True)
        .fillna(0.0)
    )

    out["active_days_7d"] = (
        out.groupby("h3_08")["frp_max"]
        .shift(1)
        .rolling("7D", min_periods=0)
        .count()
        .reset_index(level=0, drop=True)
        .fillna(0)
        .astype(int)
    )
    out["active_days_30d"] = (
        out.groupby("h3_08")["frp_max"]
        .shift(1)
        .rolling("30D", min_periods=0)
        .count()
        .reset_index(level=0, drop=True)
        .fillna(0)
        .astype(int)
    )
    out["active_days_90d"] = (
        out.groupby("h3_08")["frp_max"]
        .shift(1)
        .rolling("90D", min_periods=0)
        .count()
        .reset_index(level=0, drop=True)
        .fillna(0)
        .astype(int)
    )

    out["is_first_observation"] = (
        out.groupby("h3_08")["frp_max"].shift(1).isna().astype(int)
    )
    return out.drop(columns=["_date"])