"""Opt-in live evaluation. Run directly; never collected by pytest.

Uses the root .env without overriding process variables. Real API requests may
incur charges. No response prose is scored; checks cover routing and evidence.
"""
import argparse
import asyncio
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
from pydantic import ValidationError

from ai.agent import ChatCompletionsProvider, is_configured, run_supervisor
from ai.data import DEMO_PLAN
from ai.grounding import GroundingError, render_grounded
from backend.agent_schemas import AgentDraft, ChatRequest, CompareRequest, SearchRequest

CASES = [
    {"id": "inspect", "prompt": "Что сейчас самое слабое в городе?", "tools": ["inspect_city_state"]},
    {"id": "budget", "prompt": "Найди лучший сценарий до бюджета 90", "tools": ["search_scenarios"],
     "search": {"objective": "max_score", "budget_limit": 90}},
    {"id": "nura", "prompt": "Как лучше улучшить Нуру?", "tools": ["search_scenarios"],
     "search": {"objective": "focus_district", "focus_district": "Нура"}},
    {"id": "balanced", "prompt": "Предложи более сбалансированный вариант", "tools": ["search_scenarios"],
     "search": {"objective": "balanced"}},
    {"id": "search_compare", "prompt": "Найди более сбалансированный вариант и сравни его с моим текущим планом",
     "tools": ["search_scenarios", "compare_scenarios"], "search": {"objective": "balanced"},
     "decisions": DEMO_PLAN},
]


class TraceProvider:
    """Retain only the last draft to recheck grounding; never print provider bodies."""
    def __init__(self, provider):
        self.provider = provider
        self.last_draft = None

    async def complete(self, messages, tool_choice):
        reply = await self.provider.complete(messages, tool_choice)
        if isinstance(reply, dict) and not reply.get("tool_calls"):
            self.last_draft = reply.get("content")
        return reply


def same_plan(a, b):
    try:
        parsed = CompareRequest(scenario_a=a, scenario_b=b)
    except ValidationError:
        return False
    return (sorted(item.model_dump_json() for item in parsed.scenario_a)
            == sorted(item.model_dump_json() for item in parsed.scenario_b))


def evaluate(case, response, raw_draft):
    evidence = response.evidence
    called = [item.tool for item in evidence]
    successful = [item for item in evidence if item.result.get("valid", True) is True]
    expected = iter(case["tools"])
    pending = next(expected, None)
    for item in successful:
        if item.tool == pending:
            pending = next(expected, None)
    tools_ok = pending is None and set(called) <= set(case["tools"]) | {"inspect_city_state"}
    arguments_ok = True
    if "search" in case:
        searches = [item for item in successful if item.tool == "search_scenarios"]
        try:
            arguments_ok = bool(searches) and all(
                all(SearchRequest.model_validate(item.args).model_dump()[key] == value
                    for key, value in case["search"].items()) for item in searches
            )
        except ValidationError:
            arguments_ok = False
    if "compare_scenarios" in case["tools"]:
        found = []
        matched = False
        for item in successful:
            if item.tool == "search_scenarios":
                found.extend(result["decisions"] for result in item.result.get("results", []))
            if item.tool == "compare_scenarios":
                matched |= (same_plan(item.args.get("scenario_a"), case["decisions"])
                            and any(same_plan(item.args.get("scenario_b"), plan) for plan in found))
        arguments_ok &= matched
    grounding_passed = False
    if response.available and raw_draft:
        try:
            rendered = render_grounded(AgentDraft.model_validate_json(raw_draft), evidence)
            grounding_passed = rendered.model_dump() == response.model_dump(include=set(AgentDraft.model_fields))
        except (ValidationError, GroundingError):
            pass
    checks = {"tools_ok": tools_ok, "arguments_ok": arguments_ok,
              "has_evidence": bool(evidence), "grounding_passed": grounding_passed}
    return {"case": case["id"], "prompt": case["prompt"], "available": response.available,
            "tools_called": called, "arguments": [item.args for item in evidence], **checks,
            "passed": response.available and all(checks.values())}


async def run_cases(cases):
    passed = True
    key = os.environ["LLM_API_KEY"].strip()
    for case in cases:
        provider = TraceProvider(ChatCompletionsProvider(
            key, os.environ["LLM_MODEL"].strip(), os.getenv("LLM_BASE_URL", "https://api.openai.com/v1"),
        ))
        try:
            response = await run_supervisor(ChatRequest(message=case["prompt"], decisions=case.get("decisions")), provider)
            report = evaluate(case, response, provider.last_draft)
        except Exception:
            # A diagnostic failure must not expose credentials through exceptions.
            report = {"case": case["id"], "prompt": case["prompt"], "available": False,
                      "tools_called": [], "arguments": [], "grounding_passed": False,
                      "evaluation_error": True, "passed": False}
        print(json.dumps(report, ensure_ascii=False).replace(key, "[REDACTED]"), flush=True)
        passed &= report["passed"]
    return 0 if passed else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", choices=[case["id"] for case in CASES], help="Run only one case")
    args = parser.parse_args()
    load_dotenv(ROOT / ".env", override=False)
    if not is_configured():
        print("SKIP: set LLM_API_KEY and LLM_MODEL in the environment or root .env.")
        return 0
    return asyncio.run(run_cases([case for case in CASES if not args.case or case["id"] == args.case]))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
