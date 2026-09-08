"""Notebook-verbatim H3-day aggregation — the locked serving contract producer.

This ports `notebooks/eda/data-eda.ipynb` cells 12/20/25/26/27/28/30/31 exactly,
because the shipped serving parquets were produced by that notebook and the
model was trained on them. Deviations from `pipeline/aggregation.py` are
deliberate and documented:

- daynight has THREE contract values: "Day" / "Night" / "Both" (cell 20's
  set(x) rule). pipeline/aggregation.py only emits Day/Night, which would
  inject a live-vs-offline skew.
- frp_max_night / frp_max_day stay NaN when a cell-day had zero detections in
  that regime (NaN allowlist, Phase 9A); pipeline/aggregation.py fills 0.0.
- frp_max_lag7 / frp_max_lag30 stay NaN for a cell's first observed day and
  is_first_observation = frp_max_lag7.isna() (Phase 8B/9); no fillna(0.0).
- The Phase-8 rolling window is INCLUSIVE of the current row's frp_prev
  (rolling("7D", on=...) covers (t-7D, t] and frp_prev is the shift(1) value),
  so the exact groupby-rolling construction is reproduced verbatim rather than
  "cleaned up" — feature parity with training data is the contract.

Calendar features (acq_month / doy_sin / doy_cos) are NOT added here: the
feature store derives them in SQL at seed time and the daily parquet must not
contain them (duplicate column names in the DuckDB CREATE TABLE).
"""

from __future__ import annotations

import logging

import h3 as h3lib
import numpy as np
import pandas as pd

from app.core.config import settings

logger = logging.getLogger("ingestion.aggregate")

# data-eda.ipynb cell 3 (locked constants).
SATURATION_TEMP = 367.0
SATURATION_BUFFER = 0.1

# The 27-column daily frame contract, byte-verified against
# data/processed/sih2026_h3_daily_features_firms.parquet (arrow schema).
DAILY_COLUMNS = [
    "h3_08", "acq_date", "frp_max", "frp_mean", "n_detections", "ti4_max",
    "is_saturated_max", "scan_mean", "track_mean", "confidence_high_any",
    "pct_high_confidence", "frp_max_night", "frp_max_day",
    "n_detections_night", "n_detections_day", "scan_max", "track_max",
    "daynight", "satellite_nunique", "is_static_land", "is_offshore",
    "frp_max_lag7", "active_days_7d", "frp_max_lag30", "active_days_30d",
    "active_days_90d", "is_first_observation", "is_labeled",
]

# NaN allowlist from Phase 9A (cell 31).
_ALLOWED_NAN_COLS = {"frp_max_lag7", "frp_max_lag30", "frp_max_night", "frp_max_day"}


class AggregationValidationError(RuntimeError):
    """Raised when the aggregated daily frame violates a notebook invariant."""


def assign_h3(points: pd.DataFrame) -> pd.DataFrame:
    """Cell 20 step 1: assign every detection to an H3 resolution-8 cell."""
    df = points.copy()
    res = settings.H3_RESOLUTION
    df["h3_08"] = [
        h3lib.latlng_to_cell(lat, lon, res)
        for lat, lon in zip(df["latitude"], df["longitude"])
    ]
    if df["h3_08"].isna().any():
        raise AggregationValidationError("H3 assignment produced missing values")
    return df


