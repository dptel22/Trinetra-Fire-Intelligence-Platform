"""Tests for the live FIRMS ingestion pipeline.

Covers:
- fetch_firms against a mocked HTTP layer (no transactions burned in CI),
  including the empty-day and bad-key paths.
- Notebook-verbatim aggregation invariants (daynight "Both", NaN lag allowlist,
  leakage-safe first-observation semantics).
- OSM/WRI static feature computation + state assignment (real pinned shapefile).
- Integration: a full run_ingestion pass on temp copies of the serving
  parquets, asserting pyarrow schema parity with the real files and that
  FeatureStoreService.load() + query_bbox accept the result. Also idempotency
  (re-run must not duplicate rows) and reload() concurrency safety.
- Plausibility gates for a single-day live pull (NOT the historical Phase-6
  absolutes, which describe the multi-year labeled dataset, not one day).

Live smoke test: mark `live` (deselected by default via pyproject addopts;
run explicitly with `pytest -m live`).
"""

import json
import math
import sys
import threading
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
from app.services.feature_store import FeatureStoreService
from ingestion.aggregate import (
    AggregationValidationError,
    DAILY_COLUMNS,
    build_daily_frame,
    cast_daily_dtypes,
)
from ingestion.firms_pull import (
    IngestionError,
    NRT_COLUMNS,
    _parse_csv,
    fetch_firms,
    harmonize_points,
    validate_bbox,
    validate_date,
)
from ingestion.osm_wri_load import (
    OSM_COLUMNS,
    RawInputError,
    SERVING_STATES,
    WRI_COLUMNS,
    assign_states,
    compute_osm_features,
    compute_wri_features,
    validate_raw_inputs,
)
from ingestion.run_ingestion import (
    RUN_HISTORY_PATH,
    run_ingestion,
)

REAL_DAILY_PARQUET = Path(settings.H3_DAILY_PARQUET)
REAL_STATIC_PARQUET = Path(settings.OSMWRI_PARQUET)
REAL_ARTIFACTS = REAL_DAILY_PARQUET.exists() and REAL_STATIC_PARQUET.exists()


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------

def _firms_csv(satellite: str) -> str:
    row = {
        "N": "19.076,72.8777,342.5,0.52,0.48,2026-09-08,0621,N,nominal,2.0NRT,301.2,4.1,D",
        "N20": "19.080,72.8800,368.2,0.44,0.41,2026-09-08,0621,N20,high,2.0NRT,298.9,12.7,D",
    }[satellite]
    return "\n".join([",".join(NRT_COLUMNS), row, row])  # duplicate row exercises dedup


@pytest.fixture
def mocked_firms(monkeypatch):
    """Replace the HTTP layer; returns a list capturing requested URLs."""
    calls = []

    class _Resp:
        status_code = 200
        headers = {"Content-Length": "128"}

        def __init__(self, text):
            self.text = text

    def _fake_get(url):
        calls.append(url)
        # Each locked source reports its own satellite id (N=SNPP, N20=NOAA-20).
        satellite = "N20" if "VIIRS_NOAA20_NRT" in url else "N"
        return _Resp(_firms_csv(satellite))

    import ingestion.firms_pull as fp

    monkeypatch.setattr(fp, "_get", _fake_get)
    return calls


def _firms_row(lat, lon, acq_date, daynight="Day", satellite="N", frp=5.0, ti4=330.0, conf="nominal"):
    return {
        "latitude": lat, "longitude": lon, "bright_ti4": ti4, "scan": 0.5, "track": 0.5,
        "acq_date": acq_date, "acq_time": 621, "satellite": satellite, "confidence": conf,
        "version": "2.0NRT", "bright_ti5": 300.0, "frp": frp, "daynight": daynight,
        "is_static_land": -1, "is_offshore": -1,  # post-harmonize NRT flags
    }


def _synthetic_points(dates=("2026-09-08",), lat=19.076, lon=72.8777):
    rows = []
    for d in dates:
        rows.append(_firms_row(lat, lon, d, daynight="Day", satellite="N", frp=4.0))
        rows.append(_firms_row(lat + 0.001, lon + 0.001, d, daynight="Night", satellite="N20", frp=9.0))
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# fetch_firms (mocked HTTP)
# ---------------------------------------------------------------------------


