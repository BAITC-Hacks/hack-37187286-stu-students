"""Reproduce the five requested examples without an API key: python -m scripts.demo."""
import json
import sys
from copy import deepcopy

from ai.data import DEMO_PLAN
from ai.tools import compare_scenarios, search_scenarios, simulate_scenario


def brief(result):
    return {**{key: result[key] for key in ("decisions", "budget", "score", "critical", "weakest_district")},
            "district_scores": result["after"]["district_scores"]}


def examples():
    manual = simulate_scenario(DEMO_PLAN)
    invalid = deepcopy(DEMO_PLAN)
    next(item for item in invalid if item["measure_id"] == "M12").update(measure_id="M13", district="Нура")
    search = search_scenarios("max_score", budget_limit=90, top_k=3)
    focus = search_scenarios("focus_district", focus_district="Нура", top_k=3)
    moved = deepcopy(DEMO_PLAN)
    next(item for item in moved if item["measure_id"] == "M8")["district"] = "Есиль"
    comparison = compare_scenarios(DEMO_PLAN, moved)
    return {
        "A_manual": brief(manual),
        "B_invalid": simulate_scenario(invalid),
        "C_best_under_90": {
            "chat_request": {"message": "Найди лучший сценарий до бюджета 90"},
            "deterministic_tool": "search_scenarios",
            "search": search["search"], "results": [brief(item) for item in search["results"]],
        },
        "D_improve_nura": {
            "chat_request": {"message": "Улучши Нуру"},
            "deterministic_tool": "search_scenarios",
            "ranking": focus["ranking"], "results": [brief(item) for item in focus["results"]],
        },
        "E_comparison": {key: comparison[key] for key in ("score", "budget", "districts", "critical", "weakest_district")},
        "note": "Числа получены из tools. Естественно-языковый выбор tools и объяснение требуют настроенного LLM API; этот скрипт не имитирует ответ модели.",
    }


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(examples(), ensure_ascii=False, indent=2, allow_nan=False))
