"""Thermal-regime classification: persistent sources vs new anomalies.

Separates routine, continuously-active thermal sources (gas flares, smelters,
mining machinery — the background heat an analyst must not mistake for an
incident) from recently-emerged bursts (new wildfire ignitions, fresh stubble
burning — the "natural disaster"-shaped anomalies worth attention).

The rule is a deterministic, mechanical read of the SAME trailing-activity
features the model already consumes (active_days_7d / active_days_30d /
active_days_90d from the H3-day feature store). It is deliberately NOT a
model output: no confidence, no calibration, nothing invented — when the
activity features are missing the regime is None (unknown), never guessed.

Thresholds mirror pipeline/transition_detection.py's monthly bar for
`persistent` (>=10 active months of 12, i.e. ~80% duty cycle), expressed on
the daily windows:

- persistent    : active >= 24 of last 30 days AND >= 5 of last 7
                  (burning almost daily for a month and still active now)
- new_anomaly   : active >= 2 of last 7 days AND <= 10 of last 30
                  (burst this week after a mostly-quiet month)
- intermittent  : anything else (stubble seasons, sporadic burns)
"""

from __future__ import annotations

from typing import Any

REGIME_PERSISTENT = "persistent"
REGIME_NEW_ANOMALY = "new_anomaly"
REGIME_INTERMITTENT = "intermittent"

# Trailing-window duty-cycle thresholds (days active).
_PERSISTENT_30D_MIN = 24  # ~80% of the month, matching the 10/12-month bar
_PERSISTENT_7D_MIN = 5    # and still active this week
_ANOMALY_7D_MIN = 2       # a real burst, not a single-pass blip
_ANOMALY_30D_MAX = 10     # but the preceding month was mostly quiet


def _active_days(cell_features: dict[str, Any], key: str) -> float | None:
    value = cell_features.get(key)
    if value is None or isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def classify_regime(cell_features: dict[str, Any]) -> tuple[str | None, str | None]:
    """(thermal_regime, basis) from trailing activity features.

    The basis states the actual feature numbers behind the label so the UI
    never shows an unexplained badge. Returns (None, None) when the activity
    features are absent — e.g. legacy rows — rather than fabricating a regime.
    """
    d7 = _active_days(cell_features, "active_days_7d")
    d30 = _active_days(cell_features, "active_days_30d")
    d90 = _active_days(cell_features, "active_days_90d")
    if d7 is None or d30 is None:
        return None, None

    d90_part = f", {int(d90)} of last 90" if d90 is not None else ""
    if d30 >= _PERSISTENT_30D_MIN and d7 >= _PERSISTENT_7D_MIN:
        return REGIME_PERSISTENT, (
            f"Active {int(d7)} of last 7 days and {int(d30)} of last 30{d90_part}"
            " — continuous operation, not a new event."
        )
    if d7 >= _ANOMALY_7D_MIN and d30 <= _ANOMALY_30D_MAX:
        return REGIME_NEW_ANOMALY, (
            f"Newly active: {int(d7)} of last 7 days after only {int(d30)} of last 30{d90_part}"
            " — recent onset, treat as a fresh anomaly."
        )
    return REGIME_INTERMITTENT, (
        f"Sporadic activity: {int(d7)} of last 7 days, {int(d30)} of last 30{d90_part}"
        " — neither continuous nor a fresh burst."
    )