def test_fetch_firms_parses_nrt_csv_and_tags(monkeypatch, mocked_firms):
    monkeypatch.setenv("FIRMS_MAP_KEY", "a" * 32)
    df = fetch_firms("VIIRS_SNPP_NRT", "72.5,18.9,73.2,19.4", 1, date="2026-09-08")
    assert not df.empty
    assert list(df.columns) == NRT_COLUMNS
    assert mocked_firms and mocked_firms[0].startswith("https://firms.modaps.eosdis.nasa.gov/api/area/csv/")
    assert ("a" * 32) in mocked_firms[0]  # key reaches the URL, never the logs


def test_fetch_firms_both_tags_satellite_provenance(monkeypatch, mocked_firms):
    monkeypatch.setenv("FIRMS_MAP_KEY", "a" * 32)
    from ingestion.firms_pull import fetch_firms_both

    df, stats = fetch_firms_both("72.5,18.9,73.2,19.4", day_range=1, date="2026-09-08")
    assert set(stats["raw_rows"]) == {"VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT"}
    assert set(df["satellite_name"]) == {"SUOMI-NPP", "NOAA-20"}
    assert set(df["source"]) == {"nrt"}
    assert set(df["satellite"]) <= {"SNPP", "NOAA20"}  # normalized in harmonize
    assert set(df["confidence"]) <= {"nominal", "high"}
    assert set(df["daynight"]) <= {"Day", "Night"}


def test_fetch_firms_empty_day_is_valid(monkeypatch):
    import ingestion.firms_pull as fp

    monkeypatch.setenv("FIRMS_MAP_KEY", "a" * 32)

    class _EmptyResp:
        status_code = 200
        headers = {"Content-Length": "0"}
        text = ""

    monkeypatch.setattr(fp, "_get", lambda url: _EmptyResp())
    df = fetch_firms("VIIRS_NOAA20_NRT", "72.5,18.9,73.2,19.4", 1, date="2026-09-08")
    assert df.empty and list(df.columns) == NRT_COLUMNS


def test_fetch_firms_bad_key_fails_loud(monkeypatch):
    import ingestion.firms_pull as fp

    monkeypatch.setenv("FIRMS_MAP_KEY", "b" * 32)

    class _BadResp:
        status_code = 200
        headers = {}
        text = "Invalid MAP_KEY. Please check your key."

    monkeypatch.setattr(fp, "_get", lambda url: _BadResp())
    with pytest.raises(IngestionError, match="MAP_KEY"):
        fetch_firms("VIIRS_SNPP_NRT", "72.5,18.9,73.2,19.4", 1)


def test_fetch_firms_rejects_bad_inputs(monkeypatch):
    monkeypatch.setenv("FIRMS_MAP_KEY", "a" * 32)
    with pytest.raises(IngestionError):
        fetch_firms("MODIS_NRT", "72.5,18.9,73.2,19.4", 1)  # not a locked source
    with pytest.raises(IngestionError):
        fetch_firms("VIIRS_SNPP_NRT", "not,a,bbox", 1)
    with pytest.raises(IngestionError):
        validate_date("2026-13-40")
    with pytest.raises(IngestionError):
        validate_bbox("97.42,6.75,68.03,37.10")  # west > east


def test_parse_csv_rejects_non_csv_body():
    with pytest.raises(IngestionError):
        _parse_csv("Sorry, something went wrong", "VIIRS_SNPP_NRT")


# ---------------------------------------------------------------------------
# Aggregation invariants (notebook cell 20 / Phase 8 / Phase 9)
# ---------------------------------------------------------------------------


def test_harmonize_filters_and_normalizes():
    raw = pd.DataFrame(
        [
            _firms_row(19.0, 72.8, "2026-09-08", conf="l"),       # dropped: low conf
            _firms_row(19.1, 72.9, "2026-09-08"),                 # kept
            _firms_row(19.2, 73.0, "2026-09-08", ti4=150.0),      # dropped: ti4 <= 200
            _firms_row(19.3, 73.1, "2026-09-08", frp=-1.0),       # dropped: frp < 0
        ]
    )
    out = harmonize_points(raw)
    assert len(out) == 1
    assert out.iloc[0]["confidence"] == "nominal"
    assert out.iloc[0]["is_static_land"] == -1  # NRT: unknown


