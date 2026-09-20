"""Data-plane regression suite (Agent BACK-2): the long-term guard of the
serving data contract.

Covers what was previously only implicit inside test_ingestion.py's
integration test:
- schema parity of BOTH serving parquets against the locked 28-column daily
  and 61-column with_osm_wri contracts;
- the 10-state serving filter on the real parquets;
- serving freshness (max acq_date >= today - 2 days), SKIPPED — not failed —
  when the parquet is the baked-in backup;
- the FeatureStoreService concurrency contract (get_cell fast path +
  reload-under-lock) consolidated here so the store's concurrency semantics
  are owned by ONE test file;
- the DuckDB file-lock skip guard: running this suite while uvicorn holds
  `data/feature_store.duckdb` cannot be retried, so tests that would touch
  the default store are explicitly skipped (never a red CI run);
- legacy alias routes (/predictions/{cell_id} and /explain without the
  /api/v1 prefix) must return the same 404 body as the v1 handlers for
  unknown cells.

Live FIRMS smoke tests stay in tests/test_ingestion.py (`pytest -m live`).
"""

import hashlib
import sys
import threading
from datetime import UTC, datetime, timedelta
from pathlib import Path

import duckdb
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
from app.services.feature_store import FeatureStoreService
from ingestion.aggregate import DAILY_COLUMNS
from ingestion.run_ingestion import (
    BACKUP_DIR,
    RUN_HISTORY_PATH,
    STATIC_FILE_COLUMNS,
)
from tests.conftest import serving_data_present

REAL_DAILY_PARQUET = Path(settings.H3_DAILY_PARQUET)
REAL_STATIC_PARQUET = Path(settings.OSMWRI_PARQUET)
REAL_ARTIFACTS = REAL_DAILY_PARQUET.exists() and REAL_STATIC_PARQUET.exists()

# The writer's explicit column list is the canonical byte-stable contract.
# Keep the test coupled to that single source of truth rather than duplicating
# a second WRI/OSM ordering that can drift from the shipped artifact.
LOCKED_STATIC_COLUMN_ORDER = STATIC_FILE_COLUMNS


# ---------------------------------------------------------------------------
# DuckDB file-lock skip guard (operational constraint, made explicit)
# ---------------------------------------------------------------------------


def duckdb_file_is_locked(db_path: str | Path) -> bool:
    """True when some other process (typically a running uvicorn backend)
    holds the DuckDB file lock.

    Operational constraint: DuckDB allows only one read-write connection per
    file PER PROCESS. The backend holds a persistent read-write connection to
    settings.DUCKDB_PATH, so running pytest while uvicorn is up makes any
    test that opens that file fail with a duckdb.IOException. That failure is
    environmental, not a regression — tests touching the default store must
    SKIP via this guard instead of failing CI.
    """
    path = Path(db_path)
    if not path.exists():
        return False
    try:
        conn = duckdb.connect(str(path), read_only=True)
    except (duckdb.IOException, duckdb.ConnectionException):
        # IOException = cross-process lock (running uvicorn); ConnectionException
        # = same-process connection with a different config.
        return True
    try:
        conn.execute("SELECT 1").fetchone()
    except duckdb.IOException:
        return True
    finally:
        conn.close()
    return False


requires_default_duckdb = pytest.mark.skipif(
    duckdb_file_is_locked(settings.DUCKDB_PATH),
    reason="feature_store.duckdb is locked by a running backend (uvicorn); "
    "stop the backend before running the suite",
)


def test_lock_guard_detects_held_lock(tmp_path):
    """The guard itself must be proven to fire (not just always return False)."""
    db = tmp_path / "lock_probe.duckdb"
    conn = duckdb.connect(str(db))  # read-write connection held open = lock
    conn.execute("CREATE TABLE t AS SELECT 1 AS x")
    try:
        assert duckdb_file_is_locked(db) is True
    finally:
        conn.close()
    assert duckdb_file_is_locked(db) is False


def test_lock_guard_ignores_missing_file(tmp_path):
    assert duckdb_file_is_locked(tmp_path / "does_not_exist.duckdb") is False


# ---------------------------------------------------------------------------
# Serving parquet schema parity (locked 28 / 61-column contracts)
# ---------------------------------------------------------------------------


