from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
from pydantic import ValidationError
from app.core.config import settings
from app.schemas.firms import FIRMSRecord, IngestionBatchResponse

router = APIRouter()

# Dead-Letter Queue in-memory buffer (can route to DB/Redis in prod)
DEAD_LETTER_QUEUE: List[Dict[str, Any]] = []

@router.post("/ingest/batch", response_model=IngestionBatchResponse)
def ingest_batch_records(raw_payload: List[Dict[str, Any]]):
    """
    Asynchronous Ingestion Gateway with Pydantic Schema Validation & Dead-Letter Queue (DLQ).
    Protects against NASA schema drift and malformed rows.
    """
    if len(raw_payload) > settings.INGEST_MAX_BATCH_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Batch payload exceeds maximum allowed size of {settings.INGEST_MAX_BATCH_SIZE} records."
        )

    valid_records = []
    quarantined = []

    for idx, item in enumerate(raw_payload):
        try:
            validated = FIRMSRecord.model_validate(item)
            valid_records.append(validated)
        except ValidationError as ve:
            quarantine_entry = {
                "index": idx,
                "payload": item,
                "errors": ve.errors()
            }
            quarantined.append(quarantine_entry)
            DEAD_LETTER_QUEUE.append(quarantine_entry)

    return IngestionBatchResponse(
        total_received=len(raw_payload),
        total_valid=len(valid_records),
        total_quarantined_dlq=len(quarantined),
        message=f"Ingested {len(valid_records)} valid records. Quarantined {len(quarantined)} records into DLQ.",
        quarantined_errors=quarantined[:10]  # Return sample errors
    )

@router.get("/ingest/dlq")
def get_dead_letter_queue():
    """Inspect quarantined records that failed schema validation."""
    return {
        "total_quarantined": len(DEAD_LETTER_QUEUE),
        "quarantined_records": DEAD_LETTER_QUEUE[-50:]
    }
