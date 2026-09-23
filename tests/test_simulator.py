"""Specification examples, boundaries and source fidelity of deterministic math."""

from copy import deepcopy
from itertools import permutations
from math import fsum
from pathlib import Path
import re

import pytest

from ai.data import CITY_DATA, DEMO_PLAN, DISTRICTS, INDICATORS, MEASURES, SYNERGIES
from ai.scoring import baseline_indicators, score_city
from ai.simulator import apply_effects, simulate
from backend.schemas import SimulationResult


def independent_score(values):
    """Reference formula using literal weights/shares from §3, not scorer helpers."""
    weights = (0.10, 0.10, 0.09, 0.11, 0.11, 0.11, 0.09, 0.09, 0.10, 0.10)
    codes = ("T1", "T2", "E1", "E2", "S1", "S2", "B1", "B2", "C1", "C2")
    shares = {"Есиль": 0.27, "Алматы": 0.24, "Сарыарка": 0.20, "Байконур": 0.13, "Нура": 0.16}
    districts = {district: fsum(row[code] * weight for code, weight in zip(codes, weights))
                 for district, row in values.items()}
    critical = sum(value < 40 for row in values.values() for value in row.values())
    return 0.7 * fsum(shares[d] * districts[d] for d in shares) + 0.3 * min(districts.values()) - critical


def test_baseline_matches_specification():
    values = baseline_indicators()
    result = score_city(values)
    assert result.score == pytest.approx(52.56, abs=0.005)
    assert result.score == pytest.approx(independent_score(values))
    assert result.average == pytest.approx(56.8624)
    assert result.minimum == pytest.approx(49.18)
    assert result.weakest_district == "Нура"
    assert result.critical_count == 2
    assert [(item.district, item.indicator, item.value) for item in result.critical_indicators] == [
        ("Нура", "S1", 38), ("Нура", "S2", 35),
    ]


def test_example_uses_independently_derived_final_indicators():
    result = simulate(DEMO_PLAN)
    assert isinstance(result, SimulationResult)
    expected = baseline_indicators()
    # The example's realized effects, computed independently from the source table.
    for row in expected.values():
        row["C2"] += 5 * 7 / 8
    expected["Нура"]["T1"] += 6 * 6 / 8
    expected["Нура"]["T2"] += 9 * 6 / 8
    expected["Нура"]["S1"] += 16 * 5 / 8
    expected["Нура"]["B1"] += 12 * 7 / 8 + 2
    expected["Нура"]["B2"] += 2 * 7 / 8
    expected["Сарыарка"]["E2"] += 14 * 5 / 8
    expected["Сарыарка"]["C1"] += 4 * 5 / 8
    actual = {district: {code: change.after for code, change in row.indicators.items()}
              for district, row in result.districts.items()}
    assert actual == expected
    assert result.budget.used == 93
    assert result.budget.remaining == 7
    assert result.score.after == pytest.approx(independent_score(expected))
    assert result.score.after == pytest.approx(55.61, abs=0.01)
    assert result.score.delta == pytest.approx(result.score.after - result.score.before)
    assert result.critical.after == 1
    assert len(result.critical.resolved) == 1
    assert result.strongest_improvements[0].district == "Нура"
    assert sum(result.score_components.values()) == pytest.approx(result.score.delta)


def test_changed_district_changes_score_and_critical_indicators():
    moved = deepcopy(DEMO_PLAN)
    next(item for item in moved if item["measure_id"] == "M1")["district"] = "Есиль"
    original, changed = simulate(DEMO_PLAN), simulate(moved)
    assert changed.score.after < original.score.after
    assert changed.budget == original.budget
    assert changed.critical.after == 1
    assert changed.critical.remaining[0].indicator == "S2"


def test_scope_lag_and_negative_effects():
    baseline = baseline_indicators()
    city = apply_effects([{"measure_id": "M2"}])
    for district in DISTRICTS:
        assert city[district]["T1"] == baseline[district]["T1"] + 3
        assert city[district]["B2"] == baseline[district]["B2"] + 2.25
    local = apply_effects([{"measure_id": "M11", "district": "Алматы"}])
    assert local["Алматы"]["T1"] == 38.25
    assert local["Алматы"]["B2"] == 62.5
    assert local["Нура"] == baseline["Нура"]
    assert score_city(local).critical_count == 3


@pytest.mark.parametrize("pair,indicator,expected_delta", [
    (("M1", "M2"), "T1", 4.5 + 3 + 2),
    (("M10", "M12"), "B1", 10.5 + 2),
    (("M5", "M6"), "E2", 8.75 + 1.5 + 2),
])
def test_all_synergies_are_fixed_and_local(pair, indicator, expected_delta):
    first, second = pair
    decisions = [{"measure_id": first, "district": "Нура"}, {"measure_id": second}]
    baseline = baseline_indicators()
    combined = apply_effects(decisions)
    city_only = apply_effects(decisions[1:])
    assert combined["Нура"][indicator] == baseline["Нура"][indicator] + expected_delta
    for district in DISTRICTS:
        if district != "Нура":
            assert combined[district] == city_only[district]
    assert apply_effects(decisions[::-1]) == combined