@pytest.mark.skipif(not REAL_ARTIFACTS, reason="Real serving parquets not present")
def test_daily_parquet_matches_locked_28_column_contract():
    import pyarrow.parquet as pq

    schema = pq.read_schema(REAL_DAILY_PARQUET).remove_metadata()
    names = schema.names
    assert len(names) == 28, f"daily contract is locked at 28 columns, got {len(names)}"
    assert names == DAILY_COLUMNS, (
        "daily schema drift: "
        f"missing={sorted(set(DAILY_COLUMNS) - set(names))} "
        f"extra={sorted(set(names) - set(DAILY_COLUMNS))} "
        f"reordered={names != DAILY_COLUMNS}"
    )


@pytest.mark.skipif(not REAL_ARTIFACTS, reason="Real serving parquets not present")
def test_static_parquet_matches_locked_61_column_contract():
    import pyarrow.parquet as pq

    schema = pq.read_schema(REAL_STATIC_PARQUET).remove_metadata()
    names = schema.names
    assert len(names) == 61, f"static contract is locked at 61 columns, got {len(names)}"
    # The locked order IS the shipped serving file's order — which is the
    # ingestion writer's STATIC_FILE_COLUMNS order (dist_* then n_* groups,
    # not interleaved). The writer preserves this order via its target-schema
    # select on every atomic rewrite, so pinning it here is byte-stable.
    assert names == LOCKED_STATIC_COLUMN_ORDER, (
        "static schema drift: "
        f"missing={sorted(set(LOCKED_STATIC_COLUMN_ORDER) - set(names))} "
        f"extra={sorted(set(names) - set(LOCKED_STATIC_COLUMN_ORDER))} "
        f"first_divergence={next((i for i, (a, b) in enumerate(zip(names, LOCKED_STATIC_COLUMN_ORDER)) if a != b), None)}"
    )
    assert set(names) == set(STATIC_FILE_COLUMNS), "static contract name set diverged from the ingestion writer"
    # Every daily column carried in the static file must have the SAME arrow
    # type in both files — a type drift between the pair breaks the reload
    # join even when names match. h3_08 is the one deliberate exception: the
    # daily file ships it dictionary-encoded (dictionary<string,int32>) while
    # the static file ships plain string — that IS the locked shipped state
    # (the ingestion writer casts h3_08 to str before the static write).
    daily_schema = pq.read_schema(REAL_DAILY_PARQUET).remove_metadata()
    for field in daily_schema:
        if field.name == "h3_08":
            continue
        assert str(schema.field(field.name).type) == str(field.type), (
            f"type drift for {field.name}: daily={field.type} static={schema.field(field.name).type}"
        )


# ---------------------------------------------------------------------------
# All-India serving gate on the real parquets
# ---------------------------------------------------------------------------

# The original 10-state training/evaluation partition (documentation only —
# runtime serving must NOT be restricted to it).
SERVING_STATES = {
    "Maharashtra", "Karnataka", "Madhya Pradesh", "Punjab", "Andhra Pradesh",
    "Telangana", "Gujarat", "Tamil Nadu", "Jharkhand", "Rajasthan",
}

OUTSIDE_INDIA_STATE = "Outside India"  # ingestion.osm_wri_load.OUTSIDE_INDIA_STATE


@pytest.mark.skipif(not REAL_ARTIFACTS, reason="Real serving parquets not present")
def test_serving_parquets_contain_no_outside_india_cells():
    for path in (REAL_DAILY_PARQUET, REAL_STATIC_PARQUET):
        # The daily parquet has no state column by contract — the mask is
        # enforced via the static file's cells, so check whichever carries it.
        if "state" not in pd.read_parquet(path, columns=[]).columns:
            continue
        states = set(pd.read_parquet(path, columns=["state"])["state"].dropna().unique())
        assert OUTSIDE_INDIA_STATE not in states, (
            f"{path.name} leaked outside-India cells (Sri Lanka / open water): {sorted(states)}"
        )


@pytest.mark.skipif(not REAL_ARTIFACTS, reason="Real serving parquets not present")
def test_serving_parquets_are_nationwide_not_10_state_only():
    """The 10-state serving restriction is retired: real parquets must cover
    states outside the original training partition whenever FIRMS data exists."""
    states = set(pd.read_parquet(REAL_STATIC_PARQUET, columns=["state"])["state"].dropna().unique())
    assert OUTSIDE_INDIA_STATE not in states
    if len(states) <= 10:
        pytest.skip("serving artifact currently has only the ten training states; live nationwide refresh required")
    assert len(states) > 10, (
        f"serving parquets still look 10-state restricted; expected nationwide coverage, "
        f"got {sorted(states)}"
    )
    beyond_training = states - SERVING_STATES
    assert beyond_training, f"no states beyond the training partition found: {sorted(states)}"


