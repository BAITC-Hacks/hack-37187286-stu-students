"""Pure scoring of a complete city state; no decisions and no LLM required."""

from math import fsum

from ai.data import CRITICAL_THRESHOLD, DISTRICTS, INDICATORS
from backend.schemas import CityScore, CriticalIndicator


def baseline_indicators() -> dict[str, dict[str, float]]:
    """Return a fresh copy, so running a scenario never changes the baseline."""
    return {
        district: {code: float(value) for code, value in data["indicators"].items()}
        for district, data in DISTRICTS.items()
    }


def score_city(values: dict[str, dict[str, float]]) -> CityScore:
    """Score already clipped indicators with full precision (no display rounding)."""
    district_scores = {
        district: fsum(values[district][code] * indicator["weight"]
                       for code, indicator in INDICATORS.items())
        for district in DISTRICTS
    }
    average = fsum(
        DISTRICTS[district]["population_share"] * result
        for district, result in district_scores.items()
    )
    weakest = min(district_scores, key=district_scores.__getitem__)
    minimum = district_scores[weakest]
    critical = [
        CriticalIndicator(district=district, indicator=code, value=values[district][code])
        for district in DISTRICTS
        for code in INDICATORS
        if values[district][code] < CRITICAL_THRESHOLD
    ]
    return CityScore(
        score=0.7 * average + 0.3 * minimum - len(critical),
        district_scores=district_scores,
        average=average,
        minimum=minimum,
        weakest_district=weakest,
        critical_count=len(critical),
        critical=critical,
    )
