"""Pure deterministic simulation and evidence for the UI and Supervisor."""

from collections.abc import Sequence

from ai.data import DISTRICTS, HORIZON, INDICATORS, MEASURES, SYNERGIES
from ai.scoring import baseline_indicators, score_city
from ai.validator import normalize_decisions, validate_plan
from backend.schemas import (
    AppliedSynergy, Change, CriticalSummary, Decision, DistrictResult,
    IndicatorChange, MeasureContribution, Plan, SimulationResult,
    ValidationResult, WeakestDistrict,
)


def _ordered(decisions: Plan | Sequence[Decision | dict]) -> list[Decision]:
    return sorted(normalize_decisions(decisions),
                  key=lambda decision: (int(decision.measure_id[1:]), decision.district or ""))


def realized_effects(measure_id: str) -> dict[str, float]:
    measure = MEASURES[measure_id]
    share = (HORIZON - measure["lag"]) / HORIZON
    return {indicator: effect * share for indicator, effect in measure["effects"].items()}


def _active_synergies(items: list[Decision]):
    selected = {item.measure_id: item.district for item in items}
    for synergy in SYNERGIES:
        if all(measure_id in selected for measure_id in synergy["measures"]):
            yield synergy, selected[synergy["district_measure"]]


def apply_effects(decisions: Plan | Sequence[Decision | dict]) -> dict[str, dict[str, float]]:
    """Apply effects to a copy of baseline; also supports partial internal plans.

    No business validation happens here: simulator validates complete plans before
    calling it. The optimizer uses this same arithmetic for partial combinations.
    All additions happen before clipping, including fixed synergy bonuses.
    """
    items = _ordered(decisions)
    values = baseline_indicators()
    for decision in items:
        measure = MEASURES[decision.measure_id]
        districts = DISTRICTS if measure["scope"] == "city" else [decision.district]
        effects = realized_effects(decision.measure_id)
        for district in districts:
            for indicator, effect in effects.items():
                values[district][indicator] += effect
    for synergy, district in _active_synergies(items):
        for indicator, bonus in synergy["effects"].items():
            values[district][indicator] += bonus
    return {
        district: {indicator: max(0.0, min(100.0, value))
                   for indicator, value in indicators.items()}
        for district, indicators in values.items()
    }


def _change(before: float, after: float) -> Change:
    return Change(before=before, after=after, delta=after - before)


def simulate(decisions: Plan | Sequence[Decision | dict]) -> SimulationResult | ValidationResult:
    """Validate first; an invalid scenario never receives a Score field."""
    validation = validate_plan(decisions)
    if not validation.valid:
        return validation

    items = [item.model_copy() for item in _ordered(decisions)]
    before_values = baseline_indicators()
    after_values = apply_effects(items)
    before = score_city(before_values)
    after = score_city(after_values)
    districts = {
        district: DistrictResult(
            score=_change(before.district_scores[district], after.district_scores[district]),
            indicators={indicator: _change(before_values[district][indicator], after_values[district][indicator])
                        for indicator in INDICATORS},
        )
        for district in DISTRICTS
    }
    indicator_changes = [
        IndicatorChange(district=district, indicator=indicator, **change.model_dump())
        for district, result in districts.items()
        for indicator, change in result.indicators.items()
        if change.delta != 0
    ]
    contributions = []
    for decision in items:
        measure = MEASURES[decision.measure_id]
        affected = DISTRICTS if measure["scope"] == "city" else [decision.district]
        contributions.append(MeasureContribution(
            measure_id=decision.measure_id,
            name=measure["name"],
            direction=measure["direction"],
            district=decision.district,
            cost=measure["cost"],
            lag=measure["lag"],
            effect_share=(HORIZON - measure["lag"]) / HORIZON,
            effects_by_district={district: realized_effects(decision.measure_id) for district in affected},
        ))
    remaining_keys = {(item.district, item.indicator) for item in after.critical_indicators}
    score = _change(before.score, after.score)
    return SimulationResult(
        budget=validation.budget,
        decisions=items,
        score=score,
        before=before,
        after=after,
        score_components={
            "city_average": 0.7 * (after.average - before.average),
            "weakest_district": 0.3 * (after.minimum - before.minimum),
            "critical_penalty": float(before.critical_count - after.critical_count),
        },
        districts=districts,
        indicator_changes=indicator_changes,
        critical=CriticalSummary(
            before=before.critical_count,
            after=after.critical_count,
            remaining=after.critical_indicators,
            before_indicators=before.critical_indicators,
            resolved=[item for item in before.critical_indicators
                      if (item.district, item.indicator) not in remaining_keys],
        ),
        weakest_district=WeakestDistrict(before=before.weakest_district, after=after.weakest_district),
        measure_contributions=contributions,
        synergies=[AppliedSynergy(measures=synergy["measures"], district=district, effects=synergy["effects"])
                   for synergy, district in _active_synergies(items)],
        strongest_improvements=sorted(
            (change for change in indicator_changes if change.delta > 0),
            key=lambda change: (-change.delta, change.district, change.indicator),
        )[:5],
        summary=[
            f"Score: {score.before:.2f} → {score.after:.2f} ({score.delta:+.2f}).",
            f"Бюджет: {validation.budget.used}/{validation.budget.total}.",
            f"Критических показателей: {before.critical_count} → {after.critical_count}.",
            f"Слабейший район после мер: {after.weakest_district}.",
        ],
    )


simulate_scenario = simulate
