"""Human-readable formatting for SHAP feature attributions + caveat surfacing.

Phase 4 deliverable. Top-3 SHAP drivers are turned into analyst-facing strings,
and the honesty caveats from ``settings.CAVEAT_MANIFEST`` are surfaced.

The module exposes ``humanize_feature`` and ``top_human_features`` so the
model service can reuse them without duplicating formatting logic.
"""

from __future__ import annotations

from typing import Any, Optional

from app.core.config import settings


def humanize_feature(feature_name: str, feature_value: Any) -> str:
    """Format one feature into a human-readable clause for analyst panels."""
    val_raw = feature_value
    val = _fmt(val_raw)

    if feature_name.startswith("dist_") and feature_name.endswith("_km"):
        label = feature_name.replace("dist_", "").replace("_km", "").replace("_", " ")
        return f"{val} km from mapped {label}"

    if feature_name.startswith("n_"):
        label = (
            feature_name.replace("n_wri_", "")
            .replace("n_osm_", "")
            .replace("_10km", "")
            .replace("_5km", "")
            .replace("_", " ")
        )
        return f"{feature_value} mapped {label} around cell"

    if feature_name.startswith("active_days"):
        return f"{feature_value} active days in prior window"

    if feature_name.startswith("frp_max"):
        return f"peak fire intensity {val} (FRP)"

    if feature_name == "daynight":
        return f"observed during {'daylight' if str(val_raw) == 'Day' else 'night'}"

    if feature_name == "pct_high_confidence":
        return f"{val}% of detections high-confidence"

    return f"{feature_name} = {feature_value}"


def top_human_features(
    attributions: list[Any], top_n: int = 3
) -> list[str]:
    """Top-N SHAP drivers (by |shap_value|) as human-readable strings."""
    if not attributions:
        return []
    ranked = sorted(
        attributions, key=lambda a: abs(getattr(a, "shap_value", 0.0)), reverse=True
    )
    return [
        humanize_feature(a.feature_name, getattr(a, "feature_value", ""))
        for a in ranked[:top_n]
    ]


def active_caveats(predicted_class: Optional[str] = None) -> list[str]:
    """Judge-facing honesty caveats relevant to a prediction.

    Always surfaces the label-scheme circularity (it affects every prediction's
    interpretation); additionally notes low mining support when the class is
    mining, and the satellite-identity limitation generally.
    """
    caveats: list[str] = [settings.CAVEAT_MANIFEST["pseudo_label_circularity"]]
    if predicted_class == "mining":
        caveats.append(settings.CAVEAT_MANIFEST["mining_low_support"])
    caveats.append(settings.CAVEAT_MANIFEST["satellite_nunique_only"])
    return caveats


def _fmt(v: Any) -> str:
    try:
        return f"{float(v):.1f}".rstrip("0").rstrip(".")
    except (TypeError, ValueError):
        return str(v)