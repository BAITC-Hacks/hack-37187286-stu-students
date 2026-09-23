"""One bounded tool-calling supervisor. All arithmetic lives in deterministic tools."""
import asyncio
import json
import os
from pathlib import Path
from typing import Any, Protocol

import httpx
from pydantic import ValidationError

from ai import tools
from ai.grounding import GroundingError, render_grounded
from backend.agent_schemas import (
    AgentDraft, ChatRequest, ChatResponse, CompareRequest, SearchRequest, ToolEvidence,
)
from backend.schemas import Change, Plan, SimulationResult, StrictModel

MAX_ROUNDS = 6
MAX_TOOL_CALLS = 8
SYSTEM_PROMPT = Path(__file__).with_name("system_prompt.md").read_text(encoding="utf-8")


class EmptyArguments(StrictModel):
    pass


_ARGUMENT_MODELS = {
    "inspect_city_state": EmptyArguments,
    "validate_scenario": Plan,
    "simulate_scenario": Plan,
    "compare_scenarios": CompareRequest,
    "search_scenarios": SearchRequest,
}
_DESCRIPTIONS = {
    "inspect_city_state": "Исходное состояние синтетического города, каталог мероприятий, правила и демонстрационный план.",
    "validate_scenario": "Проверить выбранные решения. Возвращает все ошибки и бюджет, без расчёта Score.",
    "simulate_scenario": "Проверить план и детерминированно рассчитать Score, показатели, синергии и последствия.",
    "compare_scenarios": "Детерминированно сравнить два плана: Score, бюджет, районы, показатели и критические значения.",
    "search_scenarios": "Найти реальные допустимые сценарии по цели и бюджету. Все результаты рассчитаны кодом.",
}
TOOL_SCHEMAS = [
    {"type": "function", "function": {
        "name": name, "description": _DESCRIPTIONS[name], "parameters": model.model_json_schema(),
    }} for name, model in _ARGUMENT_MODELS.items()
]


class CompletionProvider(Protocol):
    async def complete(self, messages: list[dict[str, Any]], tool_choice: str) -> dict[str, Any]: ...


class ChatCompletionsProvider:
    def __init__(self, api_key: str, model: str, base_url: str):
        self.api_key, self.model, self.base_url = api_key, model, base_url.rstrip("/")

    async def complete(self, messages: list[dict[str, Any]], tool_choice: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=httpx.Timeout(25.0, connect=5.0)) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={"model": self.model, "messages": messages, "tools": TOOL_SCHEMAS,
                      "tool_choice": tool_choice, "response_format": {"type": "json_object"}},
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]


def is_configured() -> bool:
    return bool(os.getenv("LLM_API_KEY", "").strip() and os.getenv("LLM_MODEL", "").strip())


def execute_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """Whitelist + typed arguments, no eval, arbitrary imports, or model-written code."""
    model = _ARGUMENT_MODELS.get(name)
    if model is None:
        return {"valid": False, "errors": [{"code": "UNKNOWN_TOOL", "message": "Такого инструмента нет."}]}
    try:
        args = model.model_validate(arguments).model_dump(mode="json")
    except ValidationError:
        return {"valid": False, "errors": [{"code": "INVALID_TOOL_ARGUMENTS", "message": "Аргументы не соответствуют схеме инструмента. Проверьте обязательные поля и ограничения."}]}
    return getattr(tools, name)(**args)


def _compact(value: Any) -> Any:
    """Drop redundant full indicator matrices from the LLM context, not API evidence.

    Paths of retained fields remain identical, so references are still verifiable.
    """
    if isinstance(value, list):
        return [_compact(item) for item in value]
    if isinstance(value, dict):
        if value.get("valid") is True and "measure_contributions" in value:
            return {key: _compact(item) for key, item in value.items()
                    if key not in {"districts", "indicators", "district_scores"}}
        return {key: _compact(item) for key, item in value.items()}
    return value


def _score_from_evidence(evidence: list[ToolEvidence]) -> Change | None:
    for item in reversed(evidence):
        result = item.result
        if not result.get("valid", True):
            continue
        if item.tool == "simulate_scenario" and isinstance(result.get("score"), dict):
            return Change.model_validate(result["score"])
        if item.tool == "search_scenarios" and result.get("results"):
            return Change.model_validate(result["results"][0]["score"])
    return None


def _unavailable(message: str, evidence: list[ToolEvidence]) -> ChatResponse:
    return ChatResponse(available=False, summary="", message=message, evidence=evidence,
                        score=_score_from_evidence(evidence))


