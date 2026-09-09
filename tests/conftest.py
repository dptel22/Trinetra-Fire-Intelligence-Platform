"""Shared pytest configuration for the backend test suite.

The FastAPI lifespan spawns a background FIRMS ingestion thread when serving
data is stale for the current date. Tests must never trigger live network
ingestion (they would rewrite the real serving parquets mid-run and race
mocked-HTTP tests), so the startup hook is force-disabled before any app
import. Set INGESTION_ON_STARTUP_TESTS=1 to opt back in deliberately.
"""

import os

if os.environ.get("INGESTION_ON_STARTUP_TESTS", "") != "1":
    os.environ["INGESTION_ON_STARTUP"] = "0"
