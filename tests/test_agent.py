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
        reply = next(self.replies)
        return reply(messages) if callable(reply) else reply


def compare_found_plan(messages):
    """Build a dependent call from the actual tool response, not a preselected plan."""
    search = next(json.loads(item['content']) for item in reversed(messages) if item['role'] == 'tool')
    return tool_call('compare_scenarios', {
        'scenario_a': DEMO_PLAN, 'scenario_b': search['result']['results'][0]['decisions'],
    }, 'compare_found')


@pytest.mark.parametrize('objective', ['max_score', 'balanced'])
def test_search_then_compare_uses_real_result_and_grounded_deltas(monkeypatch, objective):
    original = agent.tools.compare_scenarios
    calculated = []

    def compare(**kwargs):
        result = original(**kwargs)
        calculated.append(result)
        return result

    monkeypatch.setattr(agent.tools, 'compare_scenarios', compare)
    provider = ScriptedProvider([
        tool_call('search_scenarios', {'objective': objective, 'budget_limit': 90, 'top_k': 1}),
        compare_found_plan,
        final('Изменение Score: {{e2.score.delta}}.',
              calculated_results=['Стоимость варианта: {{e1.results.0.budget.used}}.',
                                  'Разница расходов: {{e2.budget.delta}}.']),
    ])
    response = asyncio.run(run_supervisor(ChatRequest(message='Найди вариант и сравни с моим.', decisions=DEMO_PLAN), provider))
    assert response.available
    search, comparison = response.evidence
    assert [item.tool for item in response.evidence] == ['search_scenarios', 'compare_scenarios']
    assert comparison.args['scenario_a'] == DEMO_PLAN
    assert comparison.args['scenario_b'] == search.result['results'][0]['decisions']
    assert calculated == [comparison.result]
    assert comparison.result['valid']
    assert response.summary == f"Изменение Score: {comparison.result['score']['delta']:.2f}."
    assert response.calculated_results == [f"Стоимость варианта: {search.result['results'][0]['budget']['used']:.0f}.",
                                           f"Разница расходов: {comparison.result['budget']['delta']:.0f}."]


@pytest.mark.parametrize('current', [None, []])
def test_missing_current_plan_cannot_be_invented_for_comparison(monkeypatch, current):
    def forbidden(**kwargs):
        pytest.fail('Invented current plan reached the deterministic comparison')

    monkeypatch.setattr(agent.tools, 'compare_scenarios', forbidden)
    provider = ScriptedProvider([
        tool_call('inspect_city_state', {}),  # Even a real demo plan is not the user's plan.
        tool_call('compare_scenarios', {'scenario_a': DEMO_PLAN, 'scenario_b': DEMO_PLAN}),
        final('Для сравнения сначала выберите текущий сценарий.'),
    ])
    response = asyncio.run(run_supervisor(ChatRequest(message='Сравни с моим текущим планом.', decisions=current), provider))
    assert response.available
    assert response.evidence[-1].result['errors'][0]['code'] == 'MISSING_CURRENT_PLAN'
    assert 'score' not in response.evidence[-1].result


def test_missing_previous_plan_is_not_replaced_by_a_made_up_plan(monkeypatch):
    other = [dict(item) for item in DEMO_PLAN]
    next(item for item in other if item['measure_id'] == 'M8')['district'] = 'Есиль'
    monkeypatch.setattr(agent.tools, 'compare_scenarios', lambda **kwargs: pytest.fail('Unsourced comparison'))
    provider = ScriptedProvider([
        tool_call('compare_scenarios', {'scenario_a': DEMO_PLAN, 'scenario_b': other}),
        final('Передайте предыдущий план для сравнения.'),
    ])
    response = asyncio.run(run_supervisor(ChatRequest(message='Сравни текущий и предыдущий планы.', decisions=DEMO_PLAN), provider))
    assert response.available
    assert response.evidence[0].result['errors'][0]['code'] == 'UNSOURCED_COMPARISON'


def test_premature_better_than_current_claim_requires_comparison():
    provider = ScriptedProvider([
        tool_call('search_scenarios', {'budget_limit': 90, 'top_k': 1}),
        final('Найденный план лучше текущего.'),  # No digits: numeric grounding alone cannot catch this.
        compare_found_plan,
        final('Рассчитанная разница Score: {{e2.score.delta}}.'),
    ])
    response = asyncio.run(run_supervisor(ChatRequest(message='Найди лучший план.', decisions=DEMO_PLAN), provider))
    assert response.available
    assert len(provider.requests) == 4
    assert 'compare_scenarios' in provider.requests[2][0][-1]['content']
    assert 'лучше текущего' not in response.summary
    assert [item.tool for item in response.evidence] == ['search_scenarios', 'compare_scenarios']


