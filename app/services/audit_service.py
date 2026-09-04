import uuid
from datetime import UTC, datetime

import duckdb

from app.core.config import settings
from app.schemas.audit import AnalystOverrideRequest, AuditLogEntry, AuditLogResponse

# Model version string — bump this when a new trained artifact is deployed
MODEL_VERSION = settings.VERSION


class AuditTrailService:
    """
    NTRO Compliance Immutable Audit Trail Service.
    Enforces append-only storage for human-in-the-loop analyst decisions.

    NOTE: Immutability is enforced at the application layer (INSERT-only methods).
    Database-level REVOKE UPDATE/DELETE grants should be applied in production
    deployment infrastructure (outside this repository).
    """

    def __init__(self, db_path: str = settings.AUDIT_DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self):
        return duckdb.connect(self.db_path)

    def _init_db(self):
        conn = self._get_connection()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ntro_audit_trail (
                event_id        VARCHAR PRIMARY KEY,
                timestamp       VARCHAR NOT NULL,
                hotspot_id      VARCHAR NOT NULL,
                analyst_id      VARCHAR NOT NULL,
                model_prediction VARCHAR NOT NULL,
                override_class  VARCHAR NOT NULL,
                justification   VARCHAR NOT NULL,
                confidence_rating INTEGER NOT NULL,
                model_version   VARCHAR NOT NULL
            )
        """)
        conn.close()

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
        conn.execute("""
            INSERT INTO ntro_audit_trail (
                event_id, timestamp, hotspot_id, analyst_id,
                model_prediction, override_class, justification,
                confidence_rating, model_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            event_id, ts, req.hotspot_id, req.analyst_id,
            model_prediction, req.override_class, req.justification,
            req.confidence_rating, model_version
        ])
        conn.close()

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
        """Retrieve audit events for compliance inspection (read-only connection)."""
        conn = duckdb.connect(self.db_path, read_only=True)
        rows = conn.execute("""
            SELECT event_id, timestamp, hotspot_id, analyst_id,
                   model_prediction, override_class, justification,
                   confidence_rating, model_version
            FROM ntro_audit_trail
            ORDER BY timestamp DESC
            LIMIT ?
        """, [limit]).fetchall()
        conn.close()

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


audit_service = AuditTrailService()
