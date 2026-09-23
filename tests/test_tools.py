"""End-to-end deterministic tool contracts, including invalid input handling."""

import json
from copy import deepcopy

import pytest

from ai.tools import compare_scenarios, inspect_city_state, simulate_scenario, validate_scenario


def test_inspection_and_demo_are_json_serializable_and_do_not_mutate_data():
    state = inspect_city_state()
    assert len(state["districts"]) == 5
    assert len(state["measures"]) == 14
    assert state["baseline"]["score"] == pytest.approx(52.56, abs=0.005)
    assert state["data_kind"] == "synthetic"
    json.dumps(state, allow_nan=False)
    state["districts"][0]["indicators"]["T1"] = -100
    assert inspect_city_state()["districts"][0]["indicators"]["T1"] >= 0
    demo = inspect_city_state()["demo_plan"]
    assert validate_scenario(demo)["valid"]
    result = simulate_scenario(demo)
    assert result["valid"] and result["budget"]["used"] == 95
    assert result["score"]["after"] == pytest.approx(56.5, abs=0.1)
    json.dumps(result, allow_nan=False)


@pytest.mark.parametrize("decisions", [None, {}, "M7", [{}], [{"measure_id": 7}], [{"measure_id": "M7", "district": []}], [], [{"measure_id": "unknown"}]])
def test_bad_decisions_return_concrete_errors_without_score(decisions):
    for tool in (validate_scenario, simulate_scenario):
        result = tool(decisions)
        assert not result["valid"] and result["errors"]
        assert "score" not in result
        json.dumps(result, allow_nan=False)


def test_compare_exposes_calculated_tradeoffs_and_direction():
    a = inspect_city_state()["demo_plan"]
    b = deepcopy(a)
    b[1]["district"] = "Есиль"
    result = compare_scenarios(a, b)
    assert result["valid"]
    assert result["delta_direction"] == "B - A"
    assert result["budget"]["delta"] == 0
    assert result["score"]["delta"] < 0
    assert result["critical"]["count_a"] == 0
    assert result["critical"]["count_b"] == 1
    assert result["critical"]["delta"] == 1
    assert result["districts"]["Нура"]["delta"] < 0
    assert result["districts"]["Есиль"]["delta"] > 0
    assert result["indicators"]["Нура"]["S2"]["delta"] == -8.75
    assert result["indicators"]["Есиль"]["S2"]["delta"] == 8.75
    assert result["strengths_b"] and result["weaknesses_b"]
    json.dumps(result, allow_nan=False)


def test_identical_comparison_and_invalid_comparison():
    demo = inspect_city_state()["demo_plan"]
    result = compare_scenarios(demo, list(reversed(demo)))
    assert result["score"]["delta"] == 0
    assert result["strengths_b"] == result["weaknesses_b"] == []
    for invalid in ([], [{}], None):
        for a, b in ((invalid, demo), (demo, invalid)):
            result = compare_scenarios(a, b)
            assert not result["valid"]
            assert result["errors"]["scenario_a"] or result["errors"]["scenario_b"]
            assert "score" not in result and "scenarios" not in result
            json.dumps(result, allow_nan=False)
