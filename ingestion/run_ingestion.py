"""Ingestion orchestration: FIRMS live pull -> H3-day aggregation -> OSM/WRI +
state join -> the two serving parquets `FeatureStoreService.load()` reads.

Targets (byte-for-byte, from app/core/config.py defaults, env-overridable):
- data/processed/sih2026_h3_daily_features_firms.parquet       (28 daily cols)
- data/processed/sih2026_h3_daily_features_with_osm_wri.parquet (61 cols:
  the daily frame + h3_lat/h3_lon/state/state_assignment_method/
  _state_distance_km + 16 WRI + 12 OSM static columns)

The 10-state serving filter (MH/KA/MP/PB/AP/TS/GJ/TN/JH/RJ) is RETIRED:
runtime serving is all-India. The only geographic gate before writing is the
India polygon land mask from osm_wri_load.assign_states — points outside the
union of Indian state/UT polygons (Sri Lanka, open water, ...) are rejected
with state = "Outside India" and never reach the serving parquets. States
outside the original 10-state training/evaluation partition are served with a
geographic-generalization review flag added by the backend; SERVING_STATES
survives for training/evaluation documentation and run-history statistics.

Idempotency: rows are upserted on (h3_08, acq_date) — re-running the same day
overwrites, never duplicates. Temporal lag features are recomputed for every
affected cell over the combined (history + new) series so lags stay consistent
with the notebook's leakage-safe Phase-8 semantics.

Scheduling plan (decided): the backend FastAPI lifespan runs
`ensure_fresh_for_backend()` in a background daemon thread at boot — a cheap
freshness check happens on the hot path (millisecond JSON read) and the
backend serves stale data immediately if ingestion is slow or fails; the CLI
(`python -m ingestion.run_ingestion`) stays synchronous for manual/backfill
runs. This keeps demo restarts zero-latency.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import shutil
import time
from datetime import date as date_cls
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

from app.core.config import settings
from ingestion.aggregate import DAILY_COLUMNS, build_daily_frame
from ingestion.firms_pull import (
    MAX_DAY_RANGE,
    IngestionError,
    fetch_firms_both,
    validate_bbox,
    validate_date,
)
from ingestion.osm_wri_load import (
    OSM_COLUMNS,
    OUTSIDE_INDIA_STATE,
    RawInputError,
    SERVING_STATES,
    WRI_COLUMNS,
    assign_states,
    build_osm_feature_cache,
    compute_osm_features,
    compute_wri_features,
    validate_raw_inputs,
)

logger = logging.getLogger("ingestion.run")

REPO_ROOT = Path(__file__).resolve().parent.parent
INDIA_BBOX = "68.03,6.75,97.42,37.10"  # verified west,south,east,north for full India
RUN_HISTORY_PATH = REPO_ROOT / "data" / "processed" / "ingestion_run_history.json"
BACKUP_DIR = REPO_ROOT / "data" / "processed" / "backup_nationwide_pre_10state"
# Captured at import: tests monkeypatch settings.OSMWRI_PARQUET onto temp paths,
# so the canonical-vs-test decision must never read the mutable attribute.
_CANONICAL_OSMWRI_PARQUET = Path(settings.OSMWRI_PARQUET).resolve()

STATIC_ID_COLUMNS = ["h3_lat", "h3_lon", "state", "state_assignment_method", "_state_distance_km"]
STATIC_FILE_COLUMNS = DAILY_COLUMNS + STATIC_ID_COLUMNS + WRI_COLUMNS + OSM_COLUMNS  # 61


# ---------------------------------------------------------------------------
# Freshness helpers (cheap; used by the backend startup hook)
# ---------------------------------------------------------------------------


def read_last_run() -> dict | None:
    try:
        history = json.loads(RUN_HISTORY_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    runs = history.get("runs") if isinstance(history, dict) else None
    if not runs:
        return None
    return runs[-1]


def is_ingestion_current(target_date: str, bbox: str = INDIA_BBOX) -> bool:
    """True when a successful run already covered target_date with the same bbox."""
    last = read_last_run()
    if not last or not last.get("ok"):
        return False
    return (
        last.get("target_date") == target_date
        and last.get("bbox") == bbox
    )


def ingestion_provenance() -> dict:
    """Data-quality block for /health: what the last run served and rejected.

    Surfaces nationwide coverage provenance (states served, outside-India
    rejections, rows outside the original 10-state training geography) so the
    UI can label coverage honestly instead of implying validated nationwide
    historical data.
    """
    last = read_last_run()
    if not last or not last.get("ok"):
        return {"available": False, "last_run_ok": bool(last and last.get("ok"))}
    sf = last.get("state_filter", {})
    return {
        "available": True,
        "last_run_ok": True,
        "target_date": last.get("target_date"),
        "finished_at": last.get("finished_at"),
        "gap_filled": last.get("gap_filled"),
        "fetch_mode": (last.get("fetch") or {}).get("mode"),
        "states_served": sf.get("states_served"),
        "india_rows_retained": sf.get("india_rows_retained"),
        "outside_india_rejected": sf.get("outside_india_rejected"),
        "outside_training_geography_rows": sf.get("outside_training_geography_rows"),
        "final_daily_rows": last.get("final_daily_rows"),
        "serving_scope": "all-india (10-state training partition retired from serving)",
    }


def _append_run_history(entry: dict) -> None:
    RUN_HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    history: dict = {"runs": []}
    try:
        loaded = json.loads(RUN_HISTORY_PATH.read_text(encoding="utf-8"))
        if isinstance(loaded, dict) and isinstance(loaded.get("runs"), list):
            history = loaded
    except (OSError, json.JSONDecodeError):
        pass
    history["runs"].append(entry)
    history["runs"] = history["runs"][-200:]
    tmp = RUN_HISTORY_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(history, indent=2, default=str), encoding="utf-8")
    os.replace(tmp, RUN_HISTORY_PATH)


# ---------------------------------------------------------------------------
# Serving parquet IO
# ---------------------------------------------------------------------------


def _target_schemas(daily_path: Path, static_path: Path):
    """Read the exact arrow schemas of the existing serving parquets.

    Falls back to writing frames as-is when the files don't exist yet (fresh
    environment); the integration test asserts parity against the real files.
    """
    import pyarrow.parquet as pq

    def _read(path: Path):
        if not path.exists():
            return None
        schema = pq.read_schema(path)
        return schema.remove_metadata() if schema.metadata is not None else schema

    return _read(daily_path), _read(static_path)


def _atomic_write_parquet(df: pd.DataFrame, path: Path, target_schema=None) -> None:
    import pyarrow as pa
    import pyarrow.parquet as pq

    path.parent.mkdir(parents=True, exist_ok=True)
    table = pa.Table.from_pandas(df, preserve_index=False)
    if target_schema is not None:
        table = table.select([f.name for f in target_schema])
        table = table.cast(target_schema, safe=False)
    tmp = path.with_suffix(path.suffix + ".tmp")
    pq.write_table(table, tmp)
    os.replace(tmp, path)


def _backup_originals_once(paths: list[Path]) -> bool:
    """One-time backup of the ORIGINAL nationwide serving parquets.

    Only applies when overwriting the canonical serving paths (not test
    overrides pointing at temp dirs).
    """
    canonical = {Path(settings.H3_DAILY_PARQUET).resolve(), Path(settings.OSMWRI_PARQUET).resolve()}
    if not any(p.resolve() in canonical for p in paths):
        return False
    if BACKUP_DIR.exists():
        return False
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    for p in paths:
        if p.exists():
            shutil.copy2(p, BACKUP_DIR / p.name)
    logger.warning(
        "Original serving parquets backed up to %s (one-time).",
        BACKUP_DIR,
    )
    return True


def _load_parquet_frame(path: Path) -> pd.DataFrame | None:
    if not path.exists():
        return None
    df = pd.read_parquet(path)
    df["h3_08"] = df["h3_08"].astype(str)
    if "daynight" in df.columns:
        df["daynight"] = df["daynight"].astype(str)
    return df


# ---------------------------------------------------------------------------
# Day-range planning (FIRMS DAY_RANGE ceiling is 10)
# ---------------------------------------------------------------------------


def _plan_day_chunks(target_date: str, daily_path: Path, day_range: int | None, gap_fill: bool) -> list[tuple[str, int]]:
    """Return [(start_date, days)] requests needed to reach target_date.

    With gap_fill, start after the newest date already in the serving daily
    parquet so the temporal-gap lags stay meaningful; otherwise fetch exactly
    day_range days ending... starting at target_date.
    """
    target = date_cls.fromisoformat(target_date)
    if day_range is not None:
        return [(target_date, min(int(day_range), MAX_DAY_RANGE))]
    start = target
    if gap_fill and daily_path.exists():
        existing_max = pd.to_datetime(pd.read_parquet(daily_path, columns=["acq_date"])["acq_date"]).max()
        candidate = (existing_max + timedelta(days=1)).date()
        if candidate > target:
            return []  # already covered
        start = candidate
    chunks: list[tuple[str, int]] = []
    cursor = start
    while cursor <= target:
        span = min(MAX_DAY_RANGE, (target - cursor).days + 1)
        chunks.append((cursor.isoformat(), span))
        cursor += timedelta(days=span)
    return chunks


# ---------------------------------------------------------------------------
# Main orchestration
# ---------------------------------------------------------------------------


def run_ingestion(
    date: str | None = None,
    bbox: str = INDIA_BBOX,
    day_range: int | None = None,
    daily_path: Path | None = None,
    static_path: Path | None = None,
    gap_fill: bool = True,
    points_override: pd.DataFrame | None = None,
    osm_points_override: pd.DataFrame | None = None,
) -> dict:
    """Run the full ingestion. Returns a stats dict (also appended to run history)."""
    t_start = time.perf_counter()
    bbox = validate_bbox(bbox)
    target_date = validate_date(date) or datetime.now(timezone.utc).date().isoformat()
    daily_path = Path(daily_path or settings.H3_DAILY_PARQUET)
    static_path = Path(static_path or settings.OSMWRI_PARQUET)

    stats: dict = {
        "target_date": target_date,
        "bbox": bbox,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "gap_filled": bool(day_range is None and gap_fill),
    }

    # 1. Fail loud on missing raw inputs (OSM PBF / WRI CSV / shapefile).
    validate_raw_inputs()

    # 2. Fetch FIRMS points for the planned day chunks.
    if points_override is not None:
        points = points_override.copy()
        stats["fetch"] = {"mode": "override", "raw_rows": {"override": int(len(points))}}
    else:
        chunks = _plan_day_chunks(target_date, daily_path, day_range, gap_fill)
        stats["fetch"] = {"mode": "live_firms", "chunks": chunks, "per_chunk": {}}
        frames: list[pd.DataFrame] = []
        for chunk_date, span in chunks:
            pts, chunk_stats = fetch_firms_both(bbox, day_range=span, date=chunk_date)
            # Per-chunk FIRMS row counts make day-over-day plausibility
            # comparisons possible straight from the run-history JSON.
            stats["fetch"]["per_chunk"][chunk_date] = {
                "day_range": span,
                **{src: int(n) for src, n in chunk_stats["raw_rows"].items()},
                "rows_after_harmonize": int(chunk_stats.get("rows_after_harmonize", 0)),
            }
            stats["fetch"].setdefault("raw_rows", {})
            for k, v in chunk_stats["raw_rows"].items():
                stats["fetch"]["raw_rows"][f"{k}@{chunk_date}"] = v
            if not pts.empty:
                frames.append(pts)
        points = pd.concat(frames, ignore_index=True) if frames else points_override
        if points is None or points.empty:
            points = pd.DataFrame()
    stats["points_total"] = int(len(points))

    # 3. Aggregate to the typed daily frame.
    new_daily = build_daily_frame(points) if not points.empty else None

    # 4. Load existing serving frames.
    hist_daily = _load_parquet_frame(daily_path)
    hist_static = _load_parquet_frame(static_path)
    stats["hist_daily_rows"] = int(len(hist_daily)) if hist_daily is not None else 0
    stats["hist_static_rows"] = int(len(hist_static)) if hist_static is not None else 0

    # 5. Upsert daily rows on (h3_08, acq_date).
    if hist_daily is None:
        combined_daily = new_daily
    elif new_daily is None:
        combined_daily = hist_daily
    else:
        combined_daily = pd.concat([hist_daily, new_daily], ignore_index=True)
        combined_daily = combined_daily.drop_duplicates(subset=["h3_08", "acq_date"], keep="last")

    # 6. Recompute temporal history for affected cells over combined series.
    if new_daily is not None and not new_daily.empty and hist_daily is not None:
        from ingestion.aggregate import add_temporal_history, finalize_daily

        affected = set(new_daily["h3_08"].astype(str))
        mask = combined_daily["h3_08"].isin(affected)
        subset = combined_daily[mask].copy()
        subset = add_temporal_history(subset)  # verbatim Phase 8 (sorts internally)
        subset = finalize_daily(subset)
        subset["is_labeled"] = subset["is_labeled"].fillna(0).astype("int8")
        combined_daily = pd.concat([combined_daily[~mask], subset], ignore_index=True)
        stats["recomputed_cells"] = len(affected)
    if combined_daily is not None and not combined_daily.empty:
        combined_daily = combined_daily.sort_values(["h3_08", "acq_date"]).reset_index(drop=True)

    # 7. Static enrichment (state + OSM/WRI) for cells the static file lacks.
    known_cells = set()
    if hist_static is not None:
        known_cells = set(hist_static["h3_08"].astype(str).unique())
    combined_cells = set(combined_daily["h3_08"].astype(str).unique()) if combined_daily is not None and not combined_daily.empty else set()
    new_cells = sorted(combined_cells - known_cells)
    stats["new_cells"] = len(new_cells)

    per_cell_static: pd.DataFrame | None = None
    if hist_static is not None and not hist_static.empty:
        per_cell_static = hist_static.drop_duplicates(subset=["h3_08"], keep="first")[
            ["h3_08"] + STATIC_ID_COLUMNS + WRI_COLUMNS + OSM_COLUMNS
        ]
    if new_cells:
        t_static = time.perf_counter()
        new_cell_df = pd.DataFrame({"h3_08": new_cells})
        import h3 as h3lib

        coords = [h3lib.cell_to_latlng(c) for c in new_cells]
        new_cell_df["latitude"] = [c[0] for c in coords]
        new_cell_df["longitude"] = [c[1] for c in coords]
        # h3_lat/h3_lon are the serving contract's cell centroids.
        new_cell_df["h3_lat"] = new_cell_df["latitude"]
        new_cell_df["h3_lon"] = new_cell_df["longitude"]
        new_cell_df = new_cell_df.merge(assign_states(new_cell_df[["latitude", "longitude"]]), left_index=True, right_index=True)
        new_cell_df = new_cell_df.merge(compute_wri_features(new_cell_df[["latitude", "longitude"]]), left_index=True, right_index=True)
        if osm_points_override is not None:
            osm_feats = compute_osm_features(new_cell_df[["latitude", "longitude"]], osm_points_override)
        else:
            osm_points, osm_meta = build_osm_feature_cache()
            stats["osm_cache"] = osm_meta
            osm_feats = compute_osm_features(new_cell_df[["latitude", "longitude"]], osm_points)
        new_cell_df = pd.concat([new_cell_df.reset_index(drop=True), osm_feats.reset_index(drop=True)], axis=1)
        keep_cols = ["h3_08"] + STATIC_ID_COLUMNS + WRI_COLUMNS + OSM_COLUMNS
        new_cell_static = new_cell_df[keep_cols]
        per_cell_static = (
            new_cell_static if per_cell_static is None
            else pd.concat([per_cell_static, new_cell_static], ignore_index=True)
        )
        stats["static_enrich_seconds"] = round(time.perf_counter() - t_static, 2)
        stats["new_cells_by_state"] = (
            new_cell_df["state"].value_counts().to_dict() if not new_cell_df.empty else {}
        )

    # 7b. Re-validate the India land mask on carried-over cells whose state
    # assignment is not a clean within-polygon hit. Cells enriched under the
    # retired nearest-state fallback can carry a mislabeled Indian state —
    # e.g. Sri Lankan cells labeled Tamil Nadu — and would otherwise survive
    # the upsert forever because they are already "known" to the static file.
    if per_cell_static is not None and not per_cell_static.empty:
        suspect_mask = per_cell_static["state_assignment_method"] != "within"
        n_suspect = int(suspect_mask.sum())
        if n_suspect:
            suspect = per_cell_static[suspect_mask]
            reassigned = assign_states(
                suspect[["h3_lat", "h3_lon"]].rename(columns={"h3_lat": "latitude", "h3_lon": "longitude"})
            )
            per_cell_static.loc[suspect_mask, ["state", "state_assignment_method", "_state_distance_km"]] = (
                reassigned.to_numpy()
            )
            stats["revalidated_state_cells"] = n_suspect
            logger.info("Re-validated India mask on %d carried-over non-within cells", n_suspect)
    if per_cell_static is None or per_cell_static.empty:
        raise IngestionError("No static feature table available to join — cannot build the serving static parquet")
    if combined_daily is None or combined_daily.empty:
        raise IngestionError(
            "Nothing to write: no existing daily parquet and no detections fetched "
            "(an empty day with existing history is valid and keeps the store unchanged)"
        )

    # 8. Join static columns onto every daily row (row-per cell-day, like the
    # shipped with_osm_wri parquet; FeatureStoreService dedups per cell itself).
    static_frame = combined_daily.merge(per_cell_static, on="h3_08", how="left", validate="many_to_one")
    if static_frame["state"].isna().any():
        missing = int(static_frame["state"].isna().sum())
        raise IngestionError(f"{missing} daily rows have no state assignment — investigate before writing")

    # 9. India polygon land-mask gate: every Indian state/UT is served; only
    # points the mask marked outside India are rejected. Inference is
    # all-India — SERVING_STATES is used below for training-geography
    # statistics only, never as an exclusion filter.
    n_before = len(static_frame)
    in_india = static_frame["state"] != OUTSIDE_INDIA_STATE
    rejected = static_frame[~in_india]
    static_out = static_frame[in_india].copy()
    in_training = static_out["state"].isin(SERVING_STATES)
    stats["state_filter"] = {
        "india_rows_retained": int(len(static_out)),
        "outside_india_rejected": int(len(rejected)),
        "rejected_by_state": rejected["state"].value_counts().to_dict(),
        "rows_by_state": static_out["state"].value_counts().to_dict(),
        "states_served": int(static_out["state"].nunique()),
        "outside_training_geography_rows": int((~in_training).sum()),
        "training_geography_rows": int(in_training.sum()),
    }
    kept_cells = set(static_out["h3_08"].astype(str))
    daily_out = combined_daily[combined_daily["h3_08"].isin(kept_cells)].copy()
    logger.info(
        "India land-mask gate: kept %d/%d rows across %d states/UTs "
        "(rejected %d outside-India rows)",
        len(static_out), n_before, stats["state_filter"]["states_served"], len(rejected),
    )

    # 10. Atomic writes with exact schema parity against the existing files.
    target_daily_schema, target_static_schema = _target_schemas(daily_path, static_path)
    backed_up = _backup_originals_once([daily_path, static_path])
    stats["backed_up_originals"] = backed_up
    _atomic_write_parquet(daily_out, daily_path, target_daily_schema)
    _atomic_write_parquet(static_out, static_path, target_static_schema)
    stats["final_daily_rows"] = int(len(daily_out))
    stats["final_static_rows"] = int(len(static_out))

    stats["wall_seconds"] = round(time.perf_counter() - t_start, 2)
    stats["ok"] = True
    stats["finished_at"] = datetime.now(timezone.utc).isoformat()
    violations = plausibility_violations(stats)
    stats["plausibility_violations"] = violations
    if violations:
        logger.warning("Plausibility gates flagged this run: %s", violations)
    # Run history is the serving-provenance record: only runs that wrote the
    # canonical serving parquets belong in it. Test runs with temp-path
    # overrides must never pollute it — a stale override entry as "last run"
    # flips is_ingestion_current() and both misreports /health provenance and
    # can trigger a pointless live pull at boot.
    if Path(static_path).resolve() == _CANONICAL_OSMWRI_PARQUET:
        _append_run_history(stats)
    else:
        stats["run_history_recorded"] = False
    logger.info(
        "Ingestion complete: daily=%d rows, static=%d rows (%.1fs)",
        len(daily_out), len(static_out), stats["wall_seconds"],
    )
    return stats


def ensure_fresh_for_backend() -> dict | None:
    """Startup-hook entry point: ingest only when stale, then reload the store.

    Runs in a background thread from app.main — never blocks boot. Failures
    are logged and swallowed: the backend keeps serving the last good data.
    """
    target_date = datetime.now(timezone.utc).date().isoformat()
    if is_ingestion_current(target_date):
        logger.info("Ingestion data already current for %s — skipping", target_date)
        return None
    logger.info("Serving data stale for %s — running background ingestion", target_date)
    stats = run_ingestion(date=target_date)
    from app.services.feature_store import feature_store

    feature_store.reload()
    logger.info("Feature store reloaded after ingestion (daily rows: %s)", stats.get("final_daily_rows"))
    return stats


# ---------------------------------------------------------------------------
# Plausibility gates (regression check for live pulls)
# ---------------------------------------------------------------------------


def plausibility_violations(stats: dict) -> list[str]:
    """Order-of-magnitude sanity gates for a single-day live pull.

    The historical Phase-6 class counts (388 mining / 37,962 wildfire TRAIN
    cells etc.) describe the multi-year LABELED dataset and are not valid
    expectations for a one-day pull, so no absolute class numbers appear here.
    Violations are recorded in run history and logged — they are a tripwire,
    not a crash.
    """
    violations: list[str] = []
    pts = int(stats.get("points_total") or 0)
    if pts < 100:
        violations.append(f"points_total={pts} implausibly low for an India-wide day")
    if pts > 2_000_000:
        violations.append(f"points_total={pts} implausibly high for VIIRS NRT over India")
    new_cells = int(stats.get("new_cells") or 0)
    if pts > 0 and new_cells > pts:
        violations.append(f"new_cells={new_cells} exceeds points_total={pts}")
    final_rows = int(stats.get("final_daily_rows") or 0)
    if final_rows <= 0:
        violations.append(f"final_daily_rows={final_rows} must be positive")
    hist_rows = int(stats.get("hist_daily_rows") or 0)
    if hist_rows and final_rows > hist_rows * 3:
        violations.append(f"final_daily_rows={final_rows} tripled vs history ({hist_rows})")
    state_filter = stats.get("state_filter", {})
    kept = int(state_filter.get("india_rows_retained") or 0)
    dropped = int(state_filter.get("outside_india_rejected") or 0)
    if kept == 0:
        violations.append("India land-mask gate retained no rows")
    return violations


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="PS26162 live FIRMS ingestion")
    parser.add_argument("--date", default=None, help="Target date YYYY-MM-DD (default: today UTC)")
    parser.add_argument("--day-range", type=int, default=None, help="Explicit day range 1-10 (disables gap fill)")
    parser.add_argument("--bbox", default=INDIA_BBOX, help="west,south,east,north (default: full India)")
    parser.add_argument("--no-gap-fill", action="store_true", help="Do not backfill from the newest stored date")
    parser.add_argument("--force-osm-rebuild", action="store_true", help="Rebuild the OSM feature cache from the PBF")
    args = parser.parse_args()

    try:
        if args.force_osm_rebuild:
            from ingestion.osm_wri_load import build_osm_feature_cache

            _, meta = build_osm_feature_cache(force=True)
            print(f"OSM cache rebuilt: {meta}")
        stats = run_ingestion(
            date=args.date,
            bbox=args.bbox,
            day_range=args.day_range,
            gap_fill=not args.no_gap_fill,
        )
    except (IngestionError, RawInputError) as err:
        logger.error("Ingestion failed: %s", err)
        _append_run_history({"ok": False, "error": str(err), "at": datetime.now(timezone.utc).isoformat()})
        return 1
    print(json.dumps({k: v for k, v in stats.items() if k != "fetch"}, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
