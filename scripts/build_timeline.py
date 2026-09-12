from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
from pipeline.timeline_materializer import build_materialized_layers


def main() -> None:
    parser = argparse.ArgumentParser(description="Materialize FIRMS H3 timeline layers.")
    parser.add_argument("--input-parquet", default=settings.H3_DAILY_PARQUET)
    parser.add_argument("--output-dir", default=settings.TIMELINE_DIR)
    args = parser.parse_args()
    paths = build_materialized_layers(pd.read_parquet(args.input_parquet), args.output_dir)
    print(json.dumps({name: str(path) for name, path in paths.items()}, indent=2))


if __name__ == "__main__":
    main()
