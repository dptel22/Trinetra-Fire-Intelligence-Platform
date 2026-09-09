"""One-off bootstrap ingestion: feed the public FIRMS 7-day South Asia CSVs
(data/raw/*_South_Asia_7d.csv, keyless downloads) through the normal pipeline
as points_override — identical harmonization/aggregation as a live pull.

The files carry the exact raw NRT schema; only provenance tags are added and
out-of-India-bbox rows dropped before harmonize_points().
"""

from __future__ import annotations

import json
import logging

import pandas as pd

from ingestion.firms_pull import harmonize_points
from ingestion.run_ingestion import INDIA_BBOX, REPO_ROOT, run_ingestion

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("ingestion.bootstrap")

W, S, E, N = (float(p) for p in INDIA_BBOX.split(","))

PARTS = [
    (REPO_ROOT / "data" / "raw" / "SUOMI_VIIRS_C2_South_Asia_7d.csv", "SUOMI-NPP"),
    (REPO_ROOT / "data" / "raw" / "J1_VIIRS_C2_South_Asia_7d.csv", "NOAA-20"),
]


def main() -> None:
    frames = []
    for path, sat_name in PARTS:
        df = pd.read_csv(path)
        n_raw = len(df)
        df = df[df["latitude"].between(S, N) & df["longitude"].between(W, E)].copy()
        df["source"] = "nrt"
        df["satellite_name"] = sat_name
        logger.info("%s: %d raw rows, %d inside India bbox", path.name, n_raw, len(df))
        frames.append(df)

    points = pd.concat(frames, ignore_index=True)
    points = harmonize_points(points)
    logger.info("Harmonized points: %d rows (%s .. %s)",
                len(points), points["acq_date"].min(), points["acq_date"].max())

    target_date = points["acq_date"].max().date().isoformat()
    stats = run_ingestion(date=target_date, points_override=points, gap_fill=False)
    print(json.dumps({k: v for k, v in stats.items() if k != "fetch"}, indent=2, default=str))


if __name__ == "__main__":
    main()