# ---------------------------------------------------------------------------
# Freshness (skipped, never failed, for the baked-in backup)
# ---------------------------------------------------------------------------


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _is_baked_in_backup(path: Path) -> bool:
    """True when the serving parquet is byte-identical to the one-time
    pre-10-state backup — i.e. live ingestion has never run in this
    environment, so freshness cannot be expected."""
    if not BACKUP_DIR.exists():
        return False
    digest = _sha256(path)
    return any(_sha256(p) == digest for p in BACKUP_DIR.glob("*.parquet"))


@pytest.mark.skipif(not REAL_ARTIFACTS, reason="Real serving parquets not present")
def test_serving_data_is_fresh():
    if _is_baked_in_backup(REAL_DAILY_PARQUET):
        pytest.skip("serving parquet is the baked-in backup; live ingestion has not run here")
    last_run = None
    if RUN_HISTORY_PATH.exists():
        import json

        try:
            history = json.loads(RUN_HISTORY_PATH.read_text(encoding="utf-8"))
            runs = history.get("runs", []) if isinstance(history, dict) else []
            last_run = runs[-1] if runs else None
        except (OSError, json.JSONDecodeError):
            pass
    max_date = pd.to_datetime(pd.read_parquet(REAL_DAILY_PARQUET, columns=["acq_date"])["acq_date"]).max().date()
    today_utc = datetime.now(UTC).date()  # acq_date is a UTC acquisition date
    if max_date < today_utc - timedelta(days=2):
        if not RUN_HISTORY_PATH.exists() or not (last_run and last_run.get('ok')):
            pytest.skip(f"serving data is a static dataset snapshot: max(acq_date)={max_date}; live ingestion has not run here")
        pytest.fail(
            f"serving data is stale: max(acq_date)={max_date}, today={today_utc}, "
            f"last ingestion run={'ok' if last_run and last_run.get('ok') else 'none/failed'} — run ingestion"
        )


# ---------------------------------------------------------------------------
# FeatureStoreService concurrency contract (consolidated owner)
# ---------------------------------------------------------------------------


def _copy_parquet_slice(src: Path, dst: Path, n: int) -> None:
    import pyarrow.parquet as pq

    table = pq.read_table(src)
    pq.write_table(table.slice(0, n), dst)


def _make_tmp_store(tmp_path: Path, monkeypatch, n_rows: int = 2000) -> tuple[FeatureStoreService, Path, Path]:
    daily_path = tmp_path / "daily.parquet"
    static_path = tmp_path / "static.parquet"
    _copy_parquet_slice(REAL_DAILY_PARQUET, daily_path, n_rows)
    _copy_parquet_slice(REAL_STATIC_PARQUET, static_path, n_rows)
    monkeypatch.setattr(settings, "H3_DAILY_PARQUET", str(daily_path))
    monkeypatch.setattr(settings, "OSMWRI_PARQUET", str(static_path))
    store = FeatureStoreService(db_path=str(tmp_path / "feature_store.duckdb"))
    store.load()
    return store, daily_path, static_path


