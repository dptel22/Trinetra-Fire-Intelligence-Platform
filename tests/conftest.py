"""Shared pytest configuration for the backend test suite.

Two environment isolations, both applied before any app import:

1. INGESTION_ON_STARTUP=0 — the FastAPI lifespan spawns a background FIRMS
   ingestion thread when serving data is stale for the current date. Tests
   must never trigger live network ingestion (they would rewrite the real
   serving parquets mid-run and race mocked-HTTP tests). Set
   INGESTION_ON_STARTUP_TESTS=1 to opt back in deliberately.

2. DUCKDB_PATH / AUDIT_DB_PATH point at temp files — settings reads these env
   vars at import time, so the feature store and audit log never touch the
   real data/ databases. This makes the suite reproducible while a demo
   backend is running (uvicorn holds an exclusive lock on
   data/feature_store.duckdb, which previously crashed every store-seeding
   test with a DuckDB IOException).
"""

import os
import tempfile

if os.environ.get("INGESTION_ON_STARTUP_TESTS", "") != "1":
    os.environ["INGESTION_ON_STARTUP"] = "0"

_TEST_DATA_DIR = tempfile.mkdtemp(prefix="trinetra-tests-")
os.environ.setdefault("DUCKDB_PATH", os.path.join(_TEST_DATA_DIR, "feature_store.duckdb"))
os.environ.setdefault("AUDIT_DB_PATH", os.path.join(_TEST_DATA_DIR, "audit_log.duckdb"))
os.environ.setdefault("INGESTION_DB_PATH", os.path.join(_TEST_DATA_DIR, "ingestion.duckdb"))
os.environ.setdefault("RAW_ARCHIVE_DIR", os.path.join(_TEST_DATA_DIR, "archive", "firms"))
