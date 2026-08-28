import duckdb
import uuid
from datetime import datetime, timezone
from typing import List
from app.core.config import settings
from app.schemas.audit import AnalystOverrideRequest, AuditLogEntry, AuditLogResponse

class AuditTrailService:
    """
    NTRO Compliance Immutable Audit Trail Service.
    Enforces append-only storage for human-in-the-loop analyst decisions and overrides.
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
                event_id VARCHAR PRIMARY KEY,
                timestamp VARCHAR,
                hotspot_id VARCHAR,
                analyst_id VARCHAR,
                original_prediction VARCHAR,
                override_class VARCHAR,
                justification VARCHAR,
                confidence_rating INTEGER
            )
        """)
        conn.close()

    def log_override(self, req: AnalystOverrideRequest) -> AuditLogEntry:
        """Append an immutable audit entry with microsecond precision."""
        event_id = f"AUDIT-EVT-{uuid.uuid4().hex[:12].upper()}"
        ts = datetime.now(timezone.utc).isoformat(timespec="microseconds")
        
        conn = self._get_connection()
        conn.execute("""
            INSERT INTO ntro_audit_trail (
                event_id, timestamp, hotspot_id, analyst_id, 
                original_prediction, override_class, justification, confidence_rating
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            event_id, ts, req.hotspot_id, req.analyst_id,
            req.original_prediction, req.override_class, req.justification, req.confidence_rating
        ])
        conn.close()

        return AuditLogEntry(
            event_id=event_id,
            timestamp=ts,
            hotspot_id=req.hotspot_id,
            analyst_id=req.analyst_id,
            original_prediction=req.original_prediction,
            override_class=req.override_class,
            justification=req.justification,
            confidence_rating=req.confidence_rating
        )

    def get_logs(self, limit: int = 100) -> AuditLogResponse:
        """Retrieve recent audit events for defense compliance inspection."""
        conn = self._get_connection()
        rows = conn.execute("""
            SELECT event_id, timestamp, hotspot_id, analyst_id, 
                   original_prediction, override_class, justification, confidence_rating
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
                original_prediction=r[4],
                override_class=r[5],
                justification=r[6],
                confidence_rating=r[7]
            )
            for r in rows
        ]

        return AuditLogResponse(total_logs=len(logs), logs=logs)

audit_service = AuditTrailService()