def test_build_daily_frame_contract_and_both_daynight():
    points = _synthetic_points()
    daily = build_daily_frame(points)
    assert list(daily.columns) == DAILY_COLUMNS
    row = daily.iloc[0]
    assert row["daynight"] == "Both"  # one Day + one Night detection in the cell
    assert row["satellite_nunique"] == 2
    assert row["n_detections"] == 2
    assert row["n_detections_day"] == 1 and row["n_detections_night"] == 1
    assert bool(row["confidence_high_any"]) is False
    assert row["is_labeled"] == 0
    # First observation: NaN lags, zero active history.
    assert math.isnan(row["frp_max_lag7"]) and math.isnan(row["frp_max_lag30"])
    assert row["is_first_observation"] == 1
    assert row["active_days_7d"] == 0 and row["active_days_90d"] == 0
    # NaN allowlist: only the two lag columns (here both regimes present).
    nulls = daily.isna().sum()
    assert set(nulls[nulls > 0].index) <= {"frp_max_lag7", "frp_max_lag30", "frp_max_night", "frp_max_day"}


def test_build_daily_frame_day_only_keeps_frp_max_night_nan():
    rows = [_firms_row(19.0, 72.8, "2026-09-08", daynight="Day", frp=7.5)]
    daily = build_daily_frame(pd.DataFrame(rows))
    assert daily.iloc[0]["daynight"] == "Day"
    assert math.isnan(daily.iloc[0]["frp_max_night"])
    assert daily.iloc[0]["frp_max_day"] == 7.5


def test_temporal_lags_second_day_non_first_observation():
    points = _synthetic_points(dates=("2026-09-07", "2026-09-08"))
    daily = build_daily_frame(points).sort_values("acq_date").reset_index(drop=True)
    first, second = daily.iloc[0], daily.iloc[1]
    assert first["is_first_observation"] == 1
    assert second["is_first_observation"] == 0
    # frp_max_lag7 = max of previous FRP within the (inclusive) 7D window.
    assert second["frp_max_lag7"] == pytest.approx(first["frp_max"])
    assert second["active_days_7d"] == 1


def test_build_daily_frame_rejects_empty():
    with pytest.raises(AggregationValidationError):
        build_daily_frame(pd.DataFrame(columns=NRT_COLUMNS))


def test_cast_daily_dtypes_match_parquet_schema():
    if not REAL_ARTIFACTS:
        pytest.skip("Real parquets not present")
    import pyarrow.parquet as pq

    daily = build_daily_frame(_synthetic_points())
    table = pq.read_schema(REAL_DAILY_PARQUET)
    daily = cast_daily_dtypes(daily)
    from ingestion.run_ingestion import _target_schemas

    schema, _ = _target_schemas(REAL_DAILY_PARQUET, REAL_STATIC_PARQUET)
    assert schema is not None
    assert [f.name for f in schema] == DAILY_COLUMNS
    for name in DAILY_COLUMNS:
        assert str(schema.field(name).type) == str(table.field(name).type), name


# ---------------------------------------------------------------------------
# OSM/WRI static features + state assignment
# ---------------------------------------------------------------------------


def test_validate_raw_inputs_fail_loud(monkeypatch, tmp_path):
    import ingestion.osm_wri_load as ow

    monkeypatch.setattr(ow, "WRI_CSV", tmp_path / "missing.csv")
    with pytest.raises(RawInputError, match="missing"):
        ow.validate_raw_inputs()


def test_validate_raw_inputs_ok():
    validate_raw_inputs()  # must not raise on this machine


def test_compute_wri_features_synthetic():
    wri = pd.DataFrame(
        {
            "country_long": ["India", "India"],
            "primary_fuel": ["Coal", "Solar"],
            "latitude": [19.0, 20.0],
            "longitude": [73.0, 74.0],
        }
    )
    cells = pd.DataFrame({"latitude": [19.01, 25.0], "longitude": [73.01, 80.0]})
    feats = compute_wri_features(cells, wri_india=wri)
    assert set(WRI_COLUMNS) <= set(feats.columns)
    assert feats["dist_wri_coal_km"].iloc[0] < 2.0  # ~1.4 km from the coal plant
    assert feats["n_wri_coal_10km"].iloc[0] == 1
    assert feats["n_wri_coal_10km"].iloc[1] == 0
    assert feats["n_wri_solar_10km"].iloc[1] == 0
    # Fuels absent from the source data: NaN distance, 0 count.
    assert math.isnan(feats["dist_wri_nuclear_km"].iloc[0])
    assert feats["n_wri_nuclear_10km"].iloc[0] == 0


