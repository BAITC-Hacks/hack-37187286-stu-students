"""Numerical scenario comparison; all deltas mean B minus A."""

from ai.data import DISTRICTS, INDICATORS
from ai.simulator import simulate
from ai.validator import validate_plan
from backend.schemas import Decision


def _difference(a: float, b: float) -> dict:
    return {"a": a, "b": b, "delta": b - a}


def compare_scenarios(scenario_a: list[Decision], scenario_b: list[Decision]) -> dict:
    """Reject either invalid input before calculating any scenario score."""
    validation_a = validate_plan(scenario_a)
    validation_b = validate_plan(scenario_b)
    if not validation_a.valid or not validation_b.valid:
        return {
            "valid": False,
            "errors": {
                "scenario_a": [error.model_dump(mode="json") for error in validation_a.errors],
                "scenario_b": [error.model_dump(mode="json") for error in validation_b.errors],
            },
        }

    a = simulate(scenario_a)
    b = simulate(scenario_b)
    districts = {
        name: _difference(a.districts[name].score.after, b.districts[name].score.after)
        for name in DISTRICTS
    }
    indicators = {
        name: {
            key: _difference(a.districts[name].indicators[key].after, b.districts[name].indicators[key].after)
            for key in INDICATORS
        }
        for name in DISTRICTS
    }
    changes = [
        {"district": name, "indicator": key, **change}
        for name, values in indicators.items()
        for key, change in values.items()
    ]
    return {
        "valid": True,
        "delta_direction": "B - A",
        "score": _difference(a.score.after, b.score.after),
        "budget": _difference(a.budget.used, b.budget.used),
        "districts": districts,
        "indicators": indicators,
        "critical": {
            "a": [item.model_dump(mode="json") for item in a.after.critical],
            "b": [item.model_dump(mode="json") for item in b.after.critical],
            "count_a": a.after.critical_count,
            "count_b": b.after.critical_count,
            "delta": b.after.critical_count - a.after.critical_count,
        },
        "weakest_district": {"a": a.after.weakest_district, "b": b.after.weakest_district},
        "minimum_district_score": _difference(a.after.minimum, b.after.minimum),
        "district_spread": _difference(
            max(a.after.district_scores.values()) - a.after.minimum,
            max(b.after.district_scores.values()) - b.after.minimum,
        ),
        "strengths_b": sorted((item for item in changes if item["delta"] > 0), key=lambda item: -item["delta"]),
        "weaknesses_b": sorted((item for item in changes if item["delta"] < 0), key=lambda item: item["delta"]),
        "scenarios": {"a": a.model_dump(mode="json"), "b": b.model_dump(mode="json")},
    }