def test_repeated_uncompared_search_claim_is_rejected():
    provider = ScriptedProvider([
        tool_call('search_scenarios', {'budget_limit': 90, 'top_k': 1}),
        final('Найденный план лучше текущего.'), final('Найденный план лучше текущего.'),
    ])
    response = asyncio.run(run_supervisor(ChatRequest(message='Найди лучший план.', decisions=DEMO_PLAN), provider))
    assert not response.available
    assert not response.summary
    assert [item.tool for item in response.evidence] == ['search_scenarios']


def test_empty_search_does_not_require_a_fabricated_comparison():
    provider = ScriptedProvider([
        tool_call('search_scenarios', {'budget_limit': 0}),
        final('При заданном бюджете допустимых вариантов нет.'),
    ])
    response = asyncio.run(run_supervisor(ChatRequest(message='Найди вариант.', decisions=DEMO_PLAN), provider))
    assert response.available
    assert not response.evidence[0].result['results']


def test_unknown_found_plan_cannot_pass_comparison_guard(monkeypatch):
    other = [dict(item) for item in DEMO_PLAN]
    next(item for item in other if item['measure_id'] == 'M8')['district'] = 'Есиль'
    monkeypatch.setattr(agent.tools, 'compare_scenarios', lambda **kwargs: pytest.fail('Fabricated alternative'))
    provider = ScriptedProvider([
        tool_call('search_scenarios', {'budget_limit': 90, 'top_k': 1}),
        tool_call('compare_scenarios', {'scenario_a': DEMO_PLAN, 'scenario_b': other}),
        final('Найденный план лучше текущего.'), final('Найденный план лучше текущего.'),
    ])
    response = asyncio.run(run_supervisor(ChatRequest(message='Подбери альтернативу.', decisions=DEMO_PLAN), provider))
    assert not response.available
    assert response.evidence[-1].result['errors'][0]['code'] == 'UNSOURCED_COMPARISON'


def test_tool_call_budget_still_applies_to_multi_tool_batches(monkeypatch):
    monkeypatch.setattr(agent, 'execute_tool', lambda *args: pytest.fail('Excessive batch executed'))
    message = tool_call('inspect_city_state', {})
    message['tool_calls'] *= agent.MAX_TOOL_CALLS + 1
    response = asyncio.run(run_supervisor(ChatRequest(message='Сделай всё.'), ScriptedProvider([message])))
    assert not response.available
    assert not response.evidence


def test_comparison_accepts_reordered_plans_and_omitted_null_district():
    def compare_reordered(messages):
        message = compare_found_plan(messages)
        function = message['tool_calls'][0]['function']
        args = json.loads(function['arguments'])
        for decisions in args.values():
            decisions.reverse()
            for decision in decisions:
                if decision.get('district') is None:
                    decision.pop('district', None)
        function['arguments'] = json.dumps(args)
        return message

    provider = ScriptedProvider([
        tool_call('search_scenarios', {'budget_limit': 90, 'top_k': 1}),
        compare_reordered, final('Разница Score: {{e2.score.delta}}.'),
    ])
    response = asyncio.run(run_supervisor(ChatRequest(message='Сравни альтернативу.', decisions=DEMO_PLAN), provider))
    assert response.available
    assert response.evidence[-1].result['valid']


def test_invalid_current_plan_can_be_explained_after_real_comparison():
    current = DEMO_PLAN[:4]

    def compare_invalid_current(messages):
        search = json.loads(messages[-1]['content'])['result']
        return tool_call('compare_scenarios', {'scenario_a': current, 'scenario_b': search['results'][0]['decisions']})

    provider = ScriptedProvider([
        tool_call('search_scenarios', {'budget_limit': 90, 'top_k': 1}),
        compare_invalid_current, final('Текущий план неполон. Сравнить результат нельзя; найден самостоятельный допустимый вариант.'),
    ])
    response = asyncio.run(run_supervisor(ChatRequest(message='Найди вариант лучше моего.', decisions=current), provider))
    assert response.available
    assert not response.evidence[-1].result['valid']
    assert response.evidence[-1].result['errors']['scenario_a']


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