def aggregate_detections(points: pd.DataFrame) -> pd.DataFrame:
    """Cell 20 verbatim: collapse detections to one row per (h3_08, acq_date).

    Input must be harmonized points (see firms_pull.harmonize_points):
    confidence in {nominal, high}, daynight in {Day, Night}, satellite
    normalized, is_static_land / is_offshore present.
    """
    if points.empty:
        raise AggregationValidationError("No detections to aggregate (empty day is valid; handle upstream)")

    required = ["latitude", "longitude", "acq_date", "bright_ti4", "frp", "confidence",
                "daynight", "satellite", "is_static_land", "is_offshore"]
    missing = [c for c in required if c not in points.columns]
    if missing:
        raise AggregationValidationError(
            f"Points missing required columns {missing} — pass points through "
            "ingestion.firms_pull.harmonize_points() first"
        )

    df = assign_h3(points)

    # Cell 12 parses acq_date before aggregation (Phase 8's rolling windows
    # require datetime64); harmonize_points normally guarantees this.
    if not pd.api.types.is_datetime64_any_dtype(df["acq_date"]):
        df["acq_date"] = pd.to_datetime(df["acq_date"], errors="raise")

    # Cell 20 step 2: VIIRS I4 saturation flag (threshold 366.9 K).
    df["is_saturated"] = (df["bright_ti4"] >= (SATURATION_TEMP - SATURATION_BUFFER)).astype(int)

    # Cell 20 step 2b: day/night-masked FRP columns (all-NaN side stays NaN).
    df["frp_night_masked"] = np.where(df["daynight"] == "Night", df["frp"], np.nan)
    df["frp_day_masked"] = np.where(df["daynight"] == "Day", df["frp"], np.nan)

    df_daily = df.groupby(["h3_08", "acq_date"], as_index=False).agg(
        frp_max=("frp", "max"),
        frp_mean=("frp", "mean"),
        n_detections=("frp", "count"),
        ti4_max=("bright_ti4", "max"),
        is_saturated_max=("is_saturated", "max"),
        scan_mean=("scan", "mean"),
        track_mean=("track", "mean"),
        confidence_high_any=("confidence", lambda x: (x == "high").any()),
        pct_high_confidence=("confidence", lambda x: (x == "high").mean()),
        frp_max_night=("frp_night_masked", "max"),
        frp_max_day=("frp_day_masked", "max"),
        n_detections_night=("frp_night_masked", lambda x: x.notna().sum()),
        n_detections_day=("frp_day_masked", lambda x: x.notna().sum()),
        scan_max=("scan", "max"),
        track_max=("track", "max"),
        daynight=("daynight", lambda x: "Both" if len(set(x)) > 1 else x.iloc[0]),
        satellite_nunique=("satellite", "nunique"),
        is_static_land=("is_static_land", "max"),
        is_offshore=("is_offshore", "max"),
    )

    df_daily = df_daily.sort_values(["h3_08", "acq_date"]).reset_index(drop=True)

    # Cell 20 consistency check: frp_max == max of the day/night split
    # (treating an all-NaN side as -inf).
    check = df_daily[["frp_max_night", "frp_max_day"]].max(axis=1, skipna=True)
    mismatch = (df_daily["frp_max"] - check).abs().gt(1e-6) & check.notna()
    if mismatch.any():
        raise AggregationValidationError(
            f"frp_max disagrees with max(frp_max_night, frp_max_day) on {int(mismatch.sum())} rows"
        )

    logger.info(
        "Aggregated %d detections -> %d H3-days across %d cells",
        len(df), len(df_daily), df_daily["h3_08"].nunique(),
    )
    return df_daily


def add_temporal_history(df_daily: pd.DataFrame) -> pd.DataFrame:
    """Phase 8 (cell 25) verbatim: leakage-safe rolling historical features.

    Input must be sorted per cell by acq_date (the function sorts and asserts
    alignment like the notebook). acq_date must be datetime64[ns].
    """
    df_daily = df_daily.sort_values(["h3_08", "acq_date"]).reset_index(drop=True)

    # Previous FRP within the SAME cell; first observation is NaN.
    df_daily["frp_prev"] = df_daily.groupby("h3_08", sort=False)["frp_max"].shift(1)
    # Every row is one active H3-day: first row of a cell = 0 previous days.
    df_daily["active_prev"] = (
        df_daily.groupby("h3_08", sort=False).cumcount().gt(0).astype("int8")
    )

    rolling_input = df_daily[["h3_08", "acq_date", "frp_prev", "active_prev"]].copy()

    def _rolling(window_days: int, agg: dict, out_cols: dict[str, str]) -> pd.DataFrame:
        rolled = (
            rolling_input.groupby("h3_08", sort=False)
            .rolling(f"{window_days}D", on="acq_date", min_periods=1)[["frp_prev", "active_prev"]]
            .agg(agg)
            .reset_index()
        )
        # Alignment check (notebook asserts this for every window).
        if not rolled[["h3_08", "acq_date"]].reset_index(drop=True).equals(
            df_daily[["h3_08", "acq_date"]].reset_index(drop=True)
        ):
            raise AggregationValidationError(f"{window_days}D rolling output is not aligned with df_daily")
        for src, dst in out_cols.items():
            df_daily[dst] = rolled[src].to_numpy()

    _rolling(7, {"frp_prev": "max", "active_prev": "sum"}, {"frp_prev": "frp_max_lag7", "active_prev": "active_days_7d"})
    _rolling(30, {"frp_prev": "max", "active_prev": "sum"}, {"frp_prev": "frp_max_lag30", "active_prev": "active_days_30d"})
    # 90-day pass: only active_days_90d (there is intentionally NO frp_max_lag90).
    _rolling(90, {"active_prev": "sum"}, {"active_prev": "active_days_90d"})

    df_daily = df_daily.drop(columns=["frp_prev", "active_prev"])

    # Phase 8A: active-day features must be complete and in range.
    active_cols = ["active_days_7d", "active_days_30d", "active_days_90d"]
    if df_daily[active_cols].isna().sum().sum() != 0:
        raise AggregationValidationError("active-day rolling features contain unexpected NaN")
    if not df_daily["active_days_7d"].between(0, 7).all():
        raise AggregationValidationError("active_days_7d outside 0-7")
    if not df_daily["active_days_30d"].between(0, 30).all():
        raise AggregationValidationError("active_days_30d outside 0-30")
    if not df_daily["active_days_90d"].between(0, 90).all():
        raise AggregationValidationError("active_days_90d outside 0-90")

    # Phase 8B: first observed day of every cell has no history.
    first_rows = df_daily.groupby("h3_08", sort=False).head(1)
    if not first_rows["frp_max_lag7"].isna().all():
        raise AggregationValidationError("first H3-day has a 7D historical FRP value")
    if not first_rows["frp_max_lag30"].isna().all():
        raise AggregationValidationError("first H3-day has a 30D historical FRP value")
    if not (first_rows["active_days_7d"] == 0).all():
        raise AggregationValidationError("first H3-day has previous 7D activity")
    if not (first_rows["active_days_30d"] == 0).all():
        raise AggregationValidationError("first H3-day has previous 30D activity")
    if not (first_rows["active_days_90d"] == 0).all():
        raise AggregationValidationError("first H3-day has previous 90D activity")

    return df_daily


