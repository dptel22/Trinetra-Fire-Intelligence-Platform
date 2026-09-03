import numpy as np
import pandas as pd
import pytest

from app.core.config import H3_DAILY_FEATURES, settings
from pipeline.aggregation import aggregate_daily
from pipeline.feature_engineering import latlng_to_h3


def build_multi_day_fixture() -> pd.DataFrame:
    """Deterministic 2-cell, multi-day FIRMS point dataset with known FRP/confidence/daynight."""
    lat_a, lon_a = 28.6139, 77.2090  # Cell A
    lat_b, lon_b = 19.0760, 72.8777  # Cell B

    records = [
        # --- Cell A ---
        # 2026-01-01: 2 detections (day + night), confidence: "high" and "n" -> max=8.0, mean=7.0
        {
            "latitude": lat_a,
            "longitude": lon_a,
            "acq_date": "2026-01-01",
            "frp": 8.0,
            "confidence": "high",
            "daynight": "D",
            "bright_ti4": 330.0,
            "scan": 1.1,
            "track": 1.0,
            "satellite": "N",
        },
        {
            "latitude": lat_a,
            "longitude": lon_a,
            "acq_date": "2026-01-01",
            "frp": 6.0,
            "confidence": "n",
            "daynight": "N",
            "bright_ti4": 310.0,
            "scan": 1.3,
            "track": 1.2,
            "satellite": "A",
        },
        # 2026-01-05: 1 detection, confidence "H", FRP 20.0 (4 days after Jan 01)
        {
            "latitude": lat_a,
            "longitude": lon_a,
            "acq_date": "2026-01-05",
            "frp": 20.0,
            "confidence": "H",
            "daynight": "D",
            "bright_ti4": 350.0,
            "scan": 1.2,
            "track": 1.1,
            "satellite": "N",
        },
        # 2026-01-08: 1 detection, confidence " high ", FRP 15.0 (3 days after Jan 05, 7 days after Jan 01)
        {
            "latitude": lat_a,
            "longitude": lon_a,
            "acq_date": "2026-01-08",
            "frp": 15.0,
            "confidence": " high ",
            "daynight": "D",
            "bright_ti4": 340.0,
            "scan": 1.0,
            "track": 1.0,
            "satellite": "N",
        },
        # 2026-02-01: 1 detection, confidence "low", FRP 12.0 (24 days after Jan 08, 31 days after Jan 01)
        {
            "latitude": lat_a,
            "longitude": lon_a,
            "acq_date": "2026-02-01",
            "frp": 12.0,
            "confidence": "low",
            "daynight": "D",
            "bright_ti4": 320.0,
            "scan": 1.0,
            "track": 1.0,
            "satellite": "N",
        },
        # 2026-04-15: 1 detection, confidence None, FRP 25.0 (73 days after Feb 01, 104 days after Jan 01)
        {
            "latitude": lat_a,
            "longitude": lon_a,
            "acq_date": "2026-04-15",
            "frp": 25.0,
            "confidence": None,
            "daynight": "D",
            "bright_ti4": 360.0,
            "scan": 1.0,
            "track": 1.0,
            "satellite": "N",
        },
        # --- Cell B ---
        # 2026-01-02: 1 detection, confidence "l", FRP 50.0
        {
            "latitude": lat_b,
            "longitude": lon_b,
            "acq_date": "2026-01-02",
            "frp": 50.0,
            "confidence": "l",
            "daynight": "D",
            "bright_ti4": 360.0,
            "scan": 1.0,
            "track": 1.0,
            "satellite": "N",
        },
        # 2026-01-05: 1 detection, confidence "HIGH", FRP 100.0
        {
            "latitude": lat_b,
            "longitude": lon_b,
            "acq_date": "2026-01-05",
            "frp": 100.0,
            "confidence": "HIGH",
            "daynight": "N",
            "bright_ti4": 380.0,
            "scan": 1.5,
            "track": 1.2,
            "satellite": "A",
        },
    ]
    return pd.DataFrame(records)


@pytest.fixture
def multi_day_fixture() -> pd.DataFrame:
    return build_multi_day_fixture()


def test_aggregate_daily_end_to_end_and_columns(multi_day_fixture):
    """Assert aggregate_daily completes end-to-end and columns match H3_DAILY_FEATURES exactly."""
    result = aggregate_daily(multi_day_fixture)
    assert not result.empty
    assert list(result.columns) == H3_DAILY_FEATURES
    assert list(result.columns) == settings.H3_DAILY_FEATURES


def test_shift_before_rolling_no_leakage_of_current_day(multi_day_fixture):
    """Assert current day's FRP is never included in its own lag/window."""
    result = aggregate_daily(multi_day_fixture)
    cell_a = latlng_to_h3(28.6139, 77.2090, settings.H3_RESOLUTION)
    cell_a_rows = result[result["h3_08"] == cell_a].sort_values("acq_date").reset_index(drop=True)

    # Jan 01: frp_max=8.0, lag7=0.0 (prior is empty)
    assert cell_a_rows.loc[0, "acq_date"] == "2026-01-01"
    assert cell_a_rows.loc[0, "frp_max"] == 8.0
    assert cell_a_rows.loc[0, "frp_max_lag7"] == 0.0

    # Jan 05: frp_max=20.0, lag7=8.0 (excludes its own 20.0)
    assert cell_a_rows.loc[1, "acq_date"] == "2026-01-05"
    assert cell_a_rows.loc[1, "frp_max"] == 20.0
    assert cell_a_rows.loc[1, "frp_max_lag7"] == 8.0

    # Jan 08: frp_max=15.0, lag7=20.0 (excludes its own 15.0)
    assert cell_a_rows.loc[2, "acq_date"] == "2026-01-08"
    assert cell_a_rows.loc[2, "frp_max"] == 15.0
    assert cell_a_rows.loc[2, "frp_max_lag7"] == 20.0


