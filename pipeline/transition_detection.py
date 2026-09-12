"""Thermal-regime transition detection over MONTHLY rollups only.

Input is the output of `TimelineService._period_frame(granularity="month")` —
never raw daily rows. Exactly six states exist (see TRANSITION_STATES); there
is deliberately no land-use transition state: `land_use_claim` is False on
every row, unconditionally, because a thermal-regime change is not evidence
that a cell's land use changed. A farmland_to_industrial-style claim is
structurally impossible here — no such state exists and no code path
constructs one.

Design notes (v2):
- Regimes are computed on a CALENDAR-month spine, not on present rows: a
  seasonal cell whose inactive months simply have no row must not read as
  persistent. Missing calendar months count as zero-detection months.
- Trailing-12 activity windows map to `persistent` (>=10 active months),
  `seasonal` (3-7 active with a >=3-month contiguous inactive run), or None
  (in between). Because the window slides one month at a time, a regime flip
  passes through None months (8-9 active -> None); transitions are therefore
  detected ACROSS the None bridge: the new regime must hold two consecutive
  calendar months and the old regime must be the last established one.
- `thermal_regime_change` is the within-regime intensity axis: a >=3x step
  in monthly detection volume across consecutive 6-month halves of a
  persistent run. Seasonal months are excluded (their 6-month means swing by
  construction; the comparison would false-fire on ordinary seasonality).
- `class_change` fires at an activity-transition boundary only when a
  `dominant_class` column exists and the class actually flipped.
- Supporting months (the evidence pair): for a persistent target the two
  consecutive bridge-exit months; for a seasonal target the two most recent
  adjacent months in the establishing window that clear the detection floor
  (the seasonal cycle's active months). Each must have >=10 detections and
  >=3 fire days, and the summed monthly archive_gap_days proxy
  (# ponytail: a per-run daily check would need raw daily rows, which this
  module must not read) must stay <=30 on the boundary.
"""

from __future__ import annotations

from typing import Any

import pandas as pd

TRANSITION_STATES = frozenset({
    "stable",
    "thermal_regime_change",
    "seasonal_to_persistent",
    "persistent_to_seasonal",
    "class_change",
    "insufficient_history",
})

MIN_HISTORY_MONTHS = 12
SUPPORTING_MIN_DETECTIONS = 10
SUPPORTING_MIN_FIRE_DAYS = 3
MAX_BOUNDARY_GAP_DAYS = 30
PERSISTENT_MIN_ACTIVE = 10   # active calendar months out of trailing 12
SEASONAL_MIN_ACTIVE, SEASONAL_MAX_ACTIVE = 3, 7
SEASONAL_MIN_CONTIGUOUS_INACTIVE = 3
THERMAL_STEP_RATIO = 3.0     # >=3x step in 6-month mean detections
INTENSITY_WINDOW = 6         # recent vs prior half-window, in calendar months

_BASE: dict[str, Any] = {
    "transition_state": "insufficient_history",
    "transition_type": "insufficient_history",
    "transition_confidence": "low",
    "transition_evidence": [],
    "supporting_detection_count": 0,
    "supporting_active_days": 0,
    "gap_before_transition_days": 0,
    "land_use_claim": False,  # unconditional — thermal evidence only
}


def _activity_regime(active_window: list[bool]) -> str | None:
    """Regime for the calendar month closing a trailing-12 activity window."""
    if len(active_window) < MIN_HISTORY_MONTHS:
        return None
    n_active = sum(active_window)
    if n_active >= PERSISTENT_MIN_ACTIVE:
        return "persistent"
    if SEASONAL_MIN_ACTIVE <= n_active <= SEASONAL_MAX_ACTIVE:
        run = best_inactive_run = 0
        for flag in active_window:
            run = run + 1 if not flag else 0
            best_inactive_run = max(best_inactive_run, run)
        if best_inactive_run >= SEASONAL_MIN_CONTIGUOUS_INACTIVE:
            return "seasonal"
    return None


