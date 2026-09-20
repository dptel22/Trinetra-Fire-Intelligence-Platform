"""Tests for raw FIRMS evidence + ingestion run manifest endpoints.

Covers:
- GET /api/v1/archive/runs: whitelisted manifest fields only (no filesystem
  paths, no osm_cache block), newest first, acq_date filtering across both
  target dates, gap-fill chunk keys (@date suffixes), and raw-archive parts.
- GET /api/v1/archive/evidence: happy path with run_id defaulting from the
  decisive-run provenance walk; structured 404 ("raw_evidence_not_available")
  for dates that predate the raw archive; 400 on bad dates/sources.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
from app.main import app
from ingestion.raw_archive import write_raw_observations

MODEL_EXISTS = Path(settings.MODEL_PATH).exists()
PARQUET_EXISTS = Path(settings.OSMWRI_PARQUET).exists()

requires_data = pytest.mark.skipif(
    not (MODEL_EXISTS and PARQUET_EXISTS),
    reason="Requires model bundle and OSM/WRI parquet",
)

SNPP = "VIIRS_SNPP_NRT"
NOAA20 = "VIIRS_NOAA20_NRT"


def _raw_frame(rows: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    return df


def _row(lat: float, lon: float, acq_date: str, satellite: str = "N") -> dict:
    return {
        "latitude": lat, "longitude": lon, "bright_ti4": 330.0, "scan": 0.5,
        "track": 0.5, "acq_date": acq_date, "acq_time": 621, "satellite": satellite,
        "confidence": "nominal", "version": "2.0NRT", "bright_ti5": 300.0,
        "frp": 5.0, "daynight": "D",
    }


def _history_file(tmp_path: Path, runs: list[dict]) -> Path:
    history_path = tmp_path / "ingestion_run_history.json"
    history_path.write_text(json.dumps({"runs": runs}), encoding="utf-8")
    return history_path


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@requires_data
class TestArchiveRuns:
    def test_whitelisted_fields_only_no_path_leakage(self, client, tmp_path, monkeypatch):
        runs = [
            {
                "run_id": "RUN-T-1", "target_date": "2026-09-08", "bbox": "68.03,6.75,97.42,37.10",
                "started_at": "s1", "finished_at": "f1", "ok": True,
                "fetch": {"mode": "live_firms", "raw_rows": {"VIIRS_SNPP_NRT@2026-09-08": 7, "VIIRS_NOAA20_NRT@2026-09-08": 3}},
                "points_total": 10, "final_daily_rows": 5, "model_version": "2.0.0",
                "schema_hash": "abc123", "plausibility_violations": [],
                "raw_archive": {"parts": [{"source": SNPP, "acq_date": "2026-09-08", "rows": 7, "sha256": "ff"}]},
                "osm_cache": {"pbf": "/Users/someone/secret/india-latest.osm.pbf"},
            },
        ]
        from ingestion import run_ingestion

        monkeypatch.setattr(run_ingestion, "RUN_HISTORY_PATH", _history_file(tmp_path, runs))
        res = client.get("/api/v1/archive/runs")
        assert res.status_code == 200
        body = res.json()
        assert body["total"] == 1
        run = body["runs"][0]
        assert run["run_id"] == "RUN-T-1" and run["points_total"] == 10
        assert run["raw_rows"] == {"VIIRS_SNPP_NRT@2026-09-08": 7, "VIIRS_NOAA20_NRT@2026-09-08": 3}
        assert run["raw_archive"]["parts"][0]["source"] == SNPP
        serialized = json.dumps(body)
        assert "/Users/" not in serialized and ".pbf" not in serialized and "osm_cache" not in serialized

    def test_acq_date_filter_matches_chunks_and_parts(self, client, tmp_path, monkeypatch):
        from ingestion import run_ingestion

        runs = [
            {
                "run_id": "RUN-T-2", "target_date": "2026-09-09", "ok": True,
                "fetch": {"mode": "live_firms", "raw_rows": {"VIIRS_SNPP_NRT@2026-09-05": 4, "VIIRS_SNPP_NRT@2026-09-09": 2}},
            },
            {
                "run_id": "RUN-T-3", "target_date": "2026-09-01", "ok": True,
                "fetch": {"mode": "override", "raw_rows": {}},
                "raw_archive": {"parts": [{"source": SNPP, "acq_date": "2026-09-08", "rows": 1}]},
            },
        ]
        monkeypatch.setattr(run_ingestion, "RUN_HISTORY_PATH", _history_file(tmp_path, runs))
        for date, expected_ids in [
            ("2026-09-09", ["RUN-T-2"]),       # direct target_date match
            ("2026-09-05", ["RUN-T-2"]),       # gap-fill chunk key match
            ("2026-09-08", ["RUN-T-3"]),       # raw-archive part match
            ("2026-09-01", ["RUN-T-3"]),
        ]:
            body = client.get(f"/api/v1/archive/runs?acq_date={date}").json()
            assert sorted(r["run_id"] for r in body["runs"]) == expected_ids, date

    def test_invalid_date_is_400(self, client):
        assert client.get("/api/v1/archive/runs?acq_date=not-a-date").status_code == 400


@requires_data
class TestArchiveEvidence:
    def test_evidence_run_id_defaults_to_decisive_run(self, client, tmp_path, monkeypatch):
        from ingestion import run_ingestion

        archive_dir = tmp_path / "raw_archive"
        monkeypatch.setattr(settings, "RAW_ARCHIVE_DIR", str(archive_dir))
        runs = [
            {
                "run_id": "RUN-EV-1", "target_date": "2026-09-08", "ok": True,
                "started_at": "s", "plausibility_violations": [],
                "fetch": {"mode": "live_firms", "raw_rows": {f"{SNPP}@2026-09-08": 2}},
            },
        ]
        monkeypatch.setattr(run_ingestion, "RUN_HISTORY_PATH", _history_file(tmp_path, runs))

        parts = write_raw_observations(
            {SNPP: _raw_frame([_row(19.0, 72.8, "2026-09-08"), _row(19.1, 72.9, "2026-09-08")])},
            "RUN-EV-1", "2026-09-08", "b", "t",
        )
        assert parts[0]["rows"] == 2

        res = client.get("/api/v1/archive/evidence?acq_date=2026-09-08&source=VIIRS_SNPP_NRT")
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["run_id"] == "RUN-EV-1"  # decisive run from provenance walk
        assert body["total"] == 2 and len(body["rows"]) == 2
        assert body["data_mode"] == "live"
        row = body["rows"][0]
        assert row["satellite"] == "N" and row["_run_id"] == "RUN-EV-1"
        assert "latitude" in body["columns"] and "frp" in body["columns"]

    def test_evidence_404_for_dates_predating_the_archive(self, client, tmp_path, monkeypatch):
        monkeypatch.setattr(settings, "RAW_ARCHIVE_DIR", str(tmp_path / "missing_archive"))
        from ingestion import run_ingestion

        monkeypatch.setattr(run_ingestion, "RUN_HISTORY_PATH", _history_file(tmp_path, []))
        res = client.get("/api/v1/archive/evidence?acq_date=2026-09-08")
        assert res.status_code == 404
        detail = res.json()["detail"]
        assert detail["error"] == "raw_evidence_not_available"
        assert "predates" in detail["reason"]
        assert detail["available_dates"] == []

    def test_evidence_zero_day_is_200_not_404(self, client, tmp_path, monkeypatch):
        """A zero-detection day with a written raw partition is valid evidence."""
        from ingestion import run_ingestion

        monkeypatch.setattr(settings, "RAW_ARCHIVE_DIR", str(tmp_path / "raw_archive"))
        monkeypatch.setattr(run_ingestion, "RUN_HISTORY_PATH", _history_file(tmp_path, [
            {"run_id": "RUN-EV-2", "target_date": "2026-09-10", "ok": True, "started_at": "s",
             "plausibility_violations": [], "fetch": {"mode": "live_firms", "raw_rows": {}}},
        ]))
        empty = pd.DataFrame({c: pd.Series(dtype="object") for c in
                              ["latitude", "longitude", "acq_date", "acq_time", "satellite", "confidence"]})
        write_raw_observations({SNPP: empty, NOAA20: empty}, "RUN-EV-2", "2026-09-10", "b", "t")
        res = client.get("/api/v1/archive/evidence?acq_date=2026-09-10")
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["total"] == 0 and body["rows"] == []
        assert body["run_id"] == "RUN-EV-2"

    def test_evidence_rejects_bad_input(self, client):
        assert client.get("/api/v1/archive/evidence?acq_date=bad-date").status_code == 400
        assert client.get("/api/v1/archive/evidence?acq_date=2026-09-08&source=MODIS_NRT").status_code == 400
