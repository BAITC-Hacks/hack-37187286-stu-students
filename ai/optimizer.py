"""Exhaustive scenario search over the fixed catalogue, without any LLM.

Invalid sets are discarded before placement and invalid placements before scoring.
District outcomes reuse the simulator's effect application and are cached by city
measures, local measures and district. Winners use the full canonical simulator.
"""

from __future__ import annotations

from collections import Counter
from copy import deepcopy
from functools import lru_cache
from heapq import heappush, heapreplace
from itertools import combinations, product
from math import fsum, isfinite

from ai.data import (
    BUDGET, CRITICAL_THRESHOLD, DECISION_COUNT, DISTRICTS, INDICATORS,
    INCOMPATIBILITIES, MAX_PER_DIRECTION, MEASURES,
)
from ai.scoring import baseline_indicators, score_city
from ai.simulator import apply_effects, simulate
from backend.schemas import Decision


OBJECTIVES = {
    "max_score": ["Максимальный Astana Quality of Life Score", "Меньшая стоимость"],
    "balanced": [
        "Максимальная оценка самого слабого района",
        "Минимальный разрыв между сильнейшим и слабейшим районами",
        "Максимальный Astana Quality of Life Score",
        "Меньшая стоимость",
    ],
    "focus_district": [
        "Максимальная оценка выбранного района",
        "Максимальный Astana Quality of Life Score",
        "Меньшая стоимость",
    ],
    "budget_efficiency": [
        "Максимальное отношение прироста Score к потраченному бюджету",
        "Максимальный Astana Quality of Life Score",
        "Меньшая стоимость",
    ],
}


@lru_cache(maxsize=65536)
def _district_outcome(city_ids: tuple[str, ...], local_ids: tuple[str, ...], district: str):
    """Canonical effect arithmetic includes fixed synergies and clipping."""
    decisions = [Decision(measure_id=key) for key in city_ids]
    decisions += [Decision(measure_id=key, district=district) for key in local_ids]
    values = apply_effects(decisions)[district]
    return (
        fsum(INDICATORS[key]["weight"] * value for key, value in values.items()),
        sum(value < CRITICAL_THRESHOLD for value in values.values()),
    )


def _rank(objective, scores, score, cost, baseline_score, focus_index):
    """Lexicographic objectives, with no internal rounding."""
    if objective == "balanced":
        values = (min(scores), -(max(scores) - min(scores)), score, -cost)
    elif objective == "focus_district":
        values = (scores[focus_index], score, -cost)
    elif objective == "budget_efficiency":
        values = ((score - baseline_score) / cost, score, -cost)
    else:
        values = (score, -cost)
    return values


