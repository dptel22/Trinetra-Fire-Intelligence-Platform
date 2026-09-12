"""Restore all-India serving coverage by merging the pre-10-state backup
parquets back into the canonical serving parquets.

Background: the original nationwide serving builds (Sep 2) were cut down to
the 10 training states during the initial serving migration; the nationwide
files were preserved one-time in
``data/processed/backup_nationwide_pre_10state/``. Serving code has been
geography-open for a while (training states are provenance labels, never a
serving filter), so the historical nationwide rows can be merged back without
re-downloading the FIRMS archive.

Merge semantics (mirrors ingestion.run_ingestion upsert):
- daily rows upsert on (h3_08, acq_date); the CURRENT file wins on overlap
  (newer lag-feature recomputation + NRT days through 2026-09-10).
- static rows dedup per h3_08; current wins, backup fills the ~340k
  cells the 10-state cut removed.
- non-"within" state assignments from the backup (retired
  ``nearest_unmatched`` method) are re-validated through
  ``ingestion.osm_wri_load.assign_states`` exactly like run_ingestion
  step 7b, and cells the India land mask rejects are dropped together
  with their daily rows.
- files are written atomically with exact schema parity against the
  current serving files; the current 10-state files are backed up first.

Usage: python scripts/restore_nationwide_serving.py [--dry-run]
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from app.core.config import settings  # noqa: E402
from ingestion.osm_wri_load import OUTSIDE_INDIA_STATE, assign_states  # noqa: E402
from ingestion.run_ingestion import (  # noqa: E402
    _atomic_write_parquet,
    _target_schemas,
)

BACKUP_DIR = REPO_ROOT / "data" / "processed" / "backup_nationwide_pre_10state"
RESTORE_BACKUP_DIR = REPO_ROOT / "data" / "processed" / "backup_10state_pre_nationwide_restore"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Report merge stats without writing")
    args = parser.parse_args()

    daily_path = Path(settings.H3_DAILY_PARQUET)
    static_path = Path(settings.OSMWRI_PARQUET)
    bak_daily_path = BACKUP_DIR / daily_path.name
    bak_static_path = BACKUP_DIR / static_path.name
    for p in (daily_path, static_path, bak_daily_path, bak_static_path):
        if not p.exists():
            raise FileNotFoundError(p)

    print("Loading daily parquets ...")
    cur_daily = pd.read_parquet(daily_path)
    cur_daily["h3_08"] = cur_daily["h3_08"].astype(str)
    bak_daily = pd.read_parquet(bak_daily_path)
    bak_daily["h3_08"] = bak_daily["h3_08"].astype(str)
    # Normalize acq_date on BOTH frames before dedup: string vs timestamp
    # builds would otherwise dedup by raw value and keep duplicate (h3_08,
    # acq_date) rows.
    cur_daily["acq_date"] = pd.to_datetime(cur_daily["acq_date"]).dt.normalize()
    bak_daily["acq_date"] = pd.to_datetime(bak_daily["acq_date"]).dt.normalize()

    cur_keys = set(map(tuple, cur_daily[["h3_08", "acq_date"]].astype(str).values))
    bak_keys = set(map(tuple, bak_daily[["h3_08", "acq_date"]].astype(str).values))
    print(f"current daily rows: {len(cur_daily)} | backup daily rows: {len(bak_daily)}")
    print(f"rows added by backup: {len(bak_keys - cur_keys)} | overlap (current wins): {len(cur_keys & bak_keys)}")

    combined_daily = pd.concat([cur_daily, bak_daily], ignore_index=True)
    combined_daily = combined_daily.drop_duplicates(subset=["h3_08", "acq_date"], keep="first")
    combined_daily = combined_daily.sort_values(["h3_08", "acq_date"]).reset_index(drop=True)
    print(f"combined daily rows: {len(combined_daily)}")

    print("Loading static parquets (per-cell dedup) ...")
    cur_static = pd.read_parquet(static_path)
    cur_static["h3_08"] = cur_static["h3_08"].astype(str)
    bak_static = pd.read_parquet(bak_static_path)
    bak_static["h3_08"] = bak_static["h3_08"].astype(str)

    per_cell = pd.concat(
        [
            cur_static.drop_duplicates(subset=["h3_08"], keep="first"),
            bak_static.drop_duplicates(subset=["h3_08"], keep="first"),
        ],
        ignore_index=True,
    ).drop_duplicates(subset=["h3_08"], keep="first")
    print(f"per-cell static rows: {len(per_cell)} (current {cur_static['h3_08'].nunique()} + backup fill)")

    # Re-validate retired-method state assignments through the live land mask.
    suspect_mask = per_cell["state_assignment_method"].fillna("missing") != "within"
    n_suspect = int(suspect_mask.sum())
    if n_suspect:
        suspect = per_cell[suspect_mask]
        print(f"Re-validating {n_suspect} non-within cells through assign_states ...")
        reassigned = assign_states(
            suspect[["h3_lat", "h3_lon"]].rename(columns={"h3_lat": "latitude", "h3_lon": "longitude"})
        )
        per_cell.loc[suspect_mask, ["state", "state_assignment_method", "_state_distance_km"]] = (
            reassigned.to_numpy()
        )
        method_counts = per_cell.loc[suspect_mask, "state_assignment_method"].value_counts(dropna=False)
        print(f"re-validation outcomes: {method_counts.to_dict()}")

    # India land-mask gate: outside-India cells and their daily rows are dropped.
    outside_cells = set(per_cell.loc[per_cell["state"] == OUTSIDE_INDIA_STATE, "h3_08"])
    if outside_cells:
        print(f" Dropping {len(outside_cells)} outside-India cells (+their daily rows)")
        per_cell = per_cell[per_cell["state"] != OUTSIDE_INDIA_STATE]
        combined_daily = combined_daily[~combined_daily["h3_08"].isin(outside_cells)]

    # The "static" parquet is the daily frame joined with per-cell columns, so
    # per_cell shares the daily columns (acq_date, frp_max, ...). Join ONLY the
    # per-cell-only columns to avoid _x/_y suffix collisions; the daily side
    # already carries the correct per-(h3_08, acq_date) values.
    daily_cols = set(combined_daily.columns)
    per_cell_only = ["h3_08"] + [c for c in per_cell.columns if c != "h3_08" and c not in daily_cols]
    merged = combined_daily.merge(per_cell[per_cell_only], on="h3_08", how="left", validate="many_to_one")
    n_missing_state = int(merged["state"].isna().sum())
    if n_missing_state:
        raise RuntimeError(f"{n_missing_state} daily rows have no state assignment after merge")

    merged = merged[[c for c in cur_static.columns if c in merged.columns]]
    states = merged.drop_duplicates("h3_08")["state"].nunique()
    cells = merged["h3_08"].nunique()
    print(f"final: {len(merged)} static rows | {cells} cells | {states} states/UTs")
    print(f"final daily rows: {len(combined_daily)}")

    if args.dry_run:
        print("dry-run: nothing written")
        return 0

    RESTORE_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    for src in (daily_path, static_path):
        dst = RESTORE_BACKUP_DIR / src.name
        if not dst.exists():
            shutil.copy2(src, dst)
            print(f"backed up current file -> {dst}")

    target_daily_schema, target_static_schema = _target_schemas(daily_path, static_path)
    _atomic_write_parquet(combined_daily, daily_path, target_daily_schema)
    _atomic_write_parquet(merged, static_path, target_static_schema)
    print("serving parquets written atomically")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