def test_critical_boundary_is_strictly_below_40():
    values = {district: {code: 40.0 for code in INDICATORS} for district in DISTRICTS}
    assert score_city(values).critical_count == 0
    values["Нура"]["S1"] = 39.999
    values["Нура"]["S2"] = 40.001
    result = score_city(values)
    assert result.critical_count == 1
    assert result.critical_indicators[0].indicator == "S1"


def test_clipping_happens_after_all_additions(monkeypatch):
    monkeypatch.setitem(DISTRICTS["Алматы"]["indicators"], "T1", 99)
    monkeypatch.setitem(DISTRICTS["Нура"]["indicators"], "T1", 0)
    monkeypatch.setitem(DISTRICTS["Нура"]["indicators"], "B1", 99)
    combined = apply_effects([
        {"measure_id": "M2"}, {"measure_id": "M11", "district": "Алматы"},
    ])
    # 99 + 3 - 1.75 = 100.25, then clip; clipping each measure would give 98.25.
    assert combined["Алматы"]["T1"] == 100
    assert apply_effects([{"measure_id": "M11", "district": "Нура"}])["Нура"]["T1"] == 0
    assert apply_effects([
        {"measure_id": "M10", "district": "Нура"}, {"measure_id": "M12"},
    ])["Нура"]["B1"] == 100


def test_every_order_produces_identical_complete_json():
    expected = simulate(DEMO_PLAN).model_dump(mode="json")
    for decisions in permutations(DEMO_PLAN):
        assert simulate(decisions).model_dump(mode="json") == expected


def test_simulation_does_not_mutate_input_or_source():
    source_before = deepcopy(CITY_DATA)
    decisions = deepcopy(DEMO_PLAN)
    decisions_before = deepcopy(decisions)
    result = simulate(decisions)
    result.decisions[0].district = "Алматы"
    result.districts["Нура"].indicators["S1"].after = -1
    assert decisions == decisions_before
    assert CITY_DATA == source_before
    baseline = baseline_indicators()
    baseline["Нура"]["S1"] = -1
    assert baseline_indicators()["Нура"]["S1"] == 38


def test_json_dataset_matches_all_source_table_numbers_and_effects():
    source_path = Path(__file__).resolve().parents[1] / "rules" / "Аким на 5 часов датасет.md"
    if not source_path.is_file():
        pytest.skip("Локальные исходники rules/ исключены из Git; дополнительная сверка доступна при их наличии.")
    source = source_path.read_text(encoding="utf-8")
    rows = [[cell.strip().strip("`") for cell in line.strip().strip("|").split("|")]
            for line in source.splitlines() if line.startswith("|")]
    source_districts = {row[0]: row for row in rows if row[0] in DISTRICTS}
    assert set(source_districts) == set(DISTRICTS)
    for name, district in DISTRICTS.items():
        row = source_districts[name]
        assert district["population_share"] == float(row[1])
        assert list(district["indicators"].values()) == list(map(int, row[2:12]))
    source_measures = {row[0]: row for row in rows if re.fullmatch(r"M\d+", row[0])}
    assert set(source_measures) == set(MEASURES)
    for measure_id, measure in MEASURES.items():
        row = source_measures[measure_id]
        assert measure["direction"] == row[1]
        assert measure["name"] == row[2]
        assert measure["scope"] == {"Район": "district", "Город": "city"}[row[3]]
        assert measure["cost"] == int(row[4])
        assert measure["lag"] == int(row[5])
        effects = {code: int(number) * (-1 if sign in ("−", "-") else 1)
                   for code, sign, number in re.findall(r"([TESBC]\d)\s*([+−-])\s*(\d+)", row[6])}
        assert measure["effects"] == effects
    weights = {row[0]: float(row[1]) for row in rows if row[0] in INDICATORS and len(row) == 2}
    assert {code: value["weight"] for code, value in INDICATORS.items()} == weights
    synergy_rows = [row for row in rows if re.fullmatch(r"M\d+ \+ M\d+", row[0])]
    assert len(synergy_rows) == len(SYNERGIES)
    for row, synergy in zip(synergy_rows, SYNERGIES):
        assert synergy["measures"] == row[0].split(" + ")
        match = re.fullmatch(r"(\w\d) \+(\d+) в районе (M\d+)", row[1])
        assert match is not None
        code, amount, district_measure = match.groups()
        assert synergy["effects"] == {code: int(amount)}
        assert synergy["district_measure"] == district_measure
