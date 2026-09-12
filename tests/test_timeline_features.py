from __future__ import annotations

import pandas as pd

from pipeline.timeline_features import build_timeline_features


def test_timeline_features_use_only_prior_rows_and_mark_archive_gaps():
    daily = pd.DataFrame(
        [
            {"h3_08": "cell-a", "acq_date": "2024-01-01", "frp_max": 10.0, "n_detections": 2, "n_detections_night": 1, "satellite_nunique": 1},
            {"h3_08": "cell-a", "acq_date": "2024-01-03", "frp_max": 20.0, "n_detections": 3, "n_detections_night": 0, "satellite_nunique": 2},
            {"h3_08": "cell-a", "acq_date": "2024-01-04", "frp_max": 5.0, "n_detections": 1, "n_detections_night": 0, "satellite_nunique": 1},
        ]
    )

    result = build_timeline_features(daily)

    jan1 = result.iloc[0]
    jan3 = result.iloc[1]
    assert pd.isna(jan1["days_since_last_detection"])
    assert jan3["days_since_last_detection"] == 2
    assert jan3["prior_30d_detections"] == 2
    assert jan3["archive_gap_days"] == 1
    assert jan3["prior_30d_max_frp"] == 10.0
    assert jan3["prior_30d_max_frp"] != 20.0


def test_timeline_features_identify_no_detection_and_archive_gap_periods():
    daily = pd.DataFrame(
        [{"h3_08": "cell-a", "acq_date": "2024-01-01", "frp_max": 0.0, "n_detections": 0, "n_detections_night": 0, "satellite_nunique": 0}]
    )

    result = build_timeline_features(daily)

    assert result.iloc[0]["observation_basis"] == "no_detections_in_ingested_data"
    assert result.iloc[0]["archive_gap_days"] == 0