async def run_supervisor(
    request: ChatRequest,
    provider: CompletionProvider | None = None,
    *,
    analysis_result: SimulationResult | None = None,
) -> ChatResponse:
    # /analyze already ran the canonical engine. Lock this explanation to that
    # exact result; free tool selection remains available in advisor chat.
    evidence: list[ToolEvidence] = [] if analysis_result is None else [ToolEvidence(
        id="e1", tool="simulate_scenario",
        args={"decisions": [decision.model_dump() for decision in analysis_result.decisions]},
        result=analysis_result.model_dump(mode="json"),
    )]
    if provider is None:
        if not is_configured():
            return _unavailable("AI-советник не подключён. Вы можете рассчитать план, сравнить сценарии и выполнить поиск по цели без AI.", evidence)
        provider = ChatCompletionsProvider(
            os.environ["LLM_API_KEY"].strip(), os.environ["LLM_MODEL"].strip(),
            os.getenv("LLM_BASE_URL", "https://api.openai.com/v1"),
        )

    messages: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(item.model_dump() for item in request.history)
    context = {"request": request.message,
               "current_decisions": [d.model_dump() for d in request.decisions] if request.decisions is not None else None,
               "previous_decisions": [d.model_dump() for d in request.previous_decisions] if request.previous_decisions is not None else None}
    messages.append({"role": "user", "content": json.dumps(context, ensure_ascii=False)})
    if analysis_result is not None:
        item = evidence[0]
        messages.append({"role": "system", "content": "План уже рассчитан сервером. Объясни только результат следующего инструмента. Не выбирай и не анализируй другой план. Верни финальный JSON со ссылками на e1."})
        messages.append({"role": "assistant", "content": None, "tool_calls": [{
            "id": "validated_plan", "type": "function",
            "function": {"name": item.tool, "arguments": json.dumps(item.args, ensure_ascii=False)},
        }]})
        messages.append({"role": "tool", "tool_call_id": "validated_plan", "content": json.dumps(
            {"evidence_id": item.id, "result": _compact(item.result)}, ensure_ascii=False, allow_nan=False,
        )})
    repaired = False
    try:
        async with asyncio.timeout(75):
            for round_index in range(MAX_ROUNDS):
                choice = "none" if analysis_result is not None else ("required" if not evidence else ("none" if round_index == MAX_ROUNDS-1 else "auto"))
                message = await provider.complete(messages, choice)
                if not isinstance(message, dict) or not isinstance(message.get("content"), (str, type(None))):
                    raise ValueError("Malformed provider message")
                calls = message.get("tool_calls") or []
                if calls:
                    if analysis_result is not None:
                        return _unavailable("AI попытался изменить план при объяснении. Исходные расчёты сохранены; повторите запрос анализа.", evidence)
                    if not isinstance(calls, list) or len(evidence)+len(calls) > MAX_TOOL_CALLS:
                        return _unavailable("Достигнут лимит действий AI. Уточните одну цель и повторите запрос.", evidence)
                    messages.append({"role": "assistant", "content": message.get("content"), "tool_calls": calls})
                    for call in calls:
                        if not isinstance(call, dict) or not isinstance(call.get("function"), dict):
                            raise ValueError("Malformed tool call")
                        name = call["function"]["name"]
                        if not isinstance(name, str) or not isinstance(call.get("id"), str):
                            raise ValueError("Malformed tool name or id")
                        try:
                            arguments = json.loads(call["function"]["arguments"])
                            if not isinstance(arguments, dict):
                                raise ValueError("Expected object")
                        except (ValueError, TypeError):
                            arguments = {}
                            result = {"valid": False, "errors": [{"code": "INVALID_TOOL_JSON", "message": "Аргументы инструмента должны быть JSON-объектом."}]}
                        else:
                            # Search is CPU work. Keep the event loop responsive for other requests.
                            result = await asyncio.to_thread(execute_tool, name, arguments)
                        item = ToolEvidence(id=f"e{len(evidence)+1}", tool=name, args=arguments, result=result)
                        evidence.append(item)
                        messages.append({"role": "tool", "tool_call_id": call["id"], "content": json.dumps(
                            {"evidence_id": item.id, "result": _compact(result)}, ensure_ascii=False, allow_nan=False,
                        )})
                    continue

                try:
                    if not evidence:
                        raise GroundingError("Сначала получи факты через tools.")
                    draft = AgentDraft.model_validate_json(message.get("content") or "")
                    answer = render_grounded(draft, evidence)
                    return ChatResponse(available=True, **answer.model_dump(), evidence=evidence,
                                        score=_score_from_evidence(evidence))
                except (ValidationError, GroundingError) as error:
                    if repaired:
                        return _unavailable("AI-ответ не прошёл проверку ссылок на расчёты. Проверенные результаты доступны ниже; попробуйте повторить запрос.", evidence)
                    repaired = True
                    messages.append({"role": "assistant", "content": message.get("content") or ""})
                    messages.append({"role": "system", "content": "Исправь формат JSON и ссылки на числовые данные. " + (str(error) if isinstance(error, GroundingError) else "Используй только поля заданной схемы ответа.")})
    except (httpx.HTTPError, TimeoutError, ValueError, KeyError, IndexError, TypeError):
        return _unavailable("AI-объяснение временно недоступно. Проверенные результаты сохранены. Повторите запрос позже.", evidence)
    return _unavailable("Достигнут лимит шагов AI. Проверенные результаты доступны; уточните запрос.", evidence)
