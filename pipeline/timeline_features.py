"""Leakage-safe FIRMS timeline features for one H3 cell-day stream."""

from __future__ import annotations

import pandas as pd


def build_timeline_features(daily: pd.DataFrame) -> pd.DataFrame:
    """Add prior-only activity, gap, and observation-basis fields.

    Rows are evidence records, not labels. Every ``prior_*`` value is derived
    strictly from rows whose acquisition date is before the current row.
    """
    required = {"h3_08", "acq_date", "frp_max", "n_detections"}
    missing = sorted(required - set(daily.columns))
    if missing:
        raise ValueError(f"Timeline input missing required columns: {missing}")
    if daily.empty:
        return daily.copy()

    source = daily.copy()
    source["acq_date"] = pd.to_datetime(source["acq_date"], utc=True).dt.tz_localize(None)
    source = source.sort_values(["h3_08", "acq_date"]).reset_index(drop=True)
    for col in ("frp_max", "n_detections", "n_detections_night", "satellite_nunique"):
        if col not in source:
            source[col] = 0
        source[col] = pd.to_numeric(source[col], errors="coerce").fillna(0)

    frames: list[pd.DataFrame] = []
    for _h3_index, group in source.groupby("h3_08", sort=False):
        group = group.copy().set_index("acq_date").sort_index()
        previous_date = group.index.to_series().shift(1)
        group["archive_gap_days"] = (group.index.to_series() - previous_date).dt.days.sub(1).clip(lower=0).fillna(0).astype(int).to_numpy()
        group["days_since_last_detection"] = (group.index.to_series() - previous_date).dt.days.to_numpy()
        for window in (7, 30, 90, 365):
            rolling = group[["n_detections", "frp_max", "satellite_nunique"]].rolling(f"{window}D", closed="left", min_periods=1)
            group[f"prior_{window}d_detections"] = rolling["n_detections"].sum().fillna(0).astype(int).to_numpy()
            group[f"prior_{window}d_fire_days"] = rolling["n_detections"].count().fillna(0).astype(int).to_numpy()
            group[f"prior_{window}d_max_frp"] = rolling["frp_max"].max().to_numpy()
            group[f"prior_{window}d_satellite_detections"] = rolling["satellite_nunique"].sum().fillna(0).astype(int).to_numpy()
        night = group["n_detections_night"].rolling("30D", closed="left", min_periods=1).sum()
        total = group["n_detections"].rolling("30D", closed="left", min_periods=1).sum()
        group["prior_30d_night_ratio"] = (night / total.replace(0, pd.NA)).astype(float)
        group["observation_basis"] = group["n_detections"].map(
            lambda value: "detections" if float(value) > 0 else "no_detections_in_ingested_data"
        )
        group["feature_source_max_date"] = previous_date.dt.date.map(lambda value: value.isoformat() if pd.notna(value) else None)
        frames.append(group.reset_index())
    return pd.concat(frames, ignore_index=True)
