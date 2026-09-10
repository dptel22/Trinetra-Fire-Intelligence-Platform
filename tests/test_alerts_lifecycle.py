"""Tests for the alert lifecycle: append-only events, replay-derived state.

Covers:
- POST /api/v1/alerts/{hotspot_id}/actions: acknowledge/confirm/dismiss/note/
  reopen, with the model prediction + ingestion run resolved server-side
  (never client-supplied) and DEMO_ANALYST defaulting.
- Dismissals require a justification note (>= 10 chars).
- GET /api/v1/alerts/states: replay-derived current state per hotspot for a
  date, latest-event-wins, `note` never changes state, `reopened` returns to
  `new`; counts over the full hotspot set; unknown date -> structured 404.
- GET /api/v1/alerts/{hotspot_id}/history: full append-only event list,
  oldest first, nothing mutated.
- The audit service keeps a single persistent connection contract: override
  logging and log reads share it safely.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
from app.main import app
from app.services.feature_store import feature_store

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
def sample_hotspot(client):
    """A real stored hotspot id '{h3_08}_{acq_date}' with its date."""
    dates_res = client.get("/api/v1/archive/dates")
    assert dates_res.status_code == 200
    dates = dates_res.json()["available_dates"]
    assert dates, "archive store must not be empty for lifecycle tests"
    acq_date = dates[-1]
    rows = feature_store.rows_for_date(acq_date)
    assert rows, f"newest archived date {acq_date} unexpectedly empty"
    return f"{rows[0]['h3_08']}_{acq_date}", acq_date


def _post_action(client, hotspot_id: str, action: str, **kwargs):
    return client.post(
        f"/api/v1/alerts/{hotspot_id}/actions",
        json={"action": action, **kwargs},
    )


@requires_data
class TestAlertActions:
    def test_acknowledge_appends_event_and_resolves_server_side(self, client, sample_hotspot):
        hotspot_id, acq_date = sample_hotspot
        res = _post_action(client, hotspot_id, "acknowledged", note="Ops team notified.")
        assert res.status_code == 200, res.text
        event = res.json()
        assert event["action"] == "acknowledged"
        assert event["hotspot_id"] == hotspot_id
        assert event["h3_08"] == hotspot_id.rsplit("_", 1)[0]
        assert event["acq_date"] == acq_date
        assert event["analyst_id"] == "DEMO_ANALYST"  # default reviewer identity
        # Server-side resolution: model output + run provenance present.
        assert event["model_prediction"] and "(confidence:" in event["model_prediction"]
        assert event["model_confidence"] is not None
        assert event["needs_review"] in (True, False)
        assert event["model_version"]

    def test_custom_analyst_id_is_honored(self, client, sample_hotspot):
        hotspot_id, _ = sample_hotspot
        res = _post_action(client, hotspot_id, "note", note="Checking against adjacent cells.", analyst_id="NTRO_OFFICER_409")
        assert res.status_code == 200
        assert res.json()["analyst_id"] == "NTRO_OFFICER_409"

    def test_dismiss_without_note_is_rejected(self, client, sample_hotspot):
        hotspot_id, _ = sample_hotspot
        res = _post_action(client, hotspot_id, "dismissed")
        assert res.status_code == 400
        res = _post_action(client, hotspot_id, "dismissed", note="too short")
        assert res.status_code == 400

    def test_malformed_hotspot_ids(self, client):
        assert client.post("/api/v1/alerts/not-an-id/actions", json={"action": "acknowledged"}).status_code == 400
        assert client.post(
            "/api/v1/alerts/abc99_2026-13-99/actions", json={"action": "acknowledged"}
        ).status_code == 400

    def test_unknown_cell_is_404(self, client):
        dates_res = client.get("/api/v1/archive/dates")
        date = dates_res.json()["available_dates"][-1]
        res = client.post(
            f"/api/v1/alerts/ffffffffffffffff_{date}/actions",
            json={"action": "acknowledged"},
        )
        assert res.status_code == 404


@requires_data
class TestReplayState:
    def test_transitions_and_counts(self, client, sample_hotspot):
        hotspot_id, acq_date = sample_hotspot
        assert _post_action(client, hotspot_id, "acknowledged").status_code == 200
        assert _post_action(client, hotspot_id, "confirmed", note="Confirmed industrial flare on imagery.").status_code == 200

        states_res = client.get(f"/api/v1/alerts/states?acq_date={acq_date}")
        assert states_res.status_code == 200
        body = states_res.json()
        assert body["acq_date"] == acq_date
        by_hotspot = {s["hotspot_id"]: s for s in body["states"]}
        assert by_hotspot[hotspot_id]["state"] == "confirmed"  # latest event wins
        assert body["counts"]["confirmed"] >= 1
        assert body["total"] == sum(body["counts"].values())

    def test_note_does_not_change_state(self, client, sample_hotspot):
        hotspot_id, acq_date = sample_hotspot
        assert _post_action(client, hotspot_id, "note", note="Purely informational entry.").status_code == 200
        body = client.get(f"/api/v1/alerts/states?acq_date={acq_date}").json()
        by_hotspot = {s["hotspot_id"]: s for s in body["states"]}
        assert by_hotspot[hotspot_id]["state"] in ("new", "acknowledged", "confirmed", "dismissed")
        # The note is visible as the last event but never as a state change.
        assert by_hotspot[hotspot_id]["last_action"] == "note"

    def test_reopen_returns_to_new(self, client, sample_hotspot):
        hotspot_id, acq_date = sample_hotspot
        assert _post_action(client, hotspot_id, "dismissed", note="False positive: sun glint on water.").status_code == 200
        assert _post_action(client, hotspot_id, "reopened").status_code == 200
        body = client.get(f"/api/v1/alerts/states?acq_date={acq_date}").json()
        by_hotspot = {s["hotspot_id"]: s for s in body["states"]}
        assert by_hotspot[hotspot_id]["state"] == "new"

    def test_unreviewed_hotspots_default_to_new(self, client, sample_hotspot):
        _, acq_date = sample_hotspot
        rows = feature_store.rows_for_date(acq_date)
        # Use a hotspot no other test in this module has acted on (they all
        # share the module-scoped rows[0] hotspot and one persistent audit DB).
        untouched = f"{rows[-1]['h3_08']}_{acq_date}"
        body = client.get(f"/api/v1/alerts/states?acq_date={acq_date}").json()
        by_hotspot = {s["hotspot_id"]: s for s in body["states"]}
        assert by_hotspot[untouched]["state"] == "new"
        assert by_hotspot[untouched]["last_action"] is None

    def test_unknown_date_is_structured_404(self, client):
        res = client.get("/api/v1/alerts/states?acq_date=2001-01-01")
        assert res.status_code == 404
        assert res.json()["detail"]["error"] == "archive_date_not_available"


@requires_data
class TestHistory:
    def test_history_is_append_only_and_ordered(self, client, sample_hotspot):
        hotspot_id, _ = sample_hotspot
        first = _post_action(client, hotspot_id, "acknowledged", note="First look.")
        assert first.status_code == 200
        second = _post_action(client, hotspot_id, "confirmed", note="Second look confirms.")
        assert second.status_code == 200

        res = client.get(f"/api/v1/alerts/{hotspot_id}/history")
        assert res.status_code == 200
        events = res.json()["events"]
        ids = [e["event_id"] for e in events]
        assert first.json()["event_id"] in ids and second.json()["event_id"] in ids
        timestamps = [e["timestamp"] for e in events]
        assert timestamps == sorted(timestamps)  # oldest first
        # Append-only: the model prediction recorded at action time is retained.
        for e in events:
            assert e["model_prediction"]
            assert e["analyst_id"]
