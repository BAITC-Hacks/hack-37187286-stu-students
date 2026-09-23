import pytest
from fastapi.testclient import TestClient

from ai.data import DEMO_PLAN
from backend.main import app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("LLM_MODEL", raising=False)
    with TestClient(app) as client:
        yield client


def test_context_and_health(client):
    assert client.get("/api/health").json()["status"] == "ok"
    state = client.get("/api/context").json()
    assert state["synthetic"] is True
    assert len(state["districts"]) == 5
    assert len(state["measures"]) == 14
    assert len(state["baseline"]["critical"]) == 2
    assert state["constraints"]["decision_count"] == 5
    assert state["constraints"]["max_per_direction"] == 1
    assert len(state["synergies"]) == 3
    assert all("same_district_only" in rule for rule in state["constraints"]["incompatibilities"])


def test_manual_flow_and_optional_ai(client):
    plan = {"decisions": DEMO_PLAN}
    assert client.post("/api/validate", json=plan).json()["valid"]
    response = client.post("/api/simulate", json=plan)
    assert response.status_code == 200
    result = response.json()
    assert result["budget"]["used"] == 93
    assert result["critical"]["after"] == 1
    assert result["score"]["after"] > result["score"]["before"]
    explanation = client.post("/api/analyze", json=result)
    assert explanation.status_code == 200
    assert not explanation.json()["available"]


def test_client_cannot_forge_ai_calculations(client):
    result = client.post("/api/simulate", json={"decisions": DEMO_PLAN}).json()
    result["score"]["after"] = 99.0
    assert client.post("/api/analyze", json=result).status_code == 422


def test_invalid_plan_has_no_score(client):
    plan = [dict(item) for item in DEMO_PLAN]
    next(item for item in plan if item["measure_id"] == "M12").update(measure_id="M13", district="Нура")
    result = client.post("/api/simulate", json={"decisions": plan}).json()
    assert not result["valid"]
    assert "score" not in result
    assert any(error["code"] == "budget_exceeded" for error in result["errors"])


@pytest.mark.parametrize("body", [None, {"decisions": "wrong"}, {"decisions": [{"measure_id": 3}]}, {"decisions": [], "score": 100}])
def test_malformed_requests(client, body):
    response = client.post("/api/simulate", json=body)
    assert response.status_code == 422
    assert response.json()["errors"][0]["code"] == "INVALID_REQUEST"


def test_search_compare_and_chat_contracts(client):
    search = client.post("/api/search", json={"objective": "max_score", "budget_limit": 90, "top_k": 1})
    assert search.status_code == 200
    result = search.json()["results"][0]
    assert result["valid"] and result["budget"]["used"] <= 90
    comparison = client.post("/api/compare", json={"scenario_a": DEMO_PLAN, "scenario_b": result["decisions"]})
    assert comparison.status_code == 200 and comparison.json()["valid"]
    chat = client.post("/api/chat", json={"message": "Улучши Нуру"})
    assert chat.status_code == 200 and not chat.json()["available"]


@pytest.mark.parametrize("body", [
    {"objective": "invented"}, {"budget_limit": 101}, {"budget_limit": -1},
    {"top_k": 0}, {"top_k": True}, {"top_k": 100},
])
def test_api_rejects_invalid_search_constraints(client, body):
    assert client.post("/api/search", json=body).status_code == 422
