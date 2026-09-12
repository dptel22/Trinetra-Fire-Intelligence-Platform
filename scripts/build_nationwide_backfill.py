"""CLI: nationwide FIRMS backfill -> staged materialized layers -> fail-closed validation.

Usage:
    python scripts/build_nationwide_backfill.py [--input-dir DIR ...] [--staging-dir DIR] [--timeline-dir DIR]
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ingestion.nationwide_backfill import build_nationwide_backfill
from pipeline.timeline_validation import validate_and_promote

DEFAULT_INPUT_DIRS = [
    "data/raw/DL_FIRE_J1V-C2_804030",
    "data/raw/DL_FIRE_SV-C2_804031",
]


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", action="append", default=None,
                        help="FIRMS source dir (archive+NRT CSVs); repeatable, defaults to the two measured products")
    parser.add_argument("--staging-dir", default="data/processed/timeline/staging")
    parser.add_argument("--timeline-dir", default="data/processed/timeline")
    args = parser.parse_args()

    input_dirs = args.input_dir or DEFAULT_INPUT_DIRS
    provenance = build_nationwide_backfill(input_dirs, args.staging_dir)
    print(json.dumps({
        "harmonized_rows": provenance["harmonized_rows"],
        "daily_rows": provenance["daily_rows"],
        "layers": provenance["output_layers"],
    }, indent=2))

    report = validate_and_promote(args.staging_dir, args.timeline_dir)
    print(json.dumps({"validated": report["validated"], "checks": report["checks"],
                      "promoted_to": report.get("promoted_to")}, indent=2))
    return 0 if report["validated"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
