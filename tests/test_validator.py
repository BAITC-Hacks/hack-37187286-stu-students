"""Every business constraint returns a concrete reason and never a Score."""

from copy import deepcopy

import pytest

from ai.data import DEMO_PLAN, MEASURES
from ai.simulator import simulate
from ai.validator import validate_plan
from backend.schemas import Decision, Plan


def plan(*measure_ids, district="Нура"):
    return [{"measure_id": measure_id,
             "district": district if MEASURES[measure_id]["scope"] == "district" else None}
            for measure_id in measure_ids]


def codes(decisions):
    result = validate_plan(decisions)
    assert not result.valid
    assert all(error.message for error in result.errors)
    assert "score" not in simulate(decisions).model_dump()
    return {error.code for error in result.errors}


def test_valid_example_and_typed_plan():
    assert validate_plan(DEMO_PLAN).valid
    result = validate_plan(Plan(decisions=[Decision(**item) for item in DEMO_PLAN]))
    assert result.valid and result.errors == []
    assert result.budget.used == 95


def test_exact_budget_allowed_and_overspending_rejected():
    exact = plan("M1", "M2", "M7", "M8", "M14")
    result = validate_plan(exact)
    assert result.valid
    assert result.budget.used == 100 and result.budget.remaining == 0
    assert "budget_exceeded" in codes(plan("M1", "M2", "M7", "M8", "M13"))


@pytest.mark.parametrize("decisions", [[], DEMO_PLAN[:4], DEMO_PLAN + [{"measure_id": "M2"}]])
def test_exactly_five_decisions(decisions):
    assert "decision_count" in codes(decisions)


def test_duplicate_measure_even_in_different_districts():
    decisions = deepcopy(DEMO_PLAN)
    decisions[-1] = {"measure_id": "M7", "district": "Есиль"}
    assert "duplicate_measure" in codes(decisions)


def test_direction_limit_and_three_directions_allowed():
    assert "direction_limit" in codes(plan("M7", "M8", "M9", "M10", "M12"))
    assert validate_plan(plan("M7", "M8", "M10", "M11", "M12")).valid


@pytest.mark.parametrize("second_district", ["Нура", "Есиль"])
def test_m1_m3_conflict_is_global(second_district):
    decisions = plan("M1", "M3", "M9", "M10", "M12")
    decisions[1]["district"] = second_district
    assert "incompatible_measures" in codes(decisions)


@pytest.mark.parametrize("ids", [
    ("M4", "M7", "M9", "M10", "M12"),
    ("M5", "M13", "M9", "M10", "M12"),
])
def test_local_conflicts_only_in_same_district(ids):
    decisions = plan(*ids)
    assert "incompatible_measures" in codes(decisions)
    decisions[1]["district"] = "Есиль"
    assert validate_plan(decisions).valid


@pytest.mark.parametrize("replacement,expected", [
    ({"measure_id": "M7"}, "district_required"),
    ({"measure_id": "M7", "district": "Неизвестный"}, "unknown_district"),
    ({"measure_id": "M2", "district": "Нура"}, "city_district_forbidden"),
    ({"measure_id": "M999", "district": "Нура"}, "unknown_measure"),
])
def test_measures_and_scope_are_validated(replacement, expected):
    decisions = deepcopy(DEMO_PLAN)
    decisions[0] = replacement
    assert expected in codes(decisions)


@pytest.mark.parametrize("invalid", [None, {}, "M7", [{"measure_id": 7}], [{"measure_id": "M7", "score": 100}]])
def test_malformed_input_returns_structured_error(invalid):
    assert "invalid_input" in codes(invalid)


def test_city_district_can_be_omitted_or_null():
    decisions = deepcopy(DEMO_PLAN)
    next(item for item in decisions if item["measure_id"] == "M12").pop("district")
    assert validate_plan(decisions).valid
