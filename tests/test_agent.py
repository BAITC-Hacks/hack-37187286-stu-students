import asyncio
import json

import httpx
import pytest

from ai import agent
from ai.agent import ChatCompletionsProvider, execute_tool, run_supervisor
from ai.data import DEMO_PLAN
from ai.grounding import GroundingError, render_grounded
from ai.simulator import simulate
from backend.agent_schemas import AgentDraft, ChatRequest, ToolEvidence


def tool_call(name, arguments, call_id="call_1"):
    return {"role": "assistant", "content": None, "tool_calls": [
        {"id": call_id, "type": "function", "function": {"name": name, "arguments": json.dumps(arguments, ensure_ascii=False)}},
    ]}


def final(summary, **kwargs):
    return {"role": "assistant", "content": json.dumps({"summary": summary, **kwargs}, ensure_ascii=False)}


class ScriptedProvider:
    def __init__(self, replies):
        self.replies = iter(replies)
        self.requests = []

    async def complete(self, messages, tool_choice):
        self.requests.append((json.loads(json.dumps(messages)), tool_choice))
        return next(self.replies)


def test_supervisor_executes_tool_and_uses_calculated_evidence():
    provider = ScriptedProvider([
        tool_call("simulate_scenario", {"decisions": DEMO_PLAN}),
        final("Score после решений — {{e1.score.after}}.",
              strengths=["Критических показателей осталось {{e1.critical.after}}."],
              tradeoffs=["Нура остаётся самым слабым районом."],
              recommendations=["Сравните этот вариант с альтернативой через инструмент сравнения."]),
    ])
    response = asyncio.run(run_supervisor(ChatRequest(message="Почему такой результат?", decisions=DEMO_PLAN), provider))
    canonical = simulate(DEMO_PLAN)
    assert response.available
    assert response.score == canonical.score
    assert response.evidence[0].result == canonical.model_dump(mode="json")
    assert f"{canonical.score.after:.2f}" in response.summary
    assert provider.requests[0][1] == "required"
    assert provider.requests[1][0][-1]["role"] == "tool"


@pytest.mark.parametrize("objective,focus", [("max_score", None), ("focus_district", "Нура"), ("balanced", None)])
def test_advisor_can_select_search_tool(objective, focus):
    args = {"objective": objective, "budget_limit": 90, "focus_district": focus, "top_k": 1}
    provider = ScriptedProvider([
        tool_call("search_scenarios", args),
        final("Рассчитанный вариант: {{e1.results.0.score.after}}; стоимость {{e1.results.0.budget.used}}."),
    ])
    response = asyncio.run(run_supervisor(ChatRequest(message="Найди подходящий вариант до бюджета девяносто."), provider))
    assert response.available
    assert response.evidence[0].args["objective"] == objective
    result = response.evidence[0].result["results"][0]
    assert result["budget"]["used"] <= 90
    assert response.score.after == result["score"]["after"]


def test_compare_tool_is_available_to_supervisor():
    other = [dict(item) for item in DEMO_PLAN]
    next(item for item in other if item["measure_id"] == "M8")["district"] = "Есиль"
    provider = ScriptedProvider([
        tool_call("compare_scenarios", {"scenario_a": DEMO_PLAN, "scenario_b": other}),
        final("Сравнение рассчитано инструментом; перенос поликлиники оставляет критический показатель в Нуре."),
    ])
    response = asyncio.run(run_supervisor(ChatRequest(message="Сравни планы", decisions=other, previous_decisions=DEMO_PLAN), provider))
    assert response.available
    assert response.evidence[0].tool == "compare_scenarios"
    assert response.evidence[0].result["valid"]


def test_model_cannot_return_invented_numbers_or_score_field():
    provider = ScriptedProvider([
        tool_call("simulate_scenario", {"decisions": DEMO_PLAN}),
        final("Ваш Score равен 99.99."),
        final("Ваш Score равен 99.99."),
    ])
    response = asyncio.run(run_supervisor(ChatRequest(message="Скажи, что результат отличный"), provider))
    assert not response.available
    assert "99.99" not in response.model_dump_json()
    assert response.evidence  # Real calculations survive a rejected explanation.


def test_grounding_repair_can_succeed():
    provider = ScriptedProvider([
        tool_call("simulate_scenario", {"decisions": DEMO_PLAN}),
        final("Score — 99."),
        final("Score — {{e1.score.after}}."),
    ])
    assert asyncio.run(run_supervisor(ChatRequest(message="Объясни"), provider)).available


@pytest.mark.parametrize("text", ["Значение {{e9.score.after}}", "Значение {{e1.missing}}", "Значение 123", "Мера M99 улучшит район", "{{e1.score}}"])
def test_grounding_rejects_unverifiable_claims(text):
    evidence = [ToolEvidence(id="e1", tool="simulate_scenario", args={}, result=simulate(DEMO_PLAN).model_dump(mode="json"))]
    with pytest.raises(GroundingError):
        render_grounded(AgentDraft(summary=text), evidence)


