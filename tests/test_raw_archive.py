"""Tests for the immutable raw FIRMS observation archive + run manifests.

Covers:
- Raw parts written per (source, acq_date), including zero-detection days
  (a zero-row, schema-carrying partition is still evidence).
- Immutability by construction: two runs targeting the same day produce two
  distinct parts; neither overwrites the other.
- Provenance columns (_run_id, _ingested_at_utc, _request_bbox) attached to
  every row; FIRMS' own columns preserved verbatim, including extra columns
  the API sometimes adds (e.g. `instrument`).
- sha256 part digests; read-back with run_id selection.
- The run_ingestion hook: live (mocked-HTTP) runs write raw parts BEFORE
  aggregation, record run_id/schema_hash/raw_archive in run stats, and
  override runs skip the raw archive explicitly.
- The best-effort DuckDB manifest: canonical runs are recorded, and a
  manifest failure never fails the run.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
from ingestion import raw_archive
from ingestion.firms_pull import NRT_COLUMNS
from ingestion.manifest import record_run
from ingestion.raw_archive import read_raw_observations, write_raw_observations

SNPP = "VIIRS_SNPP_NRT"
NOAA20 = "VIIRS_NOAA20_NRT"


def _raw_frame(rows: list[dict], extra_column: bool = False) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    for col in NRT_COLUMNS:
        if col not in df.columns:
            df[col] = pd.Series([None] * len(df), dtype="object")
    if extra_column:
        df["instrument"] = "viirs"  # FIRMS sometimes adds columns; keep verbatim
    return df


def _row(lat: float, lon: float, acq_date: str, satellite: str = "N") -> dict:
    return {
        "latitude": lat, "longitude": lon, "bright_ti4": 330.0, "scan": 0.5,
        "track": 0.5, "acq_date": acq_date, "acq_time": 621, "satellite": satellite,
        "confidence": "nominal", "version": "2.0NRT", "bright_ti5": 300.0,
        "frp": 5.0, "daynight": "D",
    }


class TestWriteRawObservations:
    def test_one_part_per_source_and_date(self, tmp_path, monkeypatch):
        monkeypatch.setattr(settings, "RAW_ARCHIVE_DIR", str(tmp_path / "archive"))
        frames = {
            SNPP: _raw_frame([_row(19.0, 72.8, "2026-09-08"), _row(19.1, 72.9, "2026-09-08")]),
            NOAA20: _raw_frame([_row(19.0, 72.8, "2026-09-08", "N20")]),
        }
        parts = write_raw_observations(frames, "RUN-X-1", "2026-09-08", "68.03,6.75,97.42,37.10", "2026-09-09T00:00:00Z")
        assert {(p["source"], p["acq_date"]) for p in parts} == {(SNPP, "2026-09-08"), (NOAA20, "2026-09-08")}
        assert {p["rows"] for p in parts} == {2, 1}
        assert all(p["sha256"] and len(p["sha256"]) == 64 for p in parts)

    def test_gap_fill_run_cuts_parts_per_acq_date(self, tmp_path, monkeypatch):
        monkeypatch.setattr(settings, "RAW_ARCHIVE_DIR", str(tmp_path / "archive"))
        frames = {SNPP: _raw_frame([_row(19.0, 72.8, "2026-09-05"), _row(19.1, 72.9, "2026-09-06")])}
        parts = write_raw_observations(frames, "RUN-X-2", "2026-09-06", "68.03,6.75,97.42,37.10", "t")
        by_key = {(p["source"], p["acq_date"]): p["rows"] for p in parts}
        assert by_key[(SNPP, "2026-09-05")] == 1
        assert by_key[(SNPP, "2026-09-06")] == 1
        # Sources absent from the fetch still get a zero-row part at the
        # requested date — silence from a satellite is evidence too.
        assert by_key[(NOAA20, "2026-09-06")] == 0

    def test_zero_detection_day_still_writes_schema_carrying_parts(self, tmp_path, monkeypatch):
        monkeypatch.setattr(settings, "RAW_ARCHIVE_DIR", str(tmp_path / "archive"))
        empty = pd.DataFrame({col: pd.Series(dtype="object") for col in NRT_COLUMNS})
        parts = write_raw_observations({SNPP: empty, NOAA20: empty}, "RUN-X-3", "2026-09-08", "b", "t")
        assert len(parts) == 2
        rows, total = read_raw_observations("2026-09-08", source=SNPP, run_id="RUN-X-3")
        assert total == 0 and rows == []

    def test_provenance_columns_and_superset_preserved(self, tmp_path, monkeypatch):
        monkeypatch.setattr(settings, "RAW_ARCHIVE_DIR", str(tmp_path / "archive"))
        frames = {SNPP: _raw_frame([_row(19.0, 72.8, "2026-09-08")], extra_column=True)}
        write_raw_observations(frames, "RUN-X-4", "2026-09-08", "68.03,6.75,97.42,37.10", "2026-09-09T01:02:03Z")
        rows, total = read_raw_observations("2026-09-08", source=SNPP)
        assert total == 1
        row = rows[0]
        assert row["_run_id"] == "RUN-X-4"
        assert row["_ingested_at_utc"] == "2026-09-09T01:02:03Z"
        assert row["_request_bbox"] == "68.03,6.75,97.42,37.10"
        # FIRMS' own values — including the extra column — untouched.
        assert row["satellite"] == "N" and row["confidence"] == "nominal"
        assert row["instrument"] == "viirs"

    def test_two_runs_produce_two_immutable_parts(self, tmp_path, monkeypatch):
        monkeypatch.setattr(settings, "RAW_ARCHIVE_DIR", str(tmp_path / "archive"))
        frames = {SNPP: _raw_frame([_row(19.0, 72.8, "2026-09-08")])}
        write_raw_observations(frames, "RUN-A", "2026-09-08", "b", "t1")
        write_raw_observations(frames, "RUN-B", "2026-09-08", "b", "t2")
        rows_a, total_a = read_raw_observations("2026-09-08", source=SNPP, run_id="RUN-A")
        rows_b, total_b = read_raw_observations("2026-09-08", source=SNPP, run_id="RUN-B")
        assert total_a == 1 and total_b == 1
        assert rows_a[0]["_run_id"] == "RUN-A" and rows_b[0]["_run_id"] == "RUN-B"
        # No run_id match -> newest part (RUN-B) is served.
        rows_default, _ = read_raw_observations("2026-09-08", source=SNPP)
        assert rows_default[0]["_run_id"] == "RUN-B"
        assert read_raw_observations("2026-09-08", source=SNPP, run_id="RUN-MISSING") == ([], 0)

    def test_available_raw_dates(self, tmp_path, monkeypatch):
        monkeypatch.setattr(settings, "RAW_ARCHIVE_DIR", str(tmp_path / "archive"))
        frames = {SNPP: _raw_frame([_row(19.0, 72.8, "2026-09-08")])}
        write_raw_observations(frames, "RUN-X-5", "2026-09-08", "b", "t")
        assert raw_archive.available_raw_dates() == ["2026-09-08"]


class TestIngestionHook:
    @pytest.fixture
    def real_slice_env(self, tmp_path, monkeypatch):
        daily = Path(settings.H3_DAILY_PARQUET)
        static = Path(settings.OSMWRI_PARQUET)
        if not (daily.exists() and static.exists()):
            pytest.skip("Real serving parquets not present")
        import pyarrow.parquet as pq

        daily_path = tmp_path / "daily.parquet"
        static_path = tmp_path / "static.parquet"
        pq.write_table(pq.read_table(daily).slice(0, 2000), daily_path)
        pq.write_table(pq.read_table(static).slice(0, 2000), static_path)
        return daily_path, static_path

    def test_live_run_writes_raw_parts_and_run_id(self, tmp_path, monkeypatch, real_slice_env):
        daily_path, static_path = real_slice_env
        archive_dir = tmp_path / "raw_archive"
        monkeypatch.setattr(settings, "RAW_ARCHIVE_DIR", str(archive_dir))
        monkeypatch.setenv("FIRMS_MAP_KEY", "a" * 32)

        import ingestion.firms_pull as fp
        from tests.test_ingestion import _firms_csv

        class _Resp:
            status_code = 200
            headers = {"Content-Length": "128"}

            def __init__(self, text):
                self.text = text

        monkeypatch.setattr(fp, "_get", lambda url: _Resp(_firms_csv("N20" if "NOAA20" in url else "N")))

        from ingestion.run_ingestion import run_ingestion
        from ingestion.osm_wri_load import RawInputError

        try:
            stats = run_ingestion(
                date="2026-09-08",
                day_range=1,
                gap_fill=False,
                osm_points_override=pd.DataFrame({"category": ["quarry"], "lon": [72.87], "lat": [19.07]}),
                daily_path=daily_path,
                static_path=static_path,
            )
        except RawInputError as exc:
            pytest.skip(f"Raw inputs absent in demo setup: {exc}")
        assert stats["ok"] is True
        assert stats["run_id"].startswith("RUN-")
        assert stats["model_version"] == settings.VERSION
        assert stats["schema_hash"]
        parts = stats["raw_archive"]["parts"]
        assert {(p["source"], p["acq_date"]) for p in parts} == {(SNPP, "2026-09-08"), (NOAA20, "2026-09-08")}
        # Raw evidence is pre-harmonization: 2 rows per source (the CSV repeats
        # one row), while harmonization dedups to fewer.
        assert all(p["rows"] == 2 for p in parts)
        assert archive_dir.exists()

    def test_override_run_skips_raw_archive(self, tmp_path, real_slice_env):
        daily_path, static_path = real_slice_env
        from ingestion.run_ingestion import run_ingestion
        from ingestion.osm_wri_load import RawInputError

        # Override points must be post-harmonize (like harmonize_points output):
        # normalized daynight enum + the NRT fire-type flags.
        points = pd.DataFrame([{**_row(19.076, 72.8777, "2026-09-08"), "daynight": "Day", "is_static_land": -1, "is_offshore": -1}])
        try:
            stats = run_ingestion(
                date="2026-09-08",
                points_override=points,
                osm_points_override=pd.DataFrame({"category": ["quarry"], "lon": [72.87], "lat": [19.07]}),
                daily_path=daily_path,
                static_path=static_path,
            )
        except RawInputError as exc:
            pytest.skip(f"Raw inputs absent in demo setup: {exc}")
        assert stats["raw_archive"] == {"skipped": "override", "reason": stats["raw_archive"]["reason"]}
        assert stats["run_id"].startswith("RUN-")


class TestManifest:
    def test_record_run_writes_whitelisted_row(self, tmp_path, monkeypatch):
        db = tmp_path / "ingestion.duckdb"
        monkeypatch.setattr(settings, "INGESTION_DB_PATH", str(db))
        stats = {
            "run_id": "RUN-M-1", "started_at": "s", "finished_at": "f", "ok": True,
            "target_date": "2026-09-08", "bbox": "b", "fetch": {"mode": "live_firms"},
            "points_total": 10, "final_daily_rows": 5, "final_static_rows": 5,
            "model_version": "2.0.0", "schema_hash": "abc",
            "plausibility_violations": [],
            "raw_archive": {"parts": [{"source": SNPP, "acq_date": "2026-09-08", "rows": 2}]},
            # Host paths must never reach the manifest:
            "osm_cache": {"pbf": "/Users/someone/secret.osm.pbf"},
        }
        assert record_run(stats) is True
        import duckdb

        conn = duckdb.connect(db, read_only=True)
        rows = conn.execute("SELECT * FROM ingestion_runs").fetchall()
        conn.close()
        assert len(rows) == 1
        assert json.loads(rows[0][13]) == []  # plausibility_violations
        parts = json.loads(rows[0][14])
        assert parts["parts"][0]["source"] == SNPP

    def test_record_run_is_best_effort(self, tmp_path, monkeypatch):
        # A directory as the DB path makes duckdb.connect fail; record_run must
        # return False instead of raising — ingestion is already done by then.
        monkeypatch.setattr(settings, "INGESTION_DB_PATH", str(tmp_path))
        stats = {"run_id": "RUN-M-2", "ok": True}
        assert record_run(stats) is False

    def test_record_run_requires_run_id(self, tmp_path, monkeypatch):
        monkeypatch.setattr(settings, "INGESTION_DB_PATH", str(tmp_path / "m.duckdb"))
        assert record_run({"ok": True}) is False