def test_boundary_day_math_and_active_days(multi_day_fixture):
    """Assert exact 7D/30D/90D rolling counts and max lags."""
    result = aggregate_daily(multi_day_fixture)
    cell_a = latlng_to_h3(28.6139, 77.2090, settings.H3_RESOLUTION)
    cell_a_rows = result[result["h3_08"] == cell_a].sort_values("acq_date").reset_index(drop=True)

    # Jan 01: first observation
    row_jan01 = cell_a_rows.loc[0]
    assert row_jan01["active_days_7d"] == 0
    assert row_jan01["active_days_30d"] == 0
    assert row_jan01["active_days_90d"] == 0
    assert row_jan01["frp_max_lag7"] == 0.0
    assert row_jan01["frp_max_lag30"] == 0.0

    # Jan 05 (4 days later): 1 prior active day
    row_jan05 = cell_a_rows.loc[1]
    assert row_jan05["active_days_7d"] == 1
    assert row_jan05["active_days_30d"] == 1
    assert row_jan05["active_days_90d"] == 1
    assert row_jan05["frp_max_lag7"] == 8.0
    assert row_jan05["frp_max_lag30"] == 8.0

    # Jan 08 (3 days after Jan 05):
    row_jan08 = cell_a_rows.loc[2]
    assert row_jan08["active_days_7d"] == 2
    assert row_jan08["active_days_30d"] == 2
    assert row_jan08["active_days_90d"] == 2
    assert row_jan08["frp_max_lag7"] == 20.0
    assert row_jan08["frp_max_lag30"] == 20.0


def test_cross_cell_isolation(multi_day_fixture):
    """Assert no leakage between distinct H3 cells."""
    result = aggregate_daily(multi_day_fixture)
    cell_b = latlng_to_h3(19.0760, 72.8777, settings.H3_RESOLUTION)
    cell_b_rows = result[result["h3_08"] == cell_b].sort_values("acq_date").reset_index(drop=True)

    # Cell B Jan 02: must NOT see Cell A Jan 01 frp=8.0
    assert cell_b_rows.loc[0, "acq_date"] == "2026-01-02"
    assert cell_b_rows.loc[0, "frp_max"] == 50.0
    assert cell_b_rows.loc[0, "frp_max_lag7"] == 0.0
    assert cell_b_rows.loc[0, "active_days_7d"] == 0
    assert cell_b_rows.loc[0, "is_first_observation"] == 1

    # Cell B Jan 05: must see Cell B Jan 02 frp=50.0, not Cell A's Jan 01/Jan 05
    assert cell_b_rows.loc[1, "acq_date"] == "2026-01-05"
    assert cell_b_rows.loc[1, "frp_max"] == 100.0
    assert cell_b_rows.loc[1, "frp_max_lag7"] == 50.0
    assert cell_b_rows.loc[1, "active_days_7d"] == 1
    assert cell_b_rows.loc[1, "is_first_observation"] == 0


def test_is_first_observation(multi_day_fixture):
    """Assert is_first_observation is 1 only on true first row per cell."""
    result = aggregate_daily(multi_day_fixture)
    for _cell_id, group in result.groupby("h3_08"):
        sorted_g = group.sort_values("acq_date").reset_index(drop=True)
        assert sorted_g.loc[0, "is_first_observation"] == 1
        for idx in range(1, len(sorted_g)):
            assert sorted_g.loc[idx, "is_first_observation"] == 0


def test_confidence_parsing_forms():
    """Assert high/h/n/l/mixed-case/NaN/garbage inputs yield correct confidence aggregations."""
    lat, lon = 28.6139, 77.2090
    conf_samples = [
        {"latitude": lat, "longitude": lon, "acq_date": "2026-01-01", "confidence": "high", "frp": 10.0},
        {"latitude": lat, "longitude": lon, "acq_date": "2026-01-01", "confidence": "h", "frp": 10.0},
        {"latitude": lat, "longitude": lon, "acq_date": "2026-01-01", "confidence": "HIGH", "frp": 10.0},
        {"latitude": lat, "longitude": lon, "acq_date": "2026-01-01", "confidence": "H", "frp": 10.0},
        {"latitude": lat, "longitude": lon, "acq_date": "2026-01-01", "confidence": " high ", "frp": 10.0},
        {"latitude": lat, "longitude": lon, "acq_date": "2026-01-01", "confidence": "n", "frp": 10.0},
        {"latitude": lat, "longitude": lon, "acq_date": "2026-01-01", "confidence": "l", "frp": 10.0},
        {"latitude": lat, "longitude": lon, "acq_date": "2026-01-01", "confidence": None, "frp": 10.0},
        {"latitude": lat, "longitude": lon, "acq_date": "2026-01-01", "confidence": np.nan, "frp": 10.0},
        {"latitude": lat, "longitude": lon, "acq_date": "2026-01-01", "confidence": "garbage", "frp": 10.0},
        {"latitude": lat, "longitude": lon, "acq_date": "2026-01-01", "confidence": 100, "frp": 10.0},
        {"latitude": lat, "longitude": lon, "acq_date": "2026-01-01", "confidence": "100", "frp": 10.0},
    ]
    df = pd.DataFrame(conf_samples)
    res = aggregate_daily(df)
    assert len(res) == 1
    # 5 out of 12 detections are high confidence ("high", "h", "HIGH", "H", " high ")
    assert res.loc[0, "confidence_high_any"] == 1
    assert np.isclose(res.loc[0, "pct_high_confidence"], 5.0 / 12.0)
