import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path

import duckdb

from app.core.config import settings
from app.schemas.audit import AnalystOverrideRequest, AuditLogEntry, AuditLogResponse
from app.schemas.alerts import (
    AlertActionRequest,
    AlertEvent,
    AlertState,
    AlertStatesResponse,
)

# Model version string — bump this when a new trained artifact is deployed
MODEL_VERSION = settings.VERSION

# Lifecycle actions and their replay semantics. `note` records information
# without changing state; `reopened` returns a hotspot to `new`.
STATE_CHANGING_ACTIONS = {
    "acknowledged": "acknowledged",
    "confirmed": "confirmed",
    "dismissed": "dismissed",
    "reopened": "new",
}


class AuditTrailService:
    """
    NTRO Compliance Immutable Audit Trail Service.
    Enforces append-only storage for human-in-the-loop analyst decisions.

    NOTE: Immutability is enforced at the application layer (INSERT-only methods).
    Database-level REVOKE UPDATE/DELETE grants should be applied in production
    deployment infrastructure (outside this repository).

    Concurrency contract: ONE persistent read-write connection shared by all
    reads and writes, every access serialized under self._lock (mirrors
    FeatureStoreService). DuckDB rejects mixed read-write/read-only
    configurations on the same file within a process, and the FastAPI
    threadpool serves requests concurrently — per-call connections with
    read_only=True reads would be a latent failure, so none are used.
    Lifecycle state is replayed from append-only events, never updated.
    """

    def __init__(self, db_path: str = settings.AUDIT_DB_PATH):
        self.db_path = db_path
        # Container deployments point AUDIT_DB_PATH at a mounted volume whose
        # parent may not exist yet — fail-safe instead of crash-on-import.
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._conn = None
        self._init_db()

    def _get_connection(self):
        if self._conn is None:
            self._conn = duckdb.connect(self.db_path)
        return self._conn

    def _init_db(self):
        with self._lock:
            conn = self._get_connection()
            conn.execute(
                "CREATE TABLE IF NOT EXISTS ntro_audit_trail (event_id VARCHAR PRIMARY KEY, timestamp VARCHAR NOT NULL, hotspot_id VARCHAR NOT NULL, analyst_id VARCHAR NOT NULL, model_prediction VARCHAR NOT NULL, override_class VARCHAR NOT NULL, justification VARCHAR NOT NULL, confidence_rating INTEGER NOT NULL, model_version VARCHAR NOT NULL)"
            )
            conn.execute(
                "CREATE TABLE IF NOT EXISTS alert_lifecycle_events (event_id VARCHAR PRIMARY KEY, timestamp VARCHAR NOT NULL, hotspot_id VARCHAR NOT NULL, h3_08 VARCHAR NOT NULL, acq_date VARCHAR NOT NULL, action VARCHAR NOT NULL, note VARCHAR, analyst_id VARCHAR NOT NULL, model_prediction VARCHAR, model_confidence DOUBLE, needs_review BOOLEAN, model_version VARCHAR, ingestion_run_id VARCHAR, data_mode VARCHAR)"
            )

    def log_override(
        self,
        req: AnalystOverrideRequest,
        model_prediction: str,         # Resolved server-side, not client-supplied
        model_version: str = MODEL_VERSION
    ) -> AuditLogEntry:
        """Append an immutable audit entry with microsecond precision."""
        event_id = f"AUDIT-EVT-{uuid.uuid4().hex[:12].upper()}"
        ts = datetime.now(UTC).isoformat(timespec="microseconds")

        conn = self._get_connection()
        with self._lock:
            conn.execute(
                "INSERT INTO ntro_audit_trail (event_id, timestamp, hotspot_id, analyst_id, model_prediction, override_class, justification, confidence_rating, model_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    event_id, ts, req.hotspot_id, req.analyst_id,
                    model_prediction, req.override_class, req.justification,
                    req.confidence_rating, model_version
                ]
            )

        return AuditLogEntry(
            event_id=event_id,
            timestamp=ts,
            hotspot_id=req.hotspot_id,
            analyst_id=req.analyst_id,
            model_prediction=model_prediction,
            override_class=req.override_class,
            justification=req.justification,
            confidence_rating=req.confidence_rating,
            model_version=model_version
        )

    def get_logs(self, limit: int = 100) -> AuditLogResponse:
        """Retrieve audit events for compliance inspection."""
        with self._lock:
            rows = self._get_connection().execute(
                "SELECT event_id, timestamp, hotspot_id, analyst_id, model_prediction, override_class, justification, confidence_rating, model_version FROM ntro_audit_trail ORDER BY timestamp DESC LIMIT ?",
                [limit]
            ).fetchall()

        logs = [
            AuditLogEntry(
                event_id=r[0],
                timestamp=r[1],
                hotspot_id=r[2],
                analyst_id=r[3],
                model_prediction=r[4],
                override_class=r[5],
                justification=r[6],
                confidence_rating=r[7],
                model_version=r[8]
            )
            for r in rows
        ]
        return AuditLogResponse(total_logs=len(logs), logs=logs)

    # ------------------------------------------------------------------
    # Alert lifecycle: append-only events, replay-derived state
    # ------------------------------------------------------------------

    def log_action(
        self,
        req: AlertActionRequest,
        hotspot_id: str,
        h3_08: str,
        acq_date: str,
        model_prediction: str | None,
        model_confidence: float | None,
        needs_review: bool | None,
        model_version: str = MODEL_VERSION,
        ingestion_run_id: str | None = None,
        data_mode: str | None = None,
    ) -> AlertEvent:
        """Append one immutable lifecycle event. State is never updated in place."""
        event_id = f"ALERT-EVT-{uuid.uuid4().hex[:12].upper()}"
        ts = datetime.now(UTC).isoformat(timespec="microseconds")

        with self._lock:
            self._get_connection().execute(
                "INSERT INTO alert_lifecycle_events (event_id, timestamp, hotspot_id, h3_08, acq_date, action, note, analyst_id, model_prediction, model_confidence, needs_review, model_version, ingestion_run_id, data_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    event_id, ts, hotspot_id, h3_08, acq_date, req.action,
                    req.note, req.analyst_id, model_prediction, model_confidence,
                    needs_review, model_version, ingestion_run_id, data_mode,
                ]
            )

        return AlertEvent(
            event_id=event_id,
            timestamp=ts,
            hotspot_id=hotspot_id,
            h3_08=h3_08,
            acq_date=acq_date,
            action=req.action,
            note=req.note,
            analyst_id=req.analyst_id,
            model_prediction=model_prediction,
            model_confidence=model_confidence,
            needs_review=needs_review,
            model_version=model_version,
            ingestion_run_id=ingestion_run_id,
            data_mode=data_mode,
        )

    def get_history(self, hotspot_id: str, limit: int = 200) -> list[AlertEvent]:
        """Full append-only event list for one hotspot, oldest first."""
        with self._lock:
            rows = self._get_connection().execute(
                "SELECT event_id, timestamp, hotspot_id, h3_08, acq_date, action, note, analyst_id, model_prediction, model_confidence, needs_review, model_version, ingestion_run_id, data_mode FROM alert_lifecycle_events WHERE hotspot_id = ? ORDER BY timestamp LIMIT ?",
                [hotspot_id, limit]
            ).fetchall()
        return [self._event_from_row(r) for r in rows]

    def get_state_for_date(self, acq_date: str, hotspot_ids: list[str]) -> AlertStatesResponse:
        """Replay-derived current state per hotspot for one acquisition date.

        Pure replay inside the audit DB; the date's hotspot ids are supplied by
        the caller (from the feature store) and merged in Python — no
        cross-database join. Latest event wins; `note` never changes state.
        """
        with self._lock:
            rows = self._get_connection().execute(
                "SELECT event_id, timestamp, hotspot_id, h3_08, acq_date, action, note, analyst_id, model_prediction, model_confidence, needs_review, model_version, ingestion_run_id, data_mode FROM alert_lifecycle_events WHERE acq_date = ? ORDER BY timestamp",
                [acq_date]
            ).fetchall()

        latest_state: dict[str, str] = {}
        last_event: dict[str, AlertEvent] = {}
        for r in rows:
            event = self._event_from_row(r)
            # Replay in timestamp order: state-changing events move the state;
            # `note` is recorded for display but never moves state.
            last_event[event.hotspot_id] = event
            if event.action in STATE_CHANGING_ACTIONS:
                latest_state[event.hotspot_id] = STATE_CHANGING_ACTIONS[event.action]

        states: list[AlertState] = []
        counts = {"new": 0, "acknowledged": 0, "confirmed": 0, "dismissed": 0}
        for hotspot_id in sorted(set(hotspot_ids)):
            event = last_event.get(hotspot_id)
            state = latest_state.get(hotspot_id, "new")
            counts[state] += 1
            states.append(
                AlertState(
                    hotspot_id=hotspot_id,
                    h3_08=event.h3_08 if event else hotspot_id.rsplit("_", 1)[0],
                    acq_date=acq_date,
                    state=state,
                    last_action=event.action if event else None,
                    last_note=event.note if event else None,
                    analyst_id=event.analyst_id if event else None,
                    last_event_at=event.timestamp if event else None,
                    last_event_id=event.event_id if event else None,
                )
            )
        return AlertStatesResponse(acq_date=acq_date, total=len(states), counts=counts, states=states)

    @staticmethod
    def _event_from_row(r) -> AlertEvent:
        return AlertEvent(
            event_id=r[0],
            timestamp=r[1],
            hotspot_id=r[2],
            h3_08=r[3],
            acq_date=r[4],
            action=r[5],
            note=r[6],
            analyst_id=r[7],
            model_prediction=r[8],
            model_confidence=r[9],
            needs_review=r[10],
            model_version=r[11],
            ingestion_run_id=r[12],
            data_mode=r[13],
        )


audit_service = AuditTrailService()
