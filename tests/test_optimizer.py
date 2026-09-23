"""Optimizer guarantees, including an independent complete low-budget oracle."""

from itertools import combinations, product
from math import fsum
from random import Random

import pytest

from ai.data import DISTRICTS, MEASURES
from ai.optimizer import _district_outcome, search_scenarios
from ai.simulator import simulate
from ai.validator import validate_plan
from backend.schemas import Decision


def _objective_key(result, objective, focus="Нура"):
    scores = result["after"]["district_scores"]
    score = result["score"]["after"]
    cost = result["budget"]["used"]
    if objective == "balanced":
        return (min(scores.values()), -(max(scores.values()) - min(scores.values())), score, -cost)
    if objective == "focus_district":
        return (scores[focus], score, -cost)
    if objective == "budget_efficiency":
        return (result["score"]["delta"] / cost, score, -cost)
    return (score, -cost)


@pytest.fixture(scope="module")
def brute_force_low_budget():
    # Independently enumerate every placement and ask the public validator and
    # full simulator; this oracle does not call optimizer internals to prune.
    results = []
    for ids in combinations(MEASURES, 5):
        if sum(MEASURES[key]["cost"] for key in ids) > 61:
            continue
        options = [tuple(DISTRICTS) if MEASURES[key]["scope"] == "district" else (None,) for key in ids]
        for placement in product(*options):
            decisions = [Decision(measure_id=key, district=district) for key, district in zip(ids, placement)]
            if validate_plan(decisions).valid:
                results.append(simulate(decisions).model_dump(mode="json"))
    assert results
    return results


@pytest.mark.parametrize("objective", ["max_score", "balanced", "focus_district", "budget_efficiency"])
def test_all_objectives_match_exhaustive_independent_oracle(objective, brute_force_low_budget):
    result = search_scenarios(objective, budget_limit=61, focus_district="Нура" if objective == "focus_district" else None)
    assert result["valid"]
    assert result["search"]["exhaustive"]
    assert result["search"]["valid_candidates"] == len(brute_force_low_budget)
    oracle = sorted(brute_force_low_budget, key=lambda item: _objective_key(item, objective), reverse=True)[:3]
    assert len(result["results"]) == 3
    for actual, expected in zip(result["results"], oracle):
        assert _objective_key(actual, objective) == pytest.approx(_objective_key(expected, objective))
        assert actual["objective_value"] == pytest.approx(_objective_key(actual, objective)[0])
        assert validate_plan(actual["decisions"]).valid


def test_full_budget_and_restricted_budget_only_return_valid_ranked_plans():
    best_scores = []
    for budget in (90, 100):
        result = search_scenarios("max_score", budget_limit=budget)
        assert result["search"]["pruned_measure_sets"] > 0
        assert result["search"]["rejected_placements"] > 0
        keys = [_objective_key(plan, "max_score") for plan in result["results"]]
        assert keys == sorted(keys, reverse=True)
        for plan in result["results"]:
            assert len(plan["decisions"]) == 5
            assert plan["budget"]["used"] <= budget
            assert validate_plan(plan["decisions"]).valid
            canonical = simulate(plan["decisions"]).model_dump(mode="json")
            assert plan["score"] == canonical["score"]
            assert plan["districts"] == canonical["districts"]
        best_scores.append(result["results"][0]["score"]["after"])
    assert best_scores[1] >= best_scores[0]


def test_cached_district_scoring_agrees_with_full_simulator_across_catalogue():
    random = Random(2026)
    checked = 0
    for _ in range(800):
        ids = random.sample(list(MEASURES), 5)
        decisions = [Decision(measure_id=key, district=random.choice(tuple(DISTRICTS)) if MEASURES[key]["scope"] == "district" else None) for key in ids]
        if not validate_plan(decisions).valid:
            continue
        result = simulate(decisions)
        city_ids = tuple(sorted(item.measure_id for item in decisions if item.district is None))
        scores, critical_count = {}, 0
        for district in DISTRICTS:
            local_ids = tuple(sorted(item.measure_id for item in decisions if item.district == district))
            score, critical = _district_outcome(city_ids, local_ids, district)
            scores[district] = score
            critical_count += critical
        average = fsum(DISTRICTS[name]["population_share"] * score for name, score in scores.items())
        assert scores == pytest.approx(result.after.district_scores)
        assert critical_count == result.after.critical_count
        assert 0.7 * average + 0.3 * min(scores.values()) - critical_count == pytest.approx(result.score.after)
        checked += 1
    assert checked >= 100


@pytest.mark.parametrize("kwargs", [
    {"objective": "unknown"}, {"objective": []}, {"objective": "focus_district"},
    {"focus_district": "Неизвестный район"}, {"focus_district": []},
    {"budget_limit": -1}, {"budget_limit": 101}, {"budget_limit": float("nan")},
    {"budget_limit": float("inf")}, {"budget_limit": "90"}, {"budget_limit": True},
    {"top_k": 0}, {"top_k": 11}, {"top_k": 1.5}, {"top_k": True},
])
def test_invalid_search_arguments_do_not_produce_scores(kwargs):
    result = search_scenarios(**{"objective": "max_score", **kwargs})
    assert not result["valid"]
    assert result["errors"]
    assert "results" not in result


def test_no_feasible_plan_is_explicit_and_cached_results_cannot_be_mutated():
    empty = search_scenarios("max_score", budget_limit=60)
    assert empty["valid"] and empty["results"] == []
    assert empty["search"]["exhaustive"] and empty["search"]["valid_candidates"] == 0
    assert empty["message"]
    first = search_scenarios("max_score", budget_limit=61)
    original = first["results"][0]["score"]["after"]
    first["results"][0]["score"]["after"] = -999
    second = search_scenarios("max_score", budget_limit=61)
    assert second["results"][0]["score"]["after"] == original
    assert second == search_scenarios("max_score", budget_limit=61)
