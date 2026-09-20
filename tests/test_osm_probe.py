"""Tests for scripts/check_osm_history.py decision logic and criteria."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.check_osm_history import (
    WRI_STATUS,
    check_criterion_1_pyosmium,
    evaluate_probe_decision,
)


def test_wri_status_has_required_metrics():
    assert WRI_STATUS["wri_time_aware"] is False
    assert WRI_STATUS["total_plants_india"] == 1589
    assert WRI_STATUS["commissioning_year_available"] == 496
    assert round(WRI_STATUS["commissioning_year_ratio"], 3) == 0.312
    assert WRI_STATUS["status_retirement_fields"] == 0
    assert WRI_STATUS["decision"] == "current_snapshot_only"


def test_criterion_1_pyosmium():
    res = check_criterion_1_pyosmium()
    assert res["passed"] is True
    assert "4.3" in res["version"]


def test_evaluate_decision_all_pass():
    criteria = {
        "criterion_1_pyosmium": {"passed": True},
        "criterion_2_egress": {"passed": True},
        "criterion_3_download": {"passed": True},
        "criterion_4_time_filter": {"passed": True},
        "criterion_5_resources_geom": {"passed": True},
        "criterion_6_h3_coverage": {"passed": True},
    }
    assert evaluate_probe_decision(criteria) == "adopted"


def test_evaluate_decision_pyosmium_missing():
    criteria = {
        "criterion_1_pyosmium": {"passed": False},
        "criterion_2_egress": {"passed": True},
        "criterion_3_download": {"passed": True},
    }
    assert evaluate_probe_decision(criteria) == "not_available_in_environment"


def test_evaluate_decision_egress_failed():
    criteria = {
        "criterion_1_pyosmium": {"passed": True},
        "criterion_2_egress": {"passed": False},
        "criterion_3_download": {"passed": True},
    }
    assert evaluate_probe_decision(criteria) == "not_available_in_environment"


def test_evaluate_decision_download_unavailable():
    criteria = {
        "criterion_1_pyosmium": {"passed": True},
        "criterion_2_egress": {"passed": True},
        "criterion_3_download": {"passed": False},
    }
    assert evaluate_probe_decision(criteria) == "not_available_in_environment"


def test_evaluate_decision_budget_exceeded():
    base = {
        "criterion_1_pyosmium": {"passed": True},
        "criterion_2_egress": {"passed": True},
        "criterion_3_download": {"passed": True},
        "criterion_4_time_filter": {"passed": True},
        "criterion_5_resources_geom": {"passed": True},
        "criterion_6_h3_coverage": {"passed": True},
    }

    c4_fail = dict(base, criterion_4_time_filter={"passed": False, "reason": "exceeded 2h"})
    assert evaluate_probe_decision(c4_fail) == "not_adopted_budget_exceeded"

    c5_fail = dict(base, criterion_5_resources_geom={"passed": False, "reason": "rss > 16gb"})
    assert evaluate_probe_decision(c5_fail) == "not_adopted_budget_exceeded"

    c6_fail = dict(base, criterion_6_h3_coverage={"passed": False, "reason": "coverage < 20%"})
    assert evaluate_probe_decision(c6_fail) == "not_adopted_budget_exceeded"
