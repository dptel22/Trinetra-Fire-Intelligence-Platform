from __future__ import annotations

import pandas as pd

from ingestion.historical_backfill import validate_historical_points


def test_historical_validation_reports_coverage_satellites_and_duplicates():
    points = pd.DataFrame(
        [
            {"latitude": 28.6, "longitude": 77.2, "acq_date": "2019-09-01", "acq_time": 100, "satellite": "N", "frp": 4, "bright_ti4": 300, "confidence": "h", "daynight": "D"},
            {"latitude": 28.6, "longitude": 77.2, "acq_date": "2019-09-01", "acq_time": 100, "satellite": "N", "frp": 4, "bright_ti4": 300, "confidence": "h", "daynight": "D"},
            {"latitude": 28.7, "longitude": 77.3, "acq_date": "2019-09-03", "acq_time": 200, "satellite": "N20", "frp": 5, "bright_ti4": 301, "confidence": "n", "daynight": "N"},
        ]
    )

    result = validate_historical_points(points)

    assert result["date_start"] == "2019-09-01"
    assert result["date_end"] == "2019-09-03"
    assert result["satellites"] == ["N", "N20"]
    assert result["duplicate_candidates"] == 1
    assert result["raw_rows"] == 3