@lru_cache(maxsize=32)
def _search(objective: str, budget_limit: float, focus_district: str | None, top_k: int):
    districts = tuple(DISTRICTS)
    shares = tuple(DISTRICTS[name]["population_share"] for name in districts)
    focus_index = districts.index(focus_district) if focus_district else None
    baseline_score = score_city(baseline_indicators()).score
    global_conflicts = [set(rule["measures"]) for rule in INCOMPATIBILITIES if not rule["same_district"]]
    local_conflicts = [tuple(rule["measures"]) for rule in INCOMPATIBILITIES if rule["same_district"]]
    best = []
    valid_candidates = valid_sets = pruned_sets = rejected_placements = 0

    # Numeric IDs and source district order are stable final tie breakers.
    ids = sorted(MEASURES, key=lambda key: int(key[1:]))
    for measure_ids in combinations(ids, DECISION_COUNT):
        selected = set(measure_ids)
        cost = sum(MEASURES[key]["cost"] for key in measure_ids)
        directions = Counter(MEASURES[key]["direction"] for key in measure_ids)
        if cost > budget_limit or max(directions.values()) > MAX_PER_DIRECTION or any(pair <= selected for pair in global_conflicts):
            pruned_sets += 1
            continue
        valid_sets += 1
        city_ids = tuple(key for key in measure_ids if MEASURES[key]["scope"] == "city")
        local_ids = tuple(key for key in measure_ids if MEASURES[key]["scope"] == "district")
        conflicting_positions = [(local_ids.index(a), local_ids.index(b)) for a, b in local_conflicts if a in selected and b in selected]
        # A local subset is evaluated once per district, not for every city plan.
        subsets = [tuple(key for index, key in enumerate(local_ids) if mask & (1 << index)) for mask in range(1 << len(local_ids))]
        outcomes = [[_district_outcome(city_ids, subset, district) for subset in subsets] for district in districts]

        for placement in product(range(len(districts)), repeat=len(local_ids)):
            if any(placement[a] == placement[b] for a, b in conflicting_positions):
                rejected_placements += 1
                continue
            masks = [0] * len(districts)
            for index, district_index in enumerate(placement):
                masks[district_index] |= 1 << index
            district_results = [outcomes[index][mask] for index, mask in enumerate(masks)]
            scores = tuple(result[0] for result in district_results)
            critical_count = sum(result[1] for result in district_results)
            average = fsum(share * district_score for share, district_score in zip(shares, scores))
            score = 0.7 * average + 0.3 * min(scores) - critical_count
            ranking = _rank(objective, scores, score, cost, baseline_score, focus_index)
            # Earlier canonical plans win ties; mutable dicts never enter the heap.
            entry = (ranking, -valid_candidates, measure_ids, placement)
            valid_candidates += 1
            if len(best) < top_k:
                heappush(best, entry)
            elif entry[:2] > best[0][:2]:
                heapreplace(best, entry)

    results, rankings = [], []
    for rank_number, (ranking, _, measure_ids, placement) in enumerate(sorted(best, reverse=True), 1):
        local_placement = iter(placement)
        decisions = [Decision(measure_id=key, district=districts[next(local_placement)] if MEASURES[key]["scope"] == "district" else None) for key in measure_ids]
        result = simulate(decisions)
        if not result.valid:
            raise RuntimeError("Optimizer generated a plan rejected by the canonical validator")
        canonical_ranking = _rank(
            objective, tuple(result.after.district_scores[name] for name in districts),
            result.score.after, result.budget.used, result.score.before, focus_index,
        )
        if canonical_ranking != ranking:
            raise RuntimeError("Optimizer ranking disagrees with the canonical simulator")
        results.append(result.model_dump(mode="json"))
        rankings.append({"rank": rank_number, "objective_value": ranking[0]})
    return {
        "valid": True,
        "objective": objective,
        "budget_limit": budget_limit,
        "focus_district": focus_district,
        "ranking": OBJECTIVES[objective],
        "tie_breaking": "При равных численных ключах: порядок ID мероприятий и районов в датасете",
        "search": {
            "exhaustive": True,
            "valid_candidates": valid_candidates,
            "valid_measure_sets": valid_sets,
            "pruned_measure_sets": pruned_sets,
            "rejected_placements": rejected_placements,
        },
        "results": results,
        "rankings": rankings,
        "message": None if results else "Нет допустимого набора ровно из пяти мероприятий в указанном бюджете.",
    }


def search_scenarios(objective: str, budget_limit: float = BUDGET, focus_district: str | None = None, top_k: int = 3) -> dict:
    """Find globally ranked valid plans; no candidate/time limit is imposed."""
    errors = []
    if not isinstance(objective, str) or objective not in OBJECTIVES:
        errors.append(f"Неизвестная цель. Допустимые цели: {', '.join(OBJECTIVES)}")
    if isinstance(budget_limit, bool) or not isinstance(budget_limit, (int, float)) or not isfinite(budget_limit) or not 0 <= budget_limit <= BUDGET:
        errors.append(f"Ограничение бюджета должно быть числом от 0 до {BUDGET}")
    if isinstance(top_k, bool) or not isinstance(top_k, int) or not 1 <= top_k <= 10:
        errors.append("top_k должен быть целым числом от 1 до 10")
    if focus_district is not None and (not isinstance(focus_district, str) or focus_district not in DISTRICTS):
        errors.append("Указан неизвестный район")
    if objective == "focus_district" and focus_district is None:
        errors.append("Для цели focus_district необходимо указать район")
    if errors:
        return {"valid": False, "errors": errors}
    return deepcopy(_search(objective, float(budget_limit), focus_district, top_k))


def clear_search_cache() -> None:
    """Invalidate caches when explicitly replacing the normally fixed dataset."""
    _search.cache_clear()
    _district_outcome.cache_clear()
