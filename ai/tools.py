"""JSON tools shared by the Supervisor and HTTP endpoints; no model calls here."""

from copy import deepcopy

from pydantic import ValidationError

from ai.comparison import compare_scenarios as _compare
from ai.data import (
    BUDGET, CRITICAL_THRESHOLD, DECISION_COUNT, DEMO_PLAN, DISTRICTS, HORIZON,
    INDICATORS, INCOMPATIBILITIES, MAX_PER_DIRECTION, MEASURES, SYNERGIES,
)
from ai.optimizer import search_scenarios
from ai.scoring import baseline_indicators, score_city
from ai.simulator import simulate
from ai.validator import validate_plan
from backend.schemas import Decision


def inspect_city_state() -> dict:
    """The public dataset and calculated baseline, never provider configuration."""
    return deepcopy({
        "budget": BUDGET,
        "horizon": HORIZON,
        "districts": [{"name": name, **district} for name, district in DISTRICTS.items()],
        "indicators": INDICATORS,
        "measures": [{"id": measure_id, **measure} for measure_id, measure in MEASURES.items()],
        "synergies": SYNERGIES,
        "baseline": score_city(baseline_indicators()).model_dump(mode="json"),
        "constraints": {
            "decision_count": DECISION_COUNT,
            "max_per_direction": MAX_PER_DIRECTION,
            "unique_measures": True,
            "critical_threshold": CRITICAL_THRESHOLD,
            "critical_comparison": "strictly_less_than",
            "incompatibilities": [
                {"measures": rule["measures"], "same_district_only": rule["same_district"], "reason": rule["reason"]}
                for rule in INCOMPATIBILITIES
            ],
            "synergies": SYNERGIES,
        },
        "demo_plan": DEMO_PLAN,
        "data_kind": "synthetic",
        "synthetic": True,
    })


def _parse_decisions(decisions) -> tuple[list[Decision], list[str]]:
    if not isinstance(decisions, list):
        return [], ["Решения должны быть списком"]
    parsed, errors = [], []
    for index, item in enumerate(decisions):
        try:
            parsed.append(Decision.model_validate(item))
        except ValidationError as exc:
            for error in exc.errors(include_input=False, include_url=False):
                field = ".".join(str(part) for part in error["loc"])
                errors.append(f"Решение {index + 1}, поле {field or 'decision'}: {error['msg']}")
    return parsed, errors


def validate_scenario(decisions: list[dict]) -> dict:
    parsed, errors = _parse_decisions(decisions)
    if errors:
        return {"valid": False, "errors": errors}
    return validate_plan(parsed).model_dump(mode="json")


def simulate_scenario(decisions: list[dict]) -> dict:
    parsed, errors = _parse_decisions(decisions)
    if errors:
        return {"valid": False, "errors": errors}
    return simulate(parsed).model_dump(mode="json")


def compare_scenarios(scenario_a: list[dict], scenario_b: list[dict]) -> dict:
    a, errors_a = _parse_decisions(scenario_a)
    b, errors_b = _parse_decisions(scenario_b)
    if errors_a or errors_b:
        return {"valid": False, "errors": {"scenario_a": errors_a, "scenario_b": errors_b}}
    return _compare(a, b)