def _confidence(det_a: int, det_b: int) -> str:
    if min(det_a, det_b) >= 50:
        return "high"
    if min(det_a, det_b) >= 20:
        return "medium"
    return "low"


def _annotate_cell(group: pd.DataFrame) -> list[dict[str, Any]]:
    """Annotate one cell's rows (sorted by period_start) using a calendar-month
    spine. Returns one annotation dict per row of `group`, in sorted order."""
    group = group.sort_values("period_start").reset_index(drop=True)
    n = len(group)
    rows: list[dict[str, Any]] = [dict(_BASE) for _ in range(n)]
    if n == 0:
        return rows

    start = group["period_start"].iloc[0].to_period("M")
    end = group["period_start"].iloc[-1].to_period("M")
    calendar = pd.period_range(start, end, freq="M")
    cal_of_row = [(ts.to_period("M") - start).n for ts in group["period_start"]]
    span = len(calendar)

    # Calendar-spine signals; absent months read as zero detections.
    det_cal = [0] * span
    fd_cal = [0] * span
    gap_cal = [0] * span
    row_at_cal: dict[int, int] = {}
    for pos in range(n):
        c = cal_of_row[pos]
        row_at_cal[c] = pos
        det_cal[c] = int(group["n_detections"].iloc[pos])
        fd_cal[c] = int(group["fire_days"].iloc[pos])
        gap_cal[c] = int(group["archive_gap_days"].iloc[pos])

    if span < MIN_HISTORY_MONTHS:
        return rows

    active_cal = [d > 0 for d in det_cal]
    regimes = [_activity_regime(active_cal[max(0, c - MIN_HISTORY_MONTHS + 1) : c + 1]) for c in range(span)]
    first_regime_cal = next((c for c, r in enumerate(regimes) if r is not None), None)
    if first_regime_cal is None:
        # No trailing-12 window ever establishes a regime — honest answer is
        # insufficient_history for every row, never a bare "stable".
        return rows
    for pos in range(n):
        if cal_of_row[pos] >= first_regime_cal:
            rows[pos]["transition_state"] = rows[pos]["transition_type"] = "stable"

    def _row_for(c: int) -> int | None:
        """Present-row position for calendar month c, else the next present row."""
        if c in row_at_cal:
            return row_at_cal[c]
        nxt = [p for cal, p in row_at_cal.items() if cal >= c]
        return min(nxt) if nxt else None

    def _supporting(c_target: str, i: int) -> tuple[int, int] | None:
        """Calendar months (a, b) carrying the new regime's evidence."""
        if c_target == "persistent":
            return (i, i + 1) if det_cal[i + 1] >= SUPPORTING_MIN_DETECTIONS else None
        window = range(max(0, i - MIN_HISTORY_MONTHS + 1), i + 1)
        qualified = [j for j in window if det_cal[j] >= SUPPORTING_MIN_DETECTIONS]
        if len(qualified) < 2 or qualified[-1] - qualified[-2] != 1:
            return None
        return (qualified[-2], qualified[-1])

    def _gates(a: int, b: int) -> bool:
        gap_before = gap_cal[a - 1] if a > 0 else 0
        return (
            det_cal[a] >= SUPPORTING_MIN_DETECTIONS and det_cal[b] >= SUPPORTING_MIN_DETECTIONS
            and fd_cal[a] >= SUPPORTING_MIN_FIRE_DAYS and fd_cal[b] >= SUPPORTING_MIN_FIRE_DAYS
            and gap_before <= MAX_BOUNDARY_GAP_DAYS
            and gap_cal[a] <= MAX_BOUNDARY_GAP_DAYS and gap_cal[b] <= MAX_BOUNDARY_GAP_DAYS
        )

    def _accept(c_transition: int, a: int, b: int, ttype: str, evidence: str) -> None:
        pos = _row_for(c_transition)
        if pos is None:
            return
        rows[pos].update({
            "transition_state": ttype,
            "transition_type": ttype,
            "transition_confidence": _confidence(det_cal[a], det_cal[b]),
            "transition_evidence": [evidence],
            "supporting_detection_count": det_cal[a] + det_cal[b],
            "supporting_active_days": fd_cal[a] + fd_cal[b],
            "gap_before_transition_days": gap_cal[a - 1] if a > 0 else 0,
            "land_use_claim": False,  # unconditional — thermal evidence only
        })

    # Activity-regime transitions, detected across None bridges.
    has_class = "dominant_class" in group.columns
    class_cal: list[str | None] = [None] * span
    if has_class:
        for pos in range(n):
            class_cal[cal_of_row[pos]] = str(group["dominant_class"].iloc[pos])
    last: str | None = None
    for c in range(MIN_HISTORY_MONTHS - 1, span - 1):
        r = regimes[c]
        if r is None:
            continue
        if last is not None and r != last and regimes[c + 1] == r:
            if (last, r) in (("seasonal", "persistent"), ("persistent", "seasonal")):
                supporting = _supporting(r, c)
                if supporting is not None and _gates(*supporting):
                    a, b = supporting
                    _accept(
                        c, a, b, f"{last}_to_{r}",
                        f"month {str(calendar[c])}: trailing-12 regime {last} -> {r}, "
                        f"evidence months {str(calendar[a])}/{str(calendar[b])}",
                    )
            elif (
                has_class
                and class_cal[c - 1] is not None and class_cal[c] is not None
                and class_cal[c - 1] != class_cal[c]
                and (supporting := _supporting(r, c)) is not None and _gates(*supporting)
            ):
                a, b = supporting
                _accept(
                    c, a, b, "class_change",
                    f"month {str(calendar[c])}: dominant class "
                    f"{class_cal[c - 1]} -> {class_cal[c]}",
                )
        last = r

    # Within-persistent-run intensity steps (thermal_regime_change).
    w = INTENSITY_WINDOW
    for c in range(2 * w - 1, span - 1):
        if regimes[c] != "persistent" or regimes[c + 1] != "persistent":
            continue
        recent = det_cal[c - w + 1 : c + 2]
        prior = det_cal[c - 2 * w + 1 : c - w + 1]
        recent_mean = sum(recent) / len(recent)
        prior_mean = sum(prior) / len(prior)
        if prior_mean < SUPPORTING_MIN_DETECTIONS or recent_mean < SUPPORTING_MIN_DETECTIONS:
            continue
        if not (recent_mean >= THERMAL_STEP_RATIO * prior_mean or prior_mean >= THERMAL_STEP_RATIO * recent_mean):
            continue
        if not _gates(c, c + 1):
            continue
        _accept(
            c, c, c + 1, "thermal_regime_change",
            f"month {str(calendar[c])}: persistent-run detection volume stepped "
            f"{prior_mean:.1f}/mo -> {recent_mean:.1f}/mo (6-month means)",
        )
        break  # one intensity annotation per persistent run

    return rows


def annotate_transitions(monthly_frame: pd.DataFrame) -> pd.DataFrame:
    """Return the frame with transition columns; only meaningful for monthly
    rollups — callers must not pass daily or yearly frames.

    Annotations are mapped back through each group's ORIGINAL index, so
    interleaved cells can never receive another cell's annotation."""
    out = monthly_frame.copy()
    for col, value in _BASE.items():
        out[col] = [value] * len(out) if isinstance(value, list) else value
    for _, group in out.groupby("h3_08", sort=False):
        ordered = group.sort_values("period_start")
        ann_df = pd.DataFrame(_annotate_cell(ordered), index=ordered.index)
        for col in _BASE:
            out.loc[ann_df.index, col] = ann_df[col]
    assert bool((out["land_use_claim"] == False).all())  # noqa: E712 — hard guarantee
    assert set(out["transition_state"].unique()) <= TRANSITION_STATES
    return out
