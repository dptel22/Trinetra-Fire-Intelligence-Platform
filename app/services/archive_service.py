"""Archive + provenance service: historical H3-day prediction browsing.

Reads the same DuckDB feature store as the live serving paths and derives
honest provenance from the ingestion run history. There is no alert lifecycle
yet, so everything served here is a *prediction*, never an "alert".

Provenance rules (the NEWEST run for the date decides, including failed and
implausible runs — an older successful run says nothing about freshness):

- latest run live_firms + ok + no plausibility violations -> live / ok
- latest run override + ok                                -> historical / ok
- latest run ok but with plausibility violations          -> historical / plausibility_warning
- latest run failed (ok=false)                            -> offline / failed (last-known data)
- no run record for the date                              -> historical / no_run_record

`demo` is never fabricated: nothing in this service generates synthetic data.
"""

from __future__ import annotations

import json
import logging
from datetime import date as _date, timedelta
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.services.feature_store import feature_store
from app.services.model_service import model_service

logger = logging.getLogger(__name__)

# Served days processed per summary request (model inference runs per day).
_MAX_SUMMARY_DAYS = 31


class ArchiveDateNotAvailable(LookupError):
    """Raised when the requested acq_date is not present in the feature store."""


class ArchiveService:
    def source(self) -> str:
        return (
            f"duckdb:{Path(settings.DUCKDB_PATH).name}:h3_daily "
            f"(seeded from {Path(settings.H3_DAILY_PARQUET).name})"
        )

    # ------------------------------------------------------------------
    # Ingestion run-history provenance
    # ------------------------------------------------------------------

    def _run_history(self) -> list[dict[str, Any]]:
        # Imported here so tests can monkeypatch run_ingestion.RUN_HISTORY_PATH.
        from ingestion import run_ingestion

        try:
            loaded = json.loads(Path(run_ingestion.RUN_HISTORY_PATH).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []
        runs = loaded.get("runs") if isinstance(loaded, dict) else None
        return [run for run in runs if isinstance(run, dict)] if isinstance(runs, list) else []

    def _decisive_run_for_date(
        self, acq_date: str, runs: list[dict[str, Any]] | None = None
    ) -> dict[str, Any] | None:
        """Newest decisive run for the date, walking the append-ordered history
        from the end. A failed run decides even when it carries no target_date
        (ingestion appends failures untagged): a newer failure must block live
        labeling of older successful runs. Otherwise the newest run tagged with
        this date decides."""
        history = runs if runs is not None else self._run_history()
        for run in reversed(history):
            if not run.get("ok"):
                return run
            if str(run.get("target_date")) == acq_date:
                return run
        return None

    @staticmethod
    def _run_id(run: dict[str, Any] | None) -> str | None:
        if not run:
            return None
        # Real run ids (manifest era) take precedence; pre-manifest history
        # entries fall back to the synthetic date:started_at key so older
        # dates keep working provenance.
        if run.get("run_id"):
            return str(run["run_id"])
        started = run.get("started_at")
        return f"{run.get('target_date')}:{started}" if started else None

    def provenance_for_date(
        self, acq_date: str, runs: list[dict[str, Any]] | None = None
    ) -> dict[str, Any]:
        latest = self._decisive_run_for_date(acq_date, runs)
        if latest is None:
            return {
                "data_mode": "historical",
                "ingestion_status": "no_run_record",
                "ingestion_run_id": None,
            }
        if not latest.get("ok"):
            return {
                "data_mode": "offline",
                "ingestion_status": "failed",
                "ingestion_run_id": None,
            }
        run_id = self._run_id(latest)
        if latest.get("plausibility_violations"):
            return {
                "data_mode": "historical",
                "ingestion_status": "plausibility_warning",
                "ingestion_run_id": run_id,
            }
        if (latest.get("fetch") or {}).get("mode") == "live_firms":
            return {"data_mode": "live", "ingestion_status": "ok", "ingestion_run_id": run_id}
        return {"data_mode": "historical", "ingestion_status": "ok", "ingestion_run_id": run_id}

    # ------------------------------------------------------------------
    # Archive queries
    # ------------------------------------------------------------------

    def _predictions_for_date(self, acq_date: str) -> list[dict[str, Any]]:
        """Score every H3-day row for the date. State is attached from the
        provenance side-map BEFORE inference so the geography gate sees it."""
        rows = feature_store.rows_for_date(acq_date)
        for row in rows:
            info = feature_store.get_state(str(row.get("h3_08", "")))
            if info:
                row.setdefault("state", info[0])
                row.setdefault("state_assignment_method", info[1])
        return [prediction.model_dump() for prediction in model_service.predict_batch(rows)]

    def get_archive_dates(self) -> dict[str, Any]:
        dates = feature_store.available_dates()
        mode = self.provenance_for_date(dates[-1])["data_mode"] if dates else "offline"
        return {
            "available_dates": dates,
            "newest_date": dates[-1] if dates else None,
            "oldest_date": dates[0] if dates else None,
            "source": self.source(),
            "data_mode": mode,
        }

    def get_archive_predictions(
        self,
        acq_date: str,
        class_name: str | None = None,
        state: str | None = None,
        needs_review: bool | None = None,
        min_confidence: float | None = None,
        max_confidence: float | None = None,
        limit: int = 200,
        offset: int = 0,
    ) -> dict[str, Any]:
        if acq_date not in feature_store.available_dates():
            raise ArchiveDateNotAvailable(f"No archived H3-day data for acq_date={acq_date}")

        # No LIMIT before scoring/filtering: predict the full day, filter the
        # full prediction set, then paginate. Rows are ordered by h3_08, so
        # pages are stable across requests.
        predictions = self._predictions_for_date(acq_date)

        filtered = predictions
        if class_name is not None:
            filtered = [p for p in filtered if p["predicted_class"] == class_name]
        if state is not None:
            filtered = [p for p in filtered if p.get("state") == state]
        if needs_review is not None:
            filtered = [p for p in filtered if p["needs_review"] == needs_review]
        if min_confidence is not None:
            filtered = [p for p in filtered if p["confidence"] >= min_confidence]
        if max_confidence is not None:
            filtered = [p for p in filtered if p["confidence"] <= max_confidence]

        return {
            "total": len(filtered),
            "acq_date": acq_date,
            "predictions": filtered[offset : offset + limit],
            **self.provenance_for_date(acq_date),
            "source": self.source(),
            "model_version": settings.FEATURE_SCHEMA_VERSION,
        }

    @staticmethod
    def _coverage_gaps(
        start_date: str, end_date: str, served: list[str], available: list[str]
    ) -> list[str]:
        """Calendar days inside the store's span (clipped to the request) that
        hold no data — honest gap reporting, never gap filling."""
        span_start = max(start_date, available[0])
        span_end = min(end_date, available[-1])
        if span_start > span_end:
            return []
        served_set = set(served)
        gaps: list[str] = []
        current = _date.fromisoformat(span_start)
        last = _date.fromisoformat(span_end)
        while current <= last:
            iso = current.isoformat()
            if iso not in served_set:
                gaps.append(iso)
            current += timedelta(days=1)
        return gaps

    def get_archive_summary(
        self, start_date: str | None = None, end_date: str | None = None
    ) -> dict[str, Any]:
        available = feature_store.available_dates()
        if not available:
            return {
                "start_date": start_date or "",
                "end_date": end_date or "",
                "days": [],
                "unavailable_dates": [],
                "data_mode": "offline",
                "source": self.source(),
            }
        start = start_date or available[0]
        end = end_date or available[-1]
        wanted = [d for d in available if start <= d <= end]
        if len(wanted) > _MAX_SUMMARY_DAYS:
            raise ValueError(
                f"Summary span too large: {len(wanted)} days have data; max is {_MAX_SUMMARY_DAYS}"
            )

        days = []
        for day in wanted:
            predictions = self._predictions_for_date(day)
            by_class: dict[str, int] = {}
            by_state: dict[str, int] = {}
            needs_review_total = 0
            for pred in predictions:
                by_class[pred["predicted_class"]] = by_class.get(pred["predicted_class"], 0) + 1
                state_key = pred.get("state") or "unknown"
                by_state[state_key] = by_state.get(state_key, 0) + 1
                if pred["needs_review"]:
                    needs_review_total += 1
            days.append(
                {
                    "date": day,
                    "total": len(predictions),
                    "needs_review_total": needs_review_total,
                    "by_class": by_class,
                    "by_state": by_state,
                }
            )

        modes = [self.provenance_for_date(day)["data_mode"] for day in wanted]
        data_mode = "live" if modes and all(m == "live" for m in modes) else "historical"
        return {
            "start_date": start,
            "end_date": end,
            "days": days,
            "unavailable_dates": self._coverage_gaps(start, end, wanted, available),
            "data_mode": data_mode,
            "source": self.source(),
        }


archive_service = ArchiveService()
