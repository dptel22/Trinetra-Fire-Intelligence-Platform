"""Historical FIRMS evidence timelines with explicit provenance caveats."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from pipeline.timeline_features import build_timeline_features
from pipeline.transition_detection import annotate_transitions
from app.services.feature_store import feature_store
from app.core.config import settings


class TimelineDateError(ValueError):
    pass


class TimelineMaterializationError(RuntimeError):
    """Raised when materialized timeline layers are missing or stale.

    Carries the resolved materialization metadata so the API layer can fail
    closed with HTTP 503 and a body that names the offending layer and reason.
    """

    def __init__(self, resolution: dict[str, Any]):
        self.resolution = resolution
        super().__init__(resolution.get("detail", "Timeline layers unavailable"))


class TimelineService:
    MAX_LIMIT = 500

    # Materialized parquet layer that backs each request granularity.
    LAYER_NAMES: dict[str, str] = {"day": "daily", "month": "monthly", "year": "yearly"}
    REQUIRED_LAYERS: dict[str, str] = {
        "daily": "h3_timeline_daily.parquet",
        "monthly": "h3_timeline_monthly.parquet",
        "yearly": "h3_timeline_yearly.parquet",
    }

    def __init__(self, store=feature_store, timeline_dir: str = settings.TIMELINE_DIR):
        self.feature_store = store
        self.timeline_dir = timeline_dir

    def get_timeline(self, **kwargs):
        granularity = kwargs["granularity"]
        resolution = self.resolve_materialization(granularity)
        status = resolution["status"]

        if status == "materialized":
            # Serve the requested granularity's own materialized layer when it
            # exists — re-aggregating the daily layer per request defeats the
            # point of the monthly/yearly rollups.
            if granularity == "day":
                rows = self._materialized_rows(kwargs["h3_index"], "daily")
                response = self.build_response(daily=rows, **kwargs)
            else:
                layer_frame = self._materialized_rows(kwargs["h3_index"], granularity)
                daily_rows = self._materialized_rows(kwargs["h3_index"], "daily")
                response = self.build_response(daily=daily_rows, precomputed_frame=layer_frame, **kwargs)
            response.update(self._materialization_meta(resolution, status="materialized", fallback_used=False))
            return response

        # Layers are missing or stale: fail closed unless fallback is explicitly
        # enabled via TIMELINE_ALLOW_FALLBACK=1.
        if not settings.timeline_allow_fallback():
            raise TimelineMaterializationError(resolution)

        # Development escape hatch: serve raw h3_daily evidence, visibly degraded.
        rows = self.feature_store.rows_for_cell(kwargs["h3_index"])
        response = self.build_response(daily=rows, **kwargs)
        response.update(self._materialization_meta(resolution, status="fallback_h3_daily", fallback_used=True))
        return response

    def resolve_materialization(self, granularity: str) -> dict[str, Any]:
        """Resolve the materialization status for the layer backing ``granularity``.

        Returns a dict with ``status`` (materialized | stale | missing), a human
        ``detail`` string, the offending ``layer`` name, and the manifest
        provenance fields (materialized_at / version / date-range).
        """
        base_dir = Path(self.timeline_dir)
        layer = self.LAYER_NAMES.get(granularity, "daily")
        manifest = self._load_manifest()
        result: dict[str, Any] = {
            "layer": layer,
            "materialized_at": manifest.get("materialized_at") if manifest else None,
            "materialization_version": manifest.get("materialization_version") if manifest else None,
            "materialized_start_date": manifest.get("materialized_start_date") if manifest else None,
            "materialized_end_date": manifest.get("materialized_end_date") if manifest else None,
        }

        if manifest is None:
            result["status"] = "missing"
            result["detail"] = (
                "Timeline materialization manifest is absent; the timeline layers "
                "are not materialized. Run scripts/build_timeline.py."
            )
            return result

        missing = [name for name, filename in self.REQUIRED_LAYERS.items() if not (base_dir / filename).exists()]
        if missing:
            result["status"] = "missing"
            result["detail"] = "Materialized timeline layer(s) missing: " + ", ".join(sorted(missing)) + "."
            return result

        age_hours = self._age_hours(result["materialized_at"])
        if age_hours is None:
            result["status"] = "missing"
            result["detail"] = "Materialization timestamp is missing or unparseable; treat as not materialized."
            return result

        max_age = settings.timeline_max_age_hours(granularity)
        if age_hours > max_age:
            result["status"] = "stale"
            result["detail"] = (
                f"Materialized '{layer}' layer is stale: last materialized {age_hours:.1f}h ago, "
                f"which exceeds the {max_age:.0f}h refresh cadence for '{granularity}' granularity."
            )
            return result

        result["status"] = "materialized"
        result["detail"] = "Timeline layers are materialized and fresh."
        return result

    def _load_manifest(self) -> dict[str, Any] | None:
        path = Path(self.timeline_dir) / settings.TIMELINE_MANIFEST_FILE
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None

    @staticmethod
    def _age_hours(materialized_at: str | None) -> float | None:
        if not materialized_at:
            return None
        try:
            timestamp = datetime.fromisoformat(str(materialized_at).replace("Z", "+00:00"))
        except ValueError:
            return None
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - timestamp).total_seconds() / 3600.0

    @staticmethod
    def _materialization_meta(resolution: dict[str, Any], status: str, fallback_used: bool) -> dict[str, Any]:
        return {
            "materialization_status": status,
            "materialized_at": resolution.get("materialized_at"),
            "materialization_version": resolution.get("materialization_version"),
            "materialized_start_date": resolution.get("materialized_start_date"),
            "materialized_end_date": resolution.get("materialized_end_date"),
            "fallback_used": fallback_used,
        }

    def _materialized_rows(self, h3_index: str, granularity: str) -> pd.DataFrame:
        filename = self.REQUIRED_LAYERS[self.LAYER_NAMES.get(granularity, "daily")]
        path = Path(self.timeline_dir) / filename
        if not path.exists():
            if granularity == "day":
                return pd.DataFrame()
            return self._materialized_rows(h3_index, "day")
        frame = pd.read_parquet(path)
        return frame[frame["h3_08"].astype(str) == str(h3_index)].copy()

    @staticmethod
    def _period_frame(features: pd.DataFrame, granularity: str) -> pd.DataFrame:
        if granularity == "day":
            return features.copy()
        work = features.copy()
        work["period"] = work["acq_date"].dt.to_period("M" if granularity == "month" else "Y")
        rows: list[dict[str, Any]] = []
        for (h3_index, period), group in work.groupby(["h3_08", "period"], sort=True):
            period_start = period.start_time
            period_end = period.end_time.normalize()
            detections = int(group["n_detections"].sum())
            rows.append(
                {
                    "h3_08": h3_index,
                    "acq_date": period_start,
                    "period_start": period_start,
                    "period_end": period_end,
                    "n_detections": detections,
                    "fire_days": int((group["n_detections"] > 0).sum()),
                    "frp_max": float(group["frp_max"].max()),
                    "frp_mean": float(group.loc[group["n_detections"] > 0, "frp_max"].mean()) if detections else 0.0,
                    "night_ratio": _safe_ratio(group.get("n_detections_night", 0), group["n_detections"]),
                    "archive_gap_days": int(group["archive_gap_days"].sum()),
                    "observation_basis": "detections" if detections else "no_detections_in_ingested_data",
                    # Transition fields are populated below for monthly frames;
                    # yearly frames keep insufficient_history (no trailing-12
                    # window) but still carry the full frozen row schema.
                    "transition_state": "insufficient_history",
                    "transition_type": "insufficient_history",
                    "transition_confidence": "low",
                    "transition_evidence": [],
                    "supporting_detection_count": 0,
                    "supporting_active_days": 0,
                    "gap_before_transition_days": 0,
                    "land_use_claim": False,
                }
            )
        frame = pd.DataFrame(rows)
        if granularity == "month" and not frame.empty:
            frame = annotate_transitions(frame)
        return frame

    def build_response(
        self,
        h3_index: str,
        daily: pd.DataFrame,
        granularity: str,
        start_date: str | None = None,
        end_date: str | None = None,
        cursor: str | None = None,
        limit: int = 100,
        precomputed_frame: pd.DataFrame | None = None,
    ) -> dict[str, Any]:
        if granularity not in {"day", "month", "year"}:
            raise ValueError("granularity must be one of: day, month, year")
        limit = min(max(int(limit), 1), self.MAX_LIMIT)
        if daily.empty:
            return self._empty_response(h3_index, granularity, start_date, end_date)

        features = build_timeline_features(daily)
        features["acq_date"] = pd.to_datetime(features["acq_date"])
        available_start = features["acq_date"].min().date().isoformat()
        available_end = features["acq_date"].max().date().isoformat()
        if precomputed_frame is not None:
            # Monthly/yearly layers already carry the annotated rollup rows;
            # re-aggregating them here would corrupt fire_days and transitions.
            frame = precomputed_frame.sort_values("acq_date").reset_index(drop=True)
        else:
            frame = self._period_frame(features, granularity).sort_values("acq_date").reset_index(drop=True)
        requested_start = start_date or available_start
        requested_end = end_date or available_end
        if granularity == "day":
            frame = frame[
                (frame["acq_date"] >= pd.Timestamp(requested_start))
                & (frame["acq_date"] <= pd.Timestamp(requested_end))
            ]
        else:
            frame = frame[
                (frame["period_end"] >= pd.Timestamp(requested_start))
                & (frame["period_start"] <= pd.Timestamp(requested_end))
            ]
        if cursor:
            frame = frame[frame["acq_date"] > pd.Timestamp(cursor)]
        page = frame.head(limit)
        rows = [self._row_dict(row, granularity, available_start, available_end) for _, row in page.iterrows()]
        has_more = len(frame) > len(rows)
        return {
            "h3_index": h3_index,
            "granularity": granularity,
            "requested_start_date": requested_start,
            "requested_end_date": requested_end,
            "available_start_date": available_start,
            "available_end_date": available_end,
            "archive_range_limited": requested_start < available_start or requested_end > available_end,
            "rows": rows,
            "gaps": _gaps(features, requested_start, requested_end),
            "partial_periods": [row["period"] for row in rows if row["partial"]],
            "has_more": has_more,
            "next_cursor": rows[-1]["period"] if has_more and rows else None,
            "context": {
                "osm_context_vintage": "current_snapshot",
                "wri_context_vintage": "current_snapshot",
                "historical_context_available": False,
                "land_use_claim": False,
            },
            "model": {
                "bundle_version": None,
                "pipeline_version": "timeline_v1",
                "prediction_scope": "historical_thermal_activity",
            },
            "caveats": [
                "Historical rows describe FIRMS evidence, not ground-truth land use.",
                "OSM/WRI context is a current snapshot, not historical context.",
            ],
        }

    @staticmethod
    def _row_dict(row: pd.Series, granularity: str, available_start: str, available_end: str) -> dict[str, Any]:
        period = row.get("period_start", row["acq_date"])
        period_end = row.get("period_end", row["acq_date"])
        period_start = pd.Timestamp(period).date()
        period_end_date = pd.Timestamp(period_end).date()
        return {
            "period": period_start.isoformat() if granularity == "day" else str(period_start.year if granularity == "year" else period_start)[:7],
            "period_type": granularity,
            "start_date": period_start.isoformat(),
            "end_date": period_end_date.isoformat(),
            "partial": period_start.isoformat() < available_start or period_end_date.isoformat() > available_end,
            "n_detections": int(row.get("n_detections", 0)),
            "fire_days": int(row.get("fire_days", 0)),
            "max_frp": float(row.get("frp_max", 0.0)),
            "avg_frp": float(row.get("frp_mean", 0.0)),
            "night_ratio": _number_or_none(row.get("night_ratio")),
            "archive_gap_days": int(row.get("archive_gap_days", 0)),
            "observation_basis": row.get("observation_basis", "insufficient_history"),
            "transition_state": row.get("transition_state", "insufficient_history"),
            "transition_type": row.get("transition_type", "insufficient_history"),
            "transition_confidence": row.get("transition_confidence", "low"),
            "transition_evidence": [] if row.get("transition_evidence", None) is None else list(row["transition_evidence"]),
            "supporting_detection_count": int(row.get("supporting_detection_count", 0)),
            "supporting_active_days": int(row.get("supporting_active_days", 0)),
            "gap_before_transition_days": int(row.get("gap_before_transition_days", 0)),
            "land_use_claim": bool(row.get("land_use_claim", False)),
        }

    @staticmethod
    def _empty_response(h3_index: str, granularity: str, start_date: str | None, end_date: str | None) -> dict[str, Any]:
        return {
            "h3_index": h3_index,
            "granularity": granularity,
            "requested_start_date": start_date,
            "requested_end_date": end_date,
            "available_start_date": None,
            "available_end_date": None,
            "archive_range_limited": False,
            "rows": [],
            "gaps": [],
            "partial_periods": [],
            "has_more": False,
            "next_cursor": None,
            "context": {"osm_context_vintage": "current_snapshot", "wri_context_vintage": "current_snapshot", "historical_context_available": False, "land_use_claim": False},
            "model": {"bundle_version": None, "pipeline_version": "timeline_v1", "prediction_scope": "historical_thermal_activity"},
            "caveats": ["No H3-cell history is available in the ingested FIRMS archive."],
        }


def _safe_ratio(numerator: pd.Series | int, denominator: pd.Series) -> float | None:
    if isinstance(numerator, int):
        return None
    total = float(denominator.sum())
    return float(numerator.sum()) / total if total else None


def _number_or_none(value: Any) -> float | None:
    return None if pd.isna(value) else float(value)


def _gaps(features: pd.DataFrame, start: str, end: str) -> list[dict[str, Any]]:
    selected = features[(features["acq_date"] >= pd.Timestamp(start)) & (features["acq_date"] <= pd.Timestamp(end))]
    gaps = []
    for row in selected[selected["archive_gap_days"] > 0].itertuples():
        gap_start = (row.acq_date - timedelta(days=int(row.archive_gap_days))).date().isoformat()
        gaps.append({"start_date": gap_start, "end_date": (row.acq_date.date() - timedelta(days=1)).isoformat(), "reason": "no_materialized_rows"})
    return gaps


timeline_service = TimelineService()
