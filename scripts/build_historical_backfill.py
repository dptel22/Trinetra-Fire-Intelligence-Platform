from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ingestion.historical_backfill import build_historical_backfill


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate and materialize a local historical FIRMS backfill.")
    parser.add_argument("input_dir", help="Directory containing historical FIRMS CSV files")
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()
    print(json.dumps(build_historical_backfill(args.input_dir, args.output_dir), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