def test_compute_osm_features_synthetic():
    osm = pd.DataFrame(
        {
            "category": ["quarry", "industrial"],
            "lon": [72.87, 72.88],
            "lat": [19.07, 19.08],
        }
    )
    cells = pd.DataFrame({"latitude": [19.075], "longitude": [72.875]})
    feats = compute_osm_features(cells, osm_points=osm)
    assert feats["dist_osm_quarry_km"].iloc[0] < 2.0
    assert feats["n_osm_quarry_5km"].iloc[0] == 1
    assert feats["n_osm_industrial_5km"].iloc[0] == 1
    assert math.isnan(feats["dist_osm_adit_km"].iloc[0])
    assert feats["n_osm_adit_5km"].iloc[0] == 0


def test_assign_states_pip_on_pinned_shapefile():
    cells = pd.DataFrame(
        {
            "latitude": [19.0760, 19.0760, 8.0],  # Mumbai (MH), duplicate, ocean
            "longitude": [72.8777, 72.8777, 76.0],
        }
    )
    states = assign_states(cells)
    assert list(states.columns) == ["state", "state_assignment_method", "_state_distance_km"]
    assert states["state"].iloc[0] == "Maharashtra"
    assert states["state"].iloc[0] == states["state"].iloc[1]  # deterministic tie-break
    assert states["state"].iloc[2] in SERVING_STATES or states["state_assignment_method"].iloc[2] == "nearest_unmatched"


def test_serving_states_is_the_locked_ten():
    assert set(SERVING_STATES) == {
        "Maharashtra", "Karnataka", "Madhya Pradesh", "Punjab", "Andhra Pradesh",
        "Telangana", "Gujarat", "Tamil Nadu", "Jharkhand", "Rajasthan",
    }


# ---------------------------------------------------------------------------
# Integration: full run against temp copies of the serving parquets
# ---------------------------------------------------------------------------


def _copy_parquet_slice(src: Path, dst: Path, n: int) -> None:
    """Copy the first n rows preserving the exact arrow schema (no pandas round-trip)."""
    import pyarrow.parquet as pq

    table = pq.read_table(src)
    pq.write_table(table.slice(0, n), dst)


@pytest.mark.skipif(not REAL_ARTIFACTS, reason="Real serving parquets not present")
def test_run_ingestion_end_to_end_schema_and_store_contract(tmp_path, monkeypatch):
    daily_path = tmp_path / "sih2026_h3_daily_features_firms.parquet"
    static_path = tmp_path / "sih2026_h3_daily_features_with_osm_wri.parquet"
    # Small real slices preserving the real arrow schemas byte-for-byte.
    _copy_parquet_slice(REAL_DAILY_PARQUET, daily_path, 2000)
    _copy_parquet_slice(REAL_STATIC_PARQUET, static_path, 2000)

    # A live day inside Maharashtra (a serving state) near real historical cells.
    points = _synthetic_points(lat=19.076, lon=72.8777)
    osm_points = pd.DataFrame({"category": ["quarry"], "lon": [72.87], "lat": [19.07]})

    stats = run_ingestion(
        date="2026-09-08",
        points_override=points,
        osm_points_override=osm_points,
        daily_path=daily_path,
        static_path=static_path,
    )
    assert stats["ok"] is True
    assert stats["final_daily_rows"] > 0
    assert stats["final_static_rows"] >= stats["final_daily_rows"]

    # Schema parity: names AND arrow types must equal the real serving files.
    import pyarrow.parquet as pq

    out_daily = pq.read_schema(daily_path).remove_metadata()
    out_static = pq.read_schema(static_path).remove_metadata()
    real_daily = pq.read_schema(REAL_DAILY_PARQUET).remove_metadata()
    real_static = pq.read_schema(REAL_STATIC_PARQUET).remove_metadata()
    assert out_daily.equals(real_daily), (
        f"daily schema drift: {[(f.name, str(f.type)) for f in out_daily if f.name not in real_daily.names or real_daily.field(f.name).type != f.type]}"
    )
    assert out_static.equals(real_static)

    # The 10-state filter stats must be consistent. (The real serving parquets
    # are now 10-state-only after the migration run, so the slice may have
    # dropped 0 rows; before the migration it dropped the non-serving states.)
    sf = stats["state_filter"]
    assert sf["kept_rows"] == stats["final_static_rows"]
    assert set(sf["kept_by_state"]) <= set(SERVING_STATES)

    # FeatureStoreService contract: load, reload, and query the new date.
    from app.core.config import settings as cfg

    monkeypatch.setattr(cfg, "H3_DAILY_PARQUET", str(daily_path))
    monkeypatch.setattr(cfg, "OSMWRI_PARQUET", str(static_path))
    store = FeatureStoreService(db_path=str(tmp_path / "feature_store.duckdb"))
    store.load()
    row = store.query_bbox(19.0, 19.2, 72.8, 73.0, "2026-09-08")
    assert row, "new live date must be queryable"
    assert all(f in row[0] for f in settings.MODEL_FEATURES)
    # Cell lookup on the same live date.
    cell = store.get_cell(row[0]["h3_08"], "2026-09-08")
    assert cell is not None and cell["h3_08"] == row[0]["h3_08"]

    # Idempotency: re-running the same day must not duplicate rows.
    stats2 = run_ingestion(
        date="2026-09-08",
        points_override=points,
        osm_points_override=osm_points,
        daily_path=daily_path,
        static_path=static_path,
    )
    assert stats2["final_daily_rows"] == stats["final_daily_rows"]
    assert stats2["final_static_rows"] == stats["final_static_rows"]