def finalize_daily(df_daily: pd.DataFrame) -> pd.DataFrame:
    """Phase 9 (cells 30/31): first-observation flag, NaN allowlist, dtypes.

    Returns the exact 27-column daily contract (DAILY_COLUMNS). Calendar
    features are intentionally NOT included (derived in DuckDB at seed time).
    """
    df = df_daily.copy()

    # Phase 9: frp_max_lag7 / frp_max_lag30 share the identical NaN mask.
    df["is_first_observation"] = df["frp_max_lag7"].isna().astype("int8")
    if not (df["frp_max_lag7"].isna().sum() == df["frp_max_lag30"].isna().sum() == df["is_first_observation"].sum()):
        raise AggregationValidationError("frp_max_lag7 / frp_max_lag30 NaN masks diverge")

    df = df.reindex(columns=DAILY_COLUMNS)

    # Phase 9A: NaN allowlist.
    nan_counts = df.isna().sum()
    unexpected = nan_counts[(nan_counts > 0) & (~nan_counts.index.isin(_ALLOWED_NAN_COLS))]
    if not unexpected.empty:
        raise AggregationValidationError(f"unexpected NaN outside allowlist: {unexpected.to_dict()}")

    return df


def cast_daily_dtypes(df: pd.DataFrame) -> pd.DataFrame:
    """Phase 9 dtype downcast to the arrow schema of the shipped daily parquet."""
    df = df.copy()
    floats = [
        "frp_max", "frp_mean", "ti4_max", "scan_mean", "track_mean",
        "pct_high_confidence", "frp_max_night", "frp_max_day",
        "frp_max_lag7", "frp_max_lag30",
    ]
    for col in floats:
        df[col] = df[col].astype("float32")
    df["n_detections"] = df["n_detections"].astype("int16")
    for col in ["n_detections_night", "n_detections_day"]:
        df[col] = df[col].astype("int16")
    for col in [
        "is_saturated_max", "satellite_nunique", "is_static_land",
        "is_offshore", "active_days_7d", "active_days_30d",
        "active_days_90d", "is_first_observation", "is_labeled",
    ]:
        df[col] = df[col].astype("int8")
    df["confidence_high_any"] = df["confidence_high_any"].astype(bool)
    df["acq_date"] = pd.to_datetime(df["acq_date"])
    df["h3_08"] = df["h3_08"].astype(str)
    df["daynight"] = pd.Categorical(df["daynight"], categories=["Day", "Night", "Both"])
    return df


def build_daily_frame(points: pd.DataFrame) -> pd.DataFrame:
    """Full path: harmonized points -> typed 27-column daily frame."""
    if points.empty:
        raise AggregationValidationError("No detections to aggregate (empty day is valid; handle upstream)")
    daily = aggregate_detections(points)
    daily = add_temporal_history(daily)
    daily["is_labeled"] = 0  # live rows are unlabeled by definition
    daily = finalize_daily(daily)
    return cast_daily_dtypes(daily)