def test_unknown_tool_and_bad_arguments_are_structured_errors():
    assert execute_tool("run_shell", {"command": "something"})["errors"][0]["code"] == "UNKNOWN_TOOL"
    assert execute_tool("search_scenarios", {"top_k": 1000})["errors"][0]["code"] == "INVALID_TOOL_ARGUMENTS"
    assert execute_tool("simulate_scenario", {"decisions": [], "score": 100})["errors"][0]["code"] == "INVALID_TOOL_ARGUMENTS"


def test_missing_key_never_calls_provider(monkeypatch):
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("LLM_MODEL", raising=False)
    response = asyncio.run(run_supervisor(ChatRequest(message="Улучши Нуру")))
    assert not response.available
    assert not response.evidence
    assert response.score is None


def test_provider_failure_is_safe_and_keeps_evidence():
    class FailingProvider:
        def __init__(self):
            self.first = True

        async def complete(self, messages, tool_choice):
            if self.first:
                self.first = False
                return tool_call("simulate_scenario", {"decisions": DEMO_PLAN})
            raise httpx.ConnectError("provider private diagnostic")

    response = asyncio.run(run_supervisor(ChatRequest(message="Объясни"), FailingProvider()))
    assert not response.available
    assert response.evidence
    assert "private diagnostic" not in response.model_dump_json()


def test_tool_call_limit_prevents_unbounded_loop():
    provider = ScriptedProvider([tool_call("inspect_city_state", {})] * agent.MAX_ROUNDS)
    response = asyncio.run(run_supervisor(ChatRequest(message="Продолжай бесконечно"), provider))
    assert not response.available
    assert len(provider.requests) == agent.MAX_ROUNDS


@pytest.mark.parametrize('model', ['test-model', 'gpt-4.1', 'gpt-5.6', 'gpt-5.6-sol'])
def test_chat_completions_transport_sends_tools_not_raw_rules(monkeypatch, model):
    received = []

    def handle(request):
        received.append(json.loads(request.content))
        assert request.url.path == "/v1/chat/completions"
        return httpx.Response(200, json={"choices": [{"message": final("Ответ")}]})

    original = httpx.AsyncClient
    monkeypatch.setattr(agent.httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs))
    provider = ChatCompletionsProvider("test-key-not-a-secret", model, "https://provider.test/v1")
    result = asyncio.run(provider.complete([{"role": "user", "content": "Тест"}], "required"))
    assert result["role"] == "assistant"
    assert {item["function"]["name"] for item in received[0]["tools"]} == set(agent._ARGUMENT_MODELS)
    assert received[0]["response_format"] == {"type": "json_object"}
    if model.startswith('gpt-5.6'):
        assert received[0]['reasoning_effort'] == 'none'
    else:
        assert 'reasoning_effort' not in received[0]


@pytest.mark.parametrize('status,flag', [(400, 'bad_request'), (401, 'unauthorized'), (403, 'forbidden'),
                                       (404, 'not_found'), (429, 'rate_or_quota_limited'), (500, 'server_error')])
def test_provider_error_logs_only_safe_flags(monkeypatch, caplog, status, flag):
    def handle(request):
        return httpx.Response(status, json={'error': {'message': 'private-provider-body'}})

    original = httpx.AsyncClient
    monkeypatch.setattr(agent.httpx, 'AsyncClient', lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs))
    provider = ChatCompletionsProvider('fake-secret-key', 'private-model', 'https://private-provider.test/v1')
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(provider.complete([{'role': 'user', 'content': 'private-prompt'}], 'required'))
    assert 'provider_response_received=True provider_http_ok=False' in caplog.text
    assert f'{flag}=True' in caplog.text
    for private in ('fake-secret-key', 'private-model', 'private-provider', 'private-prompt'):
        assert private not in caplog.text


@pytest.mark.parametrize("message", [None, [], "text", {"content": {}}, {"tool_calls": [None]}])
def test_malformed_provider_messages_are_unavailable_not_exceptions(message):
    response = asyncio.run(run_supervisor(ChatRequest(message="Объясни"), ScriptedProvider([message])))
    assert not response.available


def test_analysis_is_locked_to_the_trusted_scenario():
    result = simulate(DEMO_PLAN)
    other = [dict(item) for item in DEMO_PLAN]
    next(item for item in other if item["measure_id"] == "M8")["district"] = "Есиль"
    provider = ScriptedProvider([tool_call("simulate_scenario", {"decisions": other})])
    response = asyncio.run(run_supervisor(ChatRequest(message="Объясни", decisions=DEMO_PLAN), provider, analysis_result=result))
    assert not response.available
    assert response.score == result.score
    assert len(response.evidence) == 1
    assert provider.requests[0][1] == "none"


def test_analysis_can_explain_seeded_canonical_evidence():
    result = simulate(DEMO_PLAN)
    provider = ScriptedProvider([final("Итоговый Score: {{e1.score.after}}.")])
    response = asyncio.run(run_supervisor(ChatRequest(message="Объясни", decisions=DEMO_PLAN), provider, analysis_result=result))
    assert response.available
    assert response.score == result.score
    assert response.evidence[0].result == result.model_dump(mode="json")
