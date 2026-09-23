"""Typed contracts for the deterministic core, HTTP API and agent tools."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class Decision(StrictModel):
    measure_id: str = Field(min_length=1, max_length=32)
    district: str | None = Field(default=None, max_length=80)


class Plan(StrictModel):
    # Length is a business rule: the validator must return its concrete reason.
    decisions: list[Decision] = Field(max_length=100)


class Budget(StrictModel):
    total: int
    used: int
    remaining: int


class ValidationError(StrictModel):
    code: str
    message: str


class ValidationResult(StrictModel):
    valid: bool
    errors: list[ValidationError]
    budget: Budget


class Change(StrictModel):
    before: float
    after: float
    delta: float


class CriticalIndicator(StrictModel):
    district: str
    indicator: str
    value: float


class CityScore(StrictModel):
    score: float
    district_scores: dict[str, float]
    average: float
    minimum: float
    weakest_district: str
    critical_count: int
    critical: list[CriticalIndicator]

    @property
    def critical_indicators(self) -> list[CriticalIndicator]:
        """Python compatibility name; the JSON contract uses `critical`."""
        return self.critical


class DistrictResult(StrictModel):
    score: Change
    indicators: dict[str, Change]


class IndicatorChange(Change):
    district: str
    indicator: str


class CriticalSummary(StrictModel):
    before: int
    after: int
    remaining: list[CriticalIndicator]
    resolved: list[CriticalIndicator]
    before_indicators: list[CriticalIndicator]


class WeakestDistrict(StrictModel):
    before: str
    after: str


class MeasureContribution(StrictModel):
    measure_id: str
    name: str
    direction: str
    district: str | None
    cost: int
    lag: int
    effect_share: float
    # These are realized additive effects before clipping, not marginal Score.
    effects_by_district: dict[str, dict[str, float]]


class AppliedSynergy(StrictModel):
    measures: list[str]
    district: str
    effects: dict[str, float]


class SimulationResult(StrictModel):
    valid: Literal[True] = True
    budget: Budget
    decisions: list[Decision]
    score: Change
    before: CityScore
    after: CityScore
    # Deltas of the three weighted terms in the final Score, computed in Python.
    score_components: dict[str, float]
    districts: dict[str, DistrictResult]
    indicator_changes: list[IndicatorChange]
    critical: CriticalSummary
    weakest_district: WeakestDistrict
    measure_contributions: list[MeasureContribution]
    synergies: list[AppliedSynergy]
    strongest_improvements: list[IndicatorChange]
    summary: list[str]
