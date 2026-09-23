"""All business constraints of the case, with concrete machine-readable errors."""

from collections import Counter
from collections.abc import Sequence

from pydantic import ValidationError as PydanticValidationError

from ai.data import (
    BUDGET, DECISION_COUNT, DISTRICTS, INCOMPATIBILITIES, MAX_PER_DIRECTION, MEASURES,
)
from backend.schemas import Budget, Decision, Plan, ValidationError, ValidationResult


def normalize_decisions(decisions: Plan | Sequence[Decision | dict]) -> list[Decision]:
    if isinstance(decisions, Plan):
        return list(decisions.decisions)
    if not isinstance(decisions, (list, tuple)):
        raise TypeError("Ожидается список решений.")
    return [item if isinstance(item, Decision) else Decision.model_validate(item)
            for item in decisions]


def validate_plan(decisions: Plan | Sequence[Decision | dict]) -> ValidationResult:
    errors: list[ValidationError] = []

    def error(code: str, message: str) -> None:
        errors.append(ValidationError(code=code, message=message))

    try:
        items = normalize_decisions(decisions)
    except (PydanticValidationError, TypeError) as exc:
        if isinstance(exc, PydanticValidationError):
            details = "; ".join(
                f"{'.'.join(map(str, item['loc']))}: {item['msg']}"
                for item in exc.errors(include_input=False, include_url=False)
            )
        else:
            details = str(exc)
        return ValidationResult(
            valid=False,
            errors=[ValidationError(code="invalid_input", message=f"Неверный формат решения: {details}")],
            budget=Budget(total=BUDGET, used=0, remaining=BUDGET),
        )

    if len(items) != DECISION_COUNT:
        error("decision_count", f"Нужно ровно {DECISION_COUNT} мероприятий; выбрано {len(items)}.")

    counts = Counter(item.measure_id for item in items)
    for measure_id, count in sorted(counts.items()):
        if count > 1:
            error("duplicate_measure", f"Мероприятие {measure_id} выбрано {count} раз; повтор запрещён.")

    directions: Counter = Counter()
    used = 0
    for item in sorted(items, key=lambda value: (value.measure_id, value.district or "")):
        measure = MEASURES.get(item.measure_id)
        if measure is None:
            error("unknown_measure", f"Неизвестное мероприятие: {item.measure_id}.")
            continue
        used += measure["cost"]
        directions[measure["direction"]] += 1
        if measure["scope"] == "district":
            if item.district is None:
                error("district_required", f"Для {item.measure_id} необходимо выбрать район.")
            elif item.district not in DISTRICTS:
                error("unknown_district", f"Для {item.measure_id} указан неизвестный район: {item.district}.")
        elif item.district is not None:
            error("city_district_forbidden", f"Мера {item.measure_id} действует на весь город: район должен быть null.")

    for direction, count in sorted(directions.items()):
        if count > MAX_PER_DIRECTION:
            error("direction_limit", f"Выбрано {count} мероприятия направления «{direction}», максимум разрешено {MAX_PER_DIRECTION}.")

    if used > BUDGET:
        error("budget_exceeded", f"Превышен бюджет: {used} > {BUDGET}.")

    for rule in INCOMPATIBILITIES:
        first, second = rule["measures"]
        first_items = [item for item in items if item.measure_id == first]
        second_items = [item for item in items if item.measure_id == second]
        if not first_items or not second_items:
            continue
        if rule["same_district"]:
            overlap = sorted({item.district for item in first_items if item.district in DISTRICTS}
                             & {item.district for item in second_items if item.district in DISTRICTS})
            for district in overlap:
                error("incompatible_measures", f"Мероприятия {first} и {second} нельзя применять в одном районе: {district}. {rule['reason']}")
        else:
            error("incompatible_measures", f"Мероприятия {first} и {second} несовместимы независимо от районов. {rule['reason']}")

    return ValidationResult(
        valid=not errors,
        errors=errors,
        budget=Budget(total=BUDGET, used=used, remaining=BUDGET - used),
    )


validate_scenario = validate_plan
