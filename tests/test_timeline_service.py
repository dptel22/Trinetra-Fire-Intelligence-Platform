from __future__ import annotations

import pandas as pd

from app.services.timeline_service import TimelineService


def test_timeline_response_reports_range_context_and_observation_basis():
    rows = pd.DataFrame(
        [
            {"h3_08": "cell-a", "acq_date": "2024-01-01", "frp_max": 10.0, "n_detections": 2, "n_detections_night": 1, "satellite_nunique": 1},
            {"h3_08": "cell-a", "acq_date": "2024-02-01", "frp_max": 0.0, "n_detections": 0, "n_detections_night": 0, "satellite_nunique": 0},
        ]
    )

    response = TimelineService().build_response("cell-a", rows, "month", limit=10)

    assert response["available_start_date"] == "2024-01-01"
    assert response["available_end_date"] == "2024-02-01"
    assert response["context"]["historical_context_available"] is False
    assert response["model"]["prediction_scope"] == "historical_thermal_activity"
    assert response["rows"][1]["observation_basis"] == "no_detections_in_ingested_data"
    assert response["rows"][1]["partial"] is True


def test_timeline_response_has_cursor_for_bounded_daily_results():
    rows = pd.DataFrame(
        [
            {"h3_08": "cell-a", "acq_date": f"2024-01-0{i}", "frp_max": 1.0, "n_detections": 1}
            for i in range(1, 4)
        ]
    )

    response = TimelineService().build_response("cell-a", rows, "day", limit=2)

    assert len(response["rows"]) == 2
    assert response["has_more"] is True
    assert response["next_cursor"] == "2024-01-02"