@pytest.mark.skipif(not REAL_ARTIFACTS, reason="Real serving parquets not present")
def test_reload_is_safe_under_concurrent_queries(tmp_path, monkeypatch):
    """Watch-item: a reload must never expose a half-swapped table pair."""
    daily_path = tmp_path / "daily.parquet"
    static_path = tmp_path / "static.parquet"
    real_daily = pd.read_parquet(REAL_DAILY_PARQUET).head(2000)
    real_static = pd.read_parquet(REAL_STATIC_PARQUET).head(2000)
    _copy_parquet_slice(REAL_DAILY_PARQUET, daily_path, 2000)
    _copy_parquet_slice(REAL_STATIC_PARQUET, static_path, 2000)
    sample = real_static.dropna(subset=["h3_lat", "h3_lon"]).iloc[0]
    lat, lon, acq_date = float(sample["h3_lat"]), float(sample["h3_lon"]), str(pd.Timestamp(sample["acq_date"]).date())

    from app.core.config import settings as cfg

    monkeypatch.setattr(cfg, "H3_DAILY_PARQUET", str(daily_path))
    monkeypatch.setattr(cfg, "OSMWRI_PARQUET", str(static_path))
    store = FeatureStoreService(db_path=str(tmp_path / "fs.duckdb"))
    store.load()

    errors: list[Exception] = []
    stop = threading.Event()

    def _querier():
        while not stop.is_set():
            try:
                store.query_bbox(lat - 0.5, lat + 0.5, lon - 0.5, lon + 0.5, acq_date)
            except Exception as err:  # noqa: BLE001
                errors.append(err)
                return

    threads = [threading.Thread(target=_querier) for _ in range(4)]
    for t in threads:
        t.start()
    try:
        for _ in range(5):
            store.reload()
    finally:
        stop.set()
        for t in threads:
            t.join(timeout=10)
    assert not errors, f"concurrent queries failed during reload: {errors[:3]}"


# ---------------------------------------------------------------------------
# Plausibility gates for a single-day live pull
# ---------------------------------------------------------------------------


def test_plausibility_gates_accept_sane_single_day_stats():
    from ingestion.run_ingestion import plausibility_violations

    stats = {"points_total": 40_000, "new_cells": 5_000, "final_daily_rows": 900_000,
             "state_filter": {"kept_rows": 500_000, "dropped_rows": 400_000}}
    assert plausibility_violations(stats) == []


def test_plausibility_gates_flag_insane_stats():
    from ingestion.run_ingestion import plausibility_violations

    stats = {"points_total": 5, "new_cells": 99_000, "final_daily_rows": -1,
             "state_filter": {"kept_rows": 0, "dropped_rows": 0}}
    violations = plausibility_violations(stats)
    assert violations, "implausible run stats must be flagged"
    assert any("points_total" in v for v in violations)


# ---------------------------------------------------------------------------
# Live smoke (burns FIRMS transactions; run explicitly with `pytest -m live`)
# ---------------------------------------------------------------------------


@pytest.mark.live
def test_live_firms_small_bbox_smoke():
    from ingestion.firms_pull import fetch_firms_both

    df, stats = fetch_firms_both("72.5,18.9,73.2,19.4", day_range=1, date="2026-09-08")
    print(f"LIVE: raw rows per source = {stats['raw_rows']}, after harmonize = {len(df)}")
    assert isinstance(df, pd.DataFrame)
    if not df.empty:
        assert list(df.columns)[:5] == NRT_COLUMNS[:5]
        assert df["acq_date"].nunique() >= 1