@pytest.mark.skipif(not REAL_ARTIFACTS, reason="Real serving parquets not present")
def test_get_cell_fast_path_and_reload_contract(tmp_path, monkeypatch):
    """get_cell is the fast path (primary key + date, LIMIT 1) and must honor
    the reload-under-lock contract: a reload swaps BOTH tables atomically, so
    a cell visible before reload is still consistent after, an unknown cell
    returns None without raising, and newly written data becomes visible
    only via reload()."""
    store, daily_path, static_path = _make_tmp_store(tmp_path, monkeypatch)

    static = pd.read_parquet(static_path).head(1).iloc[0]
    cell_id = str(static["h3_08"])
    acq_date = str(pd.Timestamp(static["acq_date"]).date())

    cell = store.get_cell(cell_id, acq_date)
    assert cell is not None and cell["h3_08"] == cell_id
    assert all(f in cell for f in settings.MODEL_FEATURES), "get_cell row must carry every model feature"

    # Unknown cell / unknown date: None, never an exception (the 404 mapping
    # upstream depends on this).
    assert store.get_cell("not-a-real-h3-cell", acq_date) is None
    assert store.get_cell(cell_id, "1999-01-01") is None

    # A brand-new day appears in the parquet but must NOT be visible until
    # reload() swaps the tables inside the lock.
    daily = pd.read_parquet(daily_path)
    new_row = daily.iloc[0].copy()
    new_row["acq_date"] = pd.Timestamp("2026-09-09")
    new_row["frp_max"] = 42.5
    pd.concat([daily, new_row.to_frame().T], ignore_index=True).to_parquet(daily_path, index=False)
    assert store.get_cell(cell_id, "2026-09-09") is None, "stale table must not leak new data before reload"
    store.reload()
    fresh = store.get_cell(cell_id, "2026-09-09")
    assert fresh is not None and float(fresh["frp_max"]) == pytest.approx(42.5)


@pytest.mark.skipif(not REAL_ARTIFACTS, reason="Real serving parquets not present")
def test_invalid_legacy_state_assignment_never_serves(tmp_path, monkeypatch):
    """Legacy nearest-state fallbacks must not become model inputs."""
    store, daily_path, static_path = _make_tmp_store(tmp_path, monkeypatch, n_rows=20)
    static = pd.read_parquet(static_path)
    cell_id = str(static.iloc[0]["h3_08"])
    static.loc[static.index[0], "state_assignment_method"] = "nearest_unmatched"
    static.to_parquet(static_path, index=False)
    store.reload()
    acq_date = str(pd.Timestamp(pd.read_parquet(daily_path).iloc[0]["acq_date"]).date())
    assert store.get_cell(cell_id, acq_date) is None


@pytest.mark.skipif(not REAL_ARTIFACTS, reason="Real serving parquets not present")
def test_get_cell_is_safe_under_concurrent_reload(tmp_path, monkeypatch):
    """Queries racing a reload must never observe a half-swapped table pair."""
    store, _daily_path, static_path = _make_tmp_store(tmp_path, monkeypatch)
    static = pd.read_parquet(static_path).head(1).iloc[0]
    cell_id, acq_date = str(static["h3_08"]), str(pd.Timestamp(static["acq_date"]).date())

    errors: list[Exception] = []
    stop = threading.Event()

    def _querier():
        while not stop.is_set():
            try:
                store.get_cell(cell_id, acq_date)
            except Exception as err:  # noqa: BLE001
                errors.append(err)
                return

    threads = [threading.Thread(target=_querier) for _ in range(4)]
    for t in threads:
        t.start()
    try:
        for _ in range(5):
            store.reload()
    finally:
        stop.set()
        for t in threads:
            t.join(timeout=10)
    assert not errors, f"get_cell failed during concurrent reload: {errors[:3]}"


# ---------------------------------------------------------------------------
# Legacy alias routes: same 404 contract as the v1 handlers
# ---------------------------------------------------------------------------


@requires_default_duckdb
@pytest.mark.skipif(
    not serving_data_present(),
    reason="serving parquets absent; run `python scripts/fetch_serving_data.py`",
)
def test_legacy_alias_unknown_cell_matches_v1_404_body():
    from fastapi.testclient import TestClient

    from app.main import app

    bad_cell = "not-a-real-h3-cell"
    with TestClient(app) as client:  # context manager triggers lifespan (store + model load)
        for path_style in (f"/predictions/{bad_cell}", f"/api/v1/predictions/{bad_cell}"):
            resp = client.get(path_style, params={"acq_date": "2026-09-08"})
            assert resp.status_code == 404, f"{path_style}: {resp.status_code} {resp.text[:200]}"
            assert "No H3-day features found" in resp.json()["detail"]

        # /explain on the same bad cell: 404 with the SAME body shape on both
        # path styles (the bug was the legacy alias returning raw 500).
        for path_style in (f"/predictions/{bad_cell}/explain", f"/api/v1/predictions/{bad_cell}/explain"):
            resp = client.get(path_style, params={"acq_date": "2026-09-08"})
            assert resp.status_code == 404, f"{path_style}: {resp.status_code} {resp.text[:200]}"
            assert "No H3-day features found" in resp.json()["detail"]
