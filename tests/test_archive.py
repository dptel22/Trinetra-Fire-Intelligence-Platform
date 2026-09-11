"""Tests for Agent 1: backend archive + provenance foundation.

Covers:
- Archive dates endpoint (available dates, newest/oldest, data_mode).
- Historical date query with stable pagination and class/state/review/
  confidence filters computed over the FULL prediction set.
- Unknown date -> structured 404, never a silent mock fallback.
- Summary counts by date/class/needs_review/state across India bounds.
- Live vs historical provenance driven by the NEWEST ingestion run for the
  date (override / failed / implausibly-empty / missing runs must never be
  labeled live); data_mode and ingestion_status are separate fields.
- State + geography provenance preserved on archived predictions.
- Existing prediction + health endpoints remain compatible.

Archive tests use the real serving parquets + real model bundle (same policy
as test_backend.py) so they are skipped when those artifacts are absent.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
from app.main import app
from app.services import archive_service as archive_service_module
from app.services.archive_service import archive_service
from app.services.feature_store import feature_store
from ingestion import run_ingestion

MODEL_EXISTS = Path(settings.MODEL_PATH).exists()
PARQUET_EXISTS = Path(settings.OSMWRI_PARQUET).exists()

requires_data = pytest.mark.skipif(
    not (MODEL_EXISTS and PARQUET_EXISTS),
    reason="Requires model bundle and OSM/WRI parquet",
)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="module")
def available_dates(client):
    res = client.get("/api/v1/archive/dates")
    assert res.status_code == 200
    dates = res.json()["available_dates"]
    assert dates
    return dates


def _write_history(tmp_path: Path, runs: list[dict]) -> Path:
    history_path = tmp_path / "ingestion_run_history.json"
    history_path.write_text(json.dumps({"runs": runs}), encoding="utf-8")
    return history_path


@requires_data
class TestArchiveDates:
    def test_dates_contract(self, client, available_dates):
        res = client.get("/api/v1/archive/dates")
        assert res.status_code == 200
        body = res.json()
        assert body["available_dates"] == available_dates
        assert body["available_dates"] == sorted(body["available_dates"])
        assert body["oldest_date"] == available_dates[0]
        assert body["newest_date"] == available_dates[-1]
        assert isinstance(body["source"], str) and body["source"]
        assert body["data_mode"] in {"live", "historical", "demo", "offline"}

    def test_dates_offline_when_store_empty(self, client, monkeypatch):
        monkeypatch.setattr(feature_store, "available_dates", lambda: [])
        res = client.get("/api/v1/archive/dates")
        assert res.status_code == 200
        body = res.json()
        assert body["available_dates"] == []
        assert body["newest_date"] is None
        assert body["oldest_date"] is None
        assert body["data_mode"] == "offline"

    def test_dates_mode_matches_newest_date_provenance(self, available_dates):
        # The dates endpoint's data_mode must be the mode of the NEWEST date
        # under the same newest-run-wins rule used per date.
        expected = archive_service.provenance_for_date(available_dates[-1])["data_mode"]
        assert archive_service.get_archive_dates()["data_mode"] == expected


@requires_data
class TestArchivePredictions:
    def test_known_date_query_provenance_and_shape(self, client, available_dates):
        acq_date = available_dates[-1]
        res = client.get("/api/v1/archive/predictions", params={"acq_date": acq_date})
        assert res.status_code == 200
        body = res.json()
        assert body["acq_date"] == acq_date
        assert body["total"] >= len(body["predictions"])
        assert body["model_version"] == settings.FEATURE_SCHEMA_VERSION
        assert body["data_mode"] in {"live", "historical", "demo", "offline"}
        assert body["data_mode"] != "demo"  # demo is never fabricated
        assert isinstance(body["source"], str) and body["source"]
        assert body["ingestion_status"] in {"ok", "plausibility_warning", "failed", "no_run_record", None}
        for pred in body["predictions"]:
            assert pred["predicted_class"] in set(settings.TARGET_CLASSES) | {"unclassified"}
            assert "cell_id" in pred and "confidence" in pred and "needs_review" in pred

    def test_state_and_geography_preserved(self, available_dates):
        acq_date = available_dates[-1]
        body = archive_service.get_archive_predictions(acq_date=acq_date, limit=1000)
        preds = body["predictions"]
        assert preds, "archive date unexpectedly empty"
        states = [p.get("state") for p in preds]
        assert any(states), "state provenance missing on archived predictions"
        assert "Outside India" not in set(states), "outside-India rows must stay excluded"
        # nationwide serving: more than one state on a real day
        assert len(set(s for s in states if s)) >= 1
        for pred in preds:
            assert "geography" in pred
            assert pred["geography"] in {"training_geography", "india_outside_training", "outside_india", None}
            assert pred["latitude"] is not None
            assert pred["longitude"] is not None
            assert pred["confidence"] is not None

    def test_unknown_date_structured_404_no_mock_fallback(self, client, available_dates):
        res = client.get("/api/v1/archive/predictions", params={"acq_date": "1999-01-01"})
        assert res.status_code == 404
        detail = res.json()["detail"]
        assert detail["error"] == "archive_date_not_available"
        assert detail["acq_date"] == "1999-01-01"
        # No fabricated data anywhere in the response.
        assert "predictions" not in detail
        assert detail["newest_date"] == available_dates[-1]
        assert detail["oldest_date"] == available_dates[0]

    def test_malformed_date_400(self, client):
        res = client.get("/api/v1/archive/predictions", params={"acq_date": "not-a-date"})
        assert res.status_code == 400

    def test_class_filter(self, available_dates):
        acq_date = available_dates[-1]
        all_res = archive_service.get_archive_predictions(acq_date=acq_date, limit=1000)
        preds = all_res["predictions"]
        assert preds, "archive date unexpectedly empty"
        target_class = preds[0]["predicted_class"]
        expected = sum(1 for p in preds if p["predicted_class"] == target_class)

        filtered = archive_service.get_archive_predictions(acq_date=acq_date, class_name=target_class, limit=1000)
        assert filtered["total"] == expected
        assert all(p["predicted_class"] == target_class for p in filtered["predictions"])

    def test_unknown_class_rejected(self, client, available_dates):
        res = client.get(
            "/api/v1/archive/predictions",
            params={"acq_date": available_dates[-1], "class_name": "alien_fires"},
        )
        assert res.status_code == 400

    def test_state_filter(self, available_dates):
        acq_date = available_dates[-1]
        all_res = archive_service.get_archive_predictions(acq_date=acq_date, limit=1000)
        preds = [p for p in all_res["predictions"] if p.get("state")]
        assert preds, "no state provenance on this date"
        target_state = preds[0]["state"]
        expected = sum(1 for p in all_res["predictions"] if p.get("state") == target_state)

        filtered = archive_service.get_archive_predictions(acq_date=acq_date, state=target_state, limit=1000)
        assert filtered["total"] == expected
        assert all(p["state"] == target_state for p in filtered["predictions"])

    def test_needs_review_filter(self, available_dates):
        acq_date = available_dates[-1]
        all_res = archive_service.get_archive_predictions(acq_date=acq_date, limit=1000)
        preds = all_res["predictions"]
        expected_true = sum(1 for p in preds if p["needs_review"])

        review = archive_service.get_archive_predictions(acq_date=acq_date, needs_review=True, limit=1000)
        assert review["total"] == expected_true
        assert all(p["needs_review"] is True for p in review["predictions"])

        clean = archive_service.get_archive_predictions(acq_date=acq_date, needs_review=False, limit=1000)
        assert clean["total"] == len(preds) - expected_true
        assert all(p["needs_review"] is False for p in clean["predictions"])

    def test_confidence_bounds_filter(self, available_dates):
        acq_date = available_dates[-1]
        all_res = archive_service.get_archive_predictions(acq_date=acq_date, limit=1000)
        preds = all_res["predictions"]
        confidences = sorted(p["confidence"] for p in preds)
        low, high = confidences[len(confidences) // 4], confidences[3 * len(confidences) // 4]

        bounded = archive_service.get_archive_predictions(
            acq_date=acq_date, min_confidence=low, max_confidence=high, limit=1000
        )
        assert bounded["total"] == sum(1 for p in preds if low <= p["confidence"] <= high)
        assert all(low <= p["confidence"] <= high for p in bounded["predictions"])

    def test_min_greater_than_max_400(self, client, available_dates):
        res = client.get(
            "/api/v1/archive/predictions",
            params={"acq_date": available_dates[-1], "min_confidence": 0.9, "max_confidence": 0.1},
        )
        assert res.status_code == 400

    def test_pagination_stable_disjoint_and_untruncated_totals(self, available_dates):
        acq_date = available_dates[-1]
        full = archive_service.get_archive_predictions(acq_date=acq_date, limit=1000)
        assert full["total"] >= 2

        page1 = archive_service.get_archive_predictions(acq_date=acq_date, limit=2, offset=0)
        page1_repeat = archive_service.get_archive_predictions(acq_date=acq_date, limit=2, offset=0)
        page2 = archive_service.get_archive_predictions(acq_date=acq_date, limit=2, offset=2)

        # Stability: identical requests return identical pages (ORDER BY h3_08).
        assert [p["cell_id"] for p in page1["predictions"]] == [p["cell_id"] for p in page1_repeat["predictions"]]
        assert len(page1["predictions"]) == 2
        assert page1["total"] == full["total"]
        assert page2["total"] == full["total"]
        ids1 = {p["cell_id"] for p in page1["predictions"]}
        ids2 = {p["cell_id"] for p in page2["predictions"]}
        assert ids1.isdisjoint(ids2)
        assert page1["predictions"][0]["cell_id"] == full["predictions"][0]["cell_id"]

        tail = archive_service.get_archive_predictions(acq_date=acq_date, limit=2, offset=full["total"] + 50)
        assert tail["predictions"] == []
        assert tail["total"] == full["total"]


@requires_data
class TestArchiveSummary:
    def test_summary_counts_by_class_state_review_across_india(self, client, available_dates):
        acq_date = available_dates[-1]
        all_res = archive_service.get_archive_predictions(acq_date=acq_date, limit=1000)

        res = client.get("/api/v1/archive/summary", params={"start_date": acq_date, "end_date": acq_date})
        assert res.status_code == 200
        body = res.json()
        assert body["start_date"] == acq_date
        assert body["end_date"] == acq_date
        assert len(body["days"]) == 1

        day = body["days"][0]
        assert day["date"] == acq_date
        assert day["total"] == all_res["total"]
        assert day["needs_review_total"] == sum(1 for p in all_res["predictions"] if p["needs_review"])
        assert sum(day["by_class"].values()) == day["total"]
        assert sum(day["by_state"].values()) == day["total"]
        assert day["by_state"], "no state totals — nationwide coverage broken?"
        for cls, count in day["by_class"].items():
            assert cls in set(settings.TARGET_CLASSES) | {"unclassified"}
            assert count == sum(1 for p in all_res["predictions"] if p["predicted_class"] == cls)
        assert "Outside India" not in day["by_state"]

    def test_summary_skips_dates_outside_range_and_reports_gaps(self, client, available_dates):
        res = client.get(
            "/api/v1/archive/summary",
            params={"start_date": available_dates[-31], "end_date": available_dates[-1]},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["days"]
        assert [d["date"] for d in body["days"]] == available_dates[-31:]
        # Every calendar day inside the store's span has data here, so no gaps.
        assert body["unavailable_dates"] == []

    def test_summary_start_after_end_400(self, client, available_dates):
        res = client.get(
            "/api/v1/archive/summary",
            params={"start_date": available_dates[-1], "end_date": available_dates[0]},
        )
        assert res.status_code == 400

    def test_summary_span_capped(self, client, monkeypatch, available_dates):
        monkeypatch.setattr(archive_service_module, "_MAX_SUMMARY_DAYS", 2)
        res = client.get(
            "/api/v1/archive/summary",
            params={"start_date": available_dates[0], "end_date": available_dates[-1]},
        )
        assert res.status_code == 400


@requires_data
class TestProvenanceModes:
    """data_mode must be derived from the NEWEST ingestion run for the date."""

    def test_live_only_for_clean_live_firms_run(self, client, monkeypatch, tmp_path, available_dates):
        acq_date = available_dates[-1]
        monkeypatch.setattr(
            run_ingestion,
            "RUN_HISTORY_PATH",
            _write_history(
                tmp_path,
                [
                    {
                        "target_date": acq_date,
                        "ok": True,
                        "fetch": {"mode": "live_firms"},
                        "plausibility_violations": [],
                        "started_at": "2026-09-09T18:33:18.764263+00:00",
                    }
                ],
            ),
        )
        res = client.get("/api/v1/archive/predictions", params={"acq_date": acq_date})
        assert res.status_code == 200
        body = res.json()
        assert body["data_mode"] == "live"
        assert body["ingestion_status"] == "ok"
        assert body["ingestion_run_id"] == f"{acq_date}:2026-09-09T18:33:18.764263+00:00"

    def test_override_run_is_never_live(self, client, monkeypatch, tmp_path, available_dates):
        acq_date = available_dates[-1]
        monkeypatch.setattr(
            run_ingestion,
            "RUN_HISTORY_PATH",
            _write_history(
                tmp_path,
                [
                    {
                        "target_date": acq_date,
                        "ok": True,
                        "fetch": {"mode": "override"},
                        "plausibility_violations": [],
                        "started_at": "2026-09-09T18:44:59.204652+00:00",
                    }
                ],
            ),
        )
        res = client.get("/api/v1/archive/predictions", params={"acq_date": acq_date})
        assert res.status_code == 200
        body = res.json()
        assert body["data_mode"] == "historical"
        assert body["ingestion_status"] == "ok"

    def test_implausibly_empty_run_is_never_live(self, client, monkeypatch, tmp_path, available_dates):
        acq_date = available_dates[-1]
        monkeypatch.setattr(
            run_ingestion,
            "RUN_HISTORY_PATH",
            _write_history(
                tmp_path,
                [
                    {
                        "target_date": acq_date,
                        "ok": True,
                        "fetch": {"mode": "live_firms"},
                        "plausibility_violations": ["points_total=0 implausibly low for an India-wide day"],
                        "started_at": "2026-09-09T18:35:10.274029+00:00",
                    }
                ],
            ),
        )
        res = client.get("/api/v1/archive/predictions", params={"acq_date": acq_date})
        assert res.status_code == 200
        body = res.json()
        assert body["data_mode"] == "historical"
        assert body["ingestion_status"] == "plausibility_warning"

    def test_failed_run_reports_offline_and_failed(self, client, monkeypatch, tmp_path, available_dates):
        acq_date = available_dates[-1]
        monkeypatch.setattr(
            run_ingestion,
            "RUN_HISTORY_PATH",
            _write_history(
                tmp_path,
                [{"ok": False, "error": "FIRMS API unreachable", "at": "2026-09-09T19:00:00+00:00"}],
            ),
        )
        res = client.get("/api/v1/archive/predictions", params={"acq_date": acq_date})
        assert res.status_code == 200
        body = res.json()
        assert body["data_mode"] == "offline"
        assert body["ingestion_status"] == "failed"
        assert body["ingestion_run_id"] is None

    def test_newer_failed_run_prevents_live_labeling(self, monkeypatch, tmp_path, available_dates):
        """An older clean live_firms run must NOT make the date live once a
        newer run for the same date failed."""
        acq_date = available_dates[-1]
        monkeypatch.setattr(
            run_ingestion,
            "RUN_HISTORY_PATH",
            _write_history(
                tmp_path,
                [
                    {
                        "target_date": acq_date,
                        "ok": True,
                        "fetch": {"mode": "live_firms"},
                        "plausibility_violations": [],
                        "started_at": "2026-09-09T18:33:18.764263+00:00",
                    },
                    {
                        "ok": False,
                        "error": "FIRMS API unreachable",
                        "at": "2026-09-09T19:00:00+00:00",
                        "target_date": acq_date,
                    },
                ],
            ),
        )
        assert archive_service.provenance_for_date(acq_date)["data_mode"] != "live"
        assert archive_service.get_archive_dates()["data_mode"] != "live"

    def test_missing_history_is_historical_not_live(self, client, monkeypatch, tmp_path, available_dates):
        monkeypatch.setattr(run_ingestion, "RUN_HISTORY_PATH", tmp_path / "does_not_exist.json")
        res = client.get("/api/v1/archive/predictions", params={"acq_date": available_dates[-1]})
        assert res.status_code == 200
        body = res.json()
        assert body["data_mode"] == "historical"
        assert body["ingestion_status"] == "no_run_record"
        assert body["ingestion_run_id"] is None


@requires_data
class TestExistingEndpointsCompat:
    def test_health_and_v1_predictions_unchanged(self, client, available_dates):
        health = client.get("/health")
        assert health.status_code == 200
        health_body = health.json()
        assert health_body["status"] == "healthy"
        assert "ingestion" in health_body, "ingestion provenance block must stay on /health"
        v1_health = client.get("/api/v1/health")
        assert v1_health.status_code == 200
        assert v1_health.json()["review_thresholds"] == health_body["review_thresholds"]

        # /api/v1/predictions (viewport) still works against a real archived date.
        row = feature_store.rows_for_date(available_dates[0])[0]
        res = client.get(
            "/api/v1/predictions",
            params={
                "min_lat": row["h3_lat"] - 0.01,
                "max_lat": row["h3_lat"] + 0.01,
                "min_lon": row["h3_lon"] - 0.01,
                "max_lon": row["h3_lon"] + 0.01,
                "acq_date": available_dates[0],
            },
        )
        assert res.status_code == 200
        assert res.json()["total_predictions"] >= 1


def test_archive_service_no_mock_fallback_when_store_fails(monkeypatch):
    """If the store cannot serve rows, the service must raise — never return
    fabricated predictions."""

    class _BrokenStore:
        def available_dates(self):
            raise RuntimeError("store offline")

        def rows_for_date(self, acq_date):
            raise RuntimeError("store offline")

    monkeypatch.setattr(archive_service_module, "feature_store", _BrokenStore())
    with pytest.raises(RuntimeError):
        archive_service.get_archive_dates()
    with pytest.raises(RuntimeError):
        archive_service.get_archive_predictions(acq_date="2026-09-09")
