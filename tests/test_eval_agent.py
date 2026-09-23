"""Offline checks of the opt-in evaluator; no live credentials or HTTP calls."""
import json

import pytest

from ai.grounding import render_grounded
from backend.agent_schemas import AgentDraft, ChatResponse, ToolEvidence
from scripts import eval_agent


def test_eval_checks_grounding_and_observed_search_arguments():
    case = next(item for item in eval_agent.CASES if item['id'] == 'budget')
    evidence = [ToolEvidence(id='e1', tool='search_scenarios',
                             args={'objective': 'max_score', 'budget_limit': 90},
                             result={'valid': True, 'results': [], 'budget_limit': 90})]
    draft = AgentDraft(summary='Ограничение: {{e1.budget_limit}}.')
    answer = render_grounded(draft, evidence)
    response = ChatResponse(available=True, **answer.model_dump(), evidence=evidence)
    report = eval_agent.evaluate(case, response, draft.model_dump_json())
    assert report['passed']
    # Available alone must not be reported as a grounding check.
    report = eval_agent.evaluate(case, response, json.dumps({'summary': 'Ограничение: 90.'}))
    assert not report['grounding_passed']
    assert not report['passed']
    evidence[0].args['budget_limit'] = 100
    report = eval_agent.evaluate(case, response, draft.model_dump_json())
    assert not report['arguments_ok']


def test_eval_rejects_missing_expected_tool():
    case = next(item for item in eval_agent.CASES if item['id'] == 'search_compare')
    response = ChatResponse(available=True, summary='Готово.', evidence=[
        ToolEvidence(id='e1', tool='inspect_city_state', args={}, result={}),
    ])
    report = eval_agent.evaluate(case, response, '{"summary":"Готово."}')
    assert report['grounding_passed']
    assert not report['tools_ok']
    assert not report['passed']


def test_eval_matches_plan_identity_without_requiring_serialization_order():
    a = [{'measure_id': 'M14'}, {'measure_id': 'M8', 'district': 'Нура'}]
    b = [{'measure_id': 'M8', 'district': 'Нура'}, {'measure_id': 'M14', 'district': None}]
    assert eval_agent.same_plan(a, b)
    assert not eval_agent.same_plan(a, b[:1])
    assert not eval_agent.same_plan(None, b)


def test_live_eval_skips_without_configuration(monkeypatch, capsys):
    monkeypatch.setattr(eval_agent.sys, 'argv', ['eval_agent.py'])
    monkeypatch.setattr(eval_agent, 'load_dotenv', lambda *args, **kwargs: None)
    monkeypatch.delenv('LLM_API_KEY', raising=False)
    monkeypatch.delenv('LLM_MODEL', raising=False)
    monkeypatch.setattr(eval_agent, 'run_cases', lambda *args: pytest.fail('Live call without configuration'))
    assert eval_agent.main() == 0
    assert 'SKIP' in capsys.readouterr().out
