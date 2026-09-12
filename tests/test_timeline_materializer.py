from __future__ import annotations

import pandas as pd

from pipeline.timeline_materializer import build_materialized_layers


def test_materializer_writes_daily_monthly_and_yearly_layers(tmp_path):
    daily = pd.DataFrame(
        [
            {"h3_08": "cell-a", "acq_date": "2024-01-01", "frp_max": 10.0, "n_detections": 2, "n_detections_night": 1, "satellite_nunique": 1},
            {"h3_08": "cell-a", "acq_date": "2024-02-03", "frp_max": 20.0, "n_detections": 1, "n_detections_night": 0, "satellite_nunique": 1},
        ]
    )

    paths = build_materialized_layers(daily, tmp_path)

    assert {p.name for p in paths.values()} == {
        "h3_timeline_daily.parquet",
        "h3_timeline_monthly.parquet",
        "h3_timeline_yearly.parquet",
    }
    monthly = pd.read_parquet(paths["monthly"])
    assert list(monthly["period"]) == ["2024-01", "2024-02"]
    assert int(monthly.loc[0, "n_detections"]) == 2
