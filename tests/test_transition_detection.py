"""Tests for pipeline.transition_detection.annotate_transitions.

Positive-path tests are mandatory: each named transition state must be
demonstrated reachable by a concrete fixture (the v1 module had a structural
flaw where named transitions were unreachable in gap-free sequential data —
a failed positive test was rationalized away; see AGENT_LOG correction).
"""

from __future__ import annotations

import pandas as pd

from pipeline.transition_detection import (
    MAX_BOUNDARY_GAP_DAYS,
    TRANSITION_STATES,
    annotate_transitions,
)

NAMED = {"seasonal_to_persistent", "persistent_to_seasonal", "thermal_regime_change", "class_change"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_monthly(h3: str, months: list[tuple[str, int, int, int]]) -> pd.DataFrame:
    """months: list of (period_start_str, n_detections, fire_days, archive_gap_days)."""
    rows = []
    for period_start_str, n_det, f_days, gap in months:
        rows.append({
            "h3_08": h3,
            "n_detections": n_det,
            "fire_days": f_days,
            "frp_max": float(max(n_det, 1)),
            "archive_gap_days": gap,
            "period_start": pd.Timestamp(period_start_str),
            "period_end": pd.Timestamp(period_start_str) + pd.offsets.MonthEnd(1),
            "acq_date": pd.Timestamp(period_start_str),
        })
    return pd.DataFrame(rows)


def _year_months(year: int, active: set[int], det: int, fd: int, gap: int = 0):
    """12 months of `year`; active months carry (det, fd), inactive (0, 0)."""
    out = []
    for m in range(1, 13):
        d, f = (det, fd) if m in active else (0, 0)
        out.append((f"{year}-{m:02d}-01", d, f, gap if m in active else 0))
    return out


def _transition_rows(out: pd.DataFrame) -> pd.DataFrame:
    return out[out["transition_state"].isin(NAMED)]


# ---------------------------------------------------------------------------
# Positive paths — each named state proven reachable
# ---------------------------------------------------------------------------

def test_seasonal_to_persistent_accepted():
    """2022 seasonal (active Jan-Mar), 2023 fully active -> one accepted
    seasonal_to_persistent once the trailing-12 window crosses the bridge."""
    months = _year_months(2022, {1, 2, 3}, det=80, fd=20) + _year_months(2023, set(range(1, 13)), det=80, fd=20)
    out = annotate_transitions(_make_monthly("88a0000001fffff", months))

    fired = _transition_rows(out)
    assert len(fired) == 1, fired[["period_start", "transition_state"]].to_string()
    row = fired.iloc[0]
    assert row["transition_state"] == "seasonal_to_persistent"
    assert row["period_start"] == pd.Timestamp("2023-10-01")  # bridge exit: window 2022-11..2023-10 first hits 10 active
    assert row["supporting_detection_count"] == 160
    assert row["supporting_active_days"] == 40
    assert row["gap_before_transition_days"] == 0
    assert bool(row["land_use_claim"]) is False
    assert row["transition_evidence"] and "seasonal -> persistent" in row["transition_evidence"][0]


def test_persistent_to_seasonal_accepted():
    """2022-2023 fully active, 2024 seasonal (Jan-Mar) -> persistent_to_seasonal
    fires when the trailing-12 window accumulates enough inactive months.
    Supporting months are the seasonal cycle's active months (2024-02/03)."""
    months = (
        _year_months(2022, set(range(1, 13)), det=80, fd=20)
        + _year_months(2023, set(range(1, 13)), det=80, fd=20)
        + _year_months(2024, {1, 2, 3}, det=80, fd=20)
    )
    out = annotate_transitions(_make_monthly("88a0000002fffff", months))

    fired = _transition_rows(out)
    assert len(fired) == 1, fired[["period_start", "transition_state"]].to_string()
    row = fired.iloc[0]
    assert row["transition_state"] == "persistent_to_seasonal"
    assert row["period_start"] == pd.Timestamp("2024-08-01")
    assert row["supporting_detection_count"] == 160
    assert row["supporting_active_days"] == 40
    assert bool(row["land_use_claim"]) is False


def test_thermal_regime_change_intensity_step():
    """Persistent cell whose detection volume steps 20/mo -> 120/mo across a
    year boundary fires thermal_regime_change (within-regime intensity axis)."""
    months = _year_months(2022, set(range(1, 13)), det=20, fd=5) + _year_months(2023, set(range(1, 13)), det=120, fd=25)
    out = annotate_transitions(_make_monthly("88a0000003fffff", months))

    fired = _transition_rows(out)
    assert len(fired) == 1, fired[["period_start", "transition_state"]].to_string()
    row = fired.iloc[0]
    assert row["transition_state"] == "thermal_regime_change"
    assert row["supporting_detection_count"] == 240
    assert bool(row["land_use_claim"]) is False
    assert "stepped" in row["transition_evidence"][0]


# ---------------------------------------------------------------------------
# Negative paths
# ---------------------------------------------------------------------------

def test_stable_cell():
    """Fully persistent 24 months: no transitions; rows before the first
    established trailing-12 window are honest insufficient_history."""
    months = _year_months(2022, set(range(1, 13)), det=80, fd=20) + _year_months(2023, set(range(1, 13)), det=80, fd=20)
    out = annotate_transitions(_make_monthly("88b0000004fffff", months))

    assert len(_transition_rows(out)) == 0
    assert (out.loc[:10, "transition_state"] == "insufficient_history").all()
    assert (out.loc[11:, "transition_state"] == "stable").all()


def test_noise_spike_no_transition():
    """Single 30-detection month in an otherwise dead cell: no regime is ever
    established, so every row is insufficient_history — never 'stable', never
    a named transition."""
    months = _year_months(2023, set(), det=0, fd=0) + _year_months(2024, set(), det=0, fd=0)
    months[12] = ("2024-01-01", 30, 10, 0)
    out = annotate_transitions(_make_monthly("88b0000005fffff", months))

    assert (out["transition_state"] == "insufficient_history").all()
    assert len(_transition_rows(out)) == 0


def test_acceptance_gate_low_detections():
    """Regime flips with <10 detections in the supporting months must not fire."""
    months = (
        _year_months(2022, {1, 2, 3}, det=5, fd=2)
        + _year_months(2023, set(range(1, 13)), det=5, fd=2)
    )
    out = annotate_transitions(_make_monthly("88b0000006fffff", months))
    assert len(_transition_rows(out)) == 0


def test_gap_boundary_rejected():
    """A >30-day archive gap crossing the transition boundary rejects the
    transition even with strong detection counts."""
    base = _year_months(2022, {1, 2, 3}, det=80, fd=20) + _year_months(2023, set(range(1, 13)), det=80, fd=20)

    for gap_month_idx in (20, 21):  # month before and at the bridge exit
        months = [list(m) for m in base]
        months[gap_month_idx][3] = MAX_BOUNDARY_GAP_DAYS + 15
        out = annotate_transitions(_make_monthly("88b0000007fffff", [tuple(m) for m in months]))
        fired = _transition_rows(out)
        assert len(fired) == 0, f"gap at idx {gap_month_idx} not rejected"


def test_insufficient_history_short_cell():
    months = _year_months(2025, {1, 2, 3}, det=80, fd=20)[:8]
    out = annotate_transitions(_make_monthly("88b0000008fffff", months))
    assert (out["transition_state"] == "insufficient_history").all()


def test_sparse_rows_seasonal_not_persistent():
    """A seasonal cell whose inactive months have NO rows at all (sparse
    monthly layer) must still read seasonal — never persistent. Calendar-spine
    regimes, not row-count regimes."""
    months = [
        m for m in (
            _year_months(2022, {1, 2, 3}, det=80, fd=20)
            + _year_months(2023, {1, 2, 3}, det=80, fd=20)
            + _year_months(2024, {1, 2, 3}, det=80, fd=20)
        ) if m[1] > 0  # drop inactive months entirely — sparse layer
    ]
    out = annotate_transitions(_make_monthly("88b0000009fffff", months))
    assert len(out) == 9  # only active months present
    assert len(_transition_rows(out)) == 0  # three identical seasonal years: no flip
    assert (out.loc[:2, "transition_state"] == "insufficient_history").all()  # no 12-mo window yet
    assert (out.loc[3:, "transition_state"] == "stable").all()


# ---------------------------------------------------------------------------
# Structural guarantees
# ---------------------------------------------------------------------------

def test_interleaved_cells_keep_own_annotations():
    """Positional-assignment regression: rows of two cells interleaved —
    each cell must keep its own annotations."""
    x = _make_monthly(
        "88c000000afffff",
        _year_months(2022, {1, 2, 3}, det=80, fd=20) + _year_months(2023, set(range(1, 13)), det=80, fd=20),
    )
    y = _make_monthly(
        "88c000000bfffff",
        _year_months(2022, set(range(1, 13)), det=40, fd=10) + _year_months(2023, set(range(1, 13)), det=40, fd=10),
    )
    interleaved = pd.concat([x, y]).sort_values(["period_start", "h3_08"]).reset_index(drop=True)
    out = annotate_transitions(interleaved)

    x_out = out[out["h3_08"] == "88c000000afffff"]
    y_out = out[out["h3_08"] == "88c000000bfffff"]
    assert (x_out["transition_state"] == "seasonal_to_persistent").sum() == 1
    assert len(_transition_rows(y_out)) == 0  # always-persistent cell: stable


def test_land_use_claim_false_always():
    frames = [
        _make_monthly("88d000000cfffff", _year_months(2021, set(range(1, 13)), det=80, fd=20) + _year_months(2022, set(range(1, 13)), det=80, fd=20)),
        _make_monthly("88d000000dfffff", _year_months(2025, {1, 2, 3}, det=80, fd=20)[:5]),
        _make_monthly(
            "88d000000efffff",
            _year_months(2022, {1, 2, 3}, det=80, fd=20) + _year_months(2023, set(range(1, 13)), det=120, fd=25),
        ),
    ]
    out = annotate_transitions(pd.concat(frames, ignore_index=True))
    assert (out["land_use_claim"] == False).all()


def test_transition_state_set_is_exactly_six():
    assert TRANSITION_STATES == {
        "stable", "thermal_regime_change", "seasonal_to_persistent",
        "persistent_to_seasonal", "class_change", "insufficient_history",
    }


def test_output_states_always_valid():
    months = _year_months(2021, {1, 2, 3}, det=80, fd=20) + _year_months(2022, set(range(1, 13)), det=80, fd=20)
    out = annotate_transitions(_make_monthly("88e000000fffff", months))
    assert set(out["transition_state"].unique()) <= TRANSITION_STATES


# ---------------------------------------------------------------------------
# End-to-end: monthly materialized layer carries transitions
# ---------------------------------------------------------------------------

def test_end_to_end_monthly_layer_carries_transitions(tmp_path):
    """daily df -> build_materialized_layers -> monthly parquet -> the layer
    itself contains the accepted transition annotation."""
    import pandas as pd

    from pipeline.timeline_materializer import build_materialized_layers

    rows = []
    def add_days(year, months_active):
        for m in months_active:
            for day in (3, 12, 21):  # 3 fire days per active month
                rows.append({
                    "h3_08": "88f0000010fffff",
                    "acq_date": pd.Timestamp(f"{year}-{m:02d}-{day:02d}"),
                    "n_detections": 30,
                    "frp_max": 12.0,
                    "n_detections_night": 1,
                    "satellite_nunique": 1,
                })
    add_days(2022, {1, 2, 3})
    add_days(2023, set(range(1, 13)))
    daily = pd.DataFrame(rows)

    build_materialized_layers(daily, tmp_path)
    monthly = pd.read_parquet(tmp_path / "h3_timeline_monthly.parquet")

    assert "transition_state" in monthly.columns
    fired = monthly[monthly["transition_state"] == "seasonal_to_persistent"]
    assert len(fired) == 1, monthly[["period", "n_detections", "transition_state"]].to_string()
    assert (monthly["land_use_claim"] == False).all()
