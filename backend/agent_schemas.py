from typing import Any, Literal

from pydantic import Field

from backend.schemas import Change, Decision, StrictModel


class SearchRequest(StrictModel):
    objective: Literal["max_score", "balanced", "focus_district", "budget_efficiency"] = "max_score"
    budget_limit: float = Field(default=100, ge=0, le=100)
    focus_district: str | None = Field(default=None, max_length=64)
    top_k: int = Field(default=3, ge=1, le=10, strict=True)


class CompareRequest(StrictModel):
    scenario_a: list[Decision] = Field(max_length=100)
    scenario_b: list[Decision] = Field(max_length=100)


class HistoryMessage(StrictModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=6000)


class ChatRequest(StrictModel):
    message: str = Field(min_length=1, max_length=4000)
    decisions: list[Decision] | None = Field(default=None, max_length=100)
    previous_decisions: list[Decision] | None = Field(default=None, max_length=100)
    history: list[HistoryMessage] = Field(default_factory=list, max_length=12)


class AgentDraft(StrictModel):
    """Only prose and evidence references are accepted from the LLM, never scores."""

    summary: str = Field(max_length=6000)
    observations: list[str] = Field(default_factory=list, max_length=12)
    calculated_results: list[str] = Field(default_factory=list, max_length=12)
    interpretation: list[str] = Field(default_factory=list, max_length=12)
    strengths: list[str] = Field(default_factory=list, max_length=12)
    risks: list[str] = Field(default_factory=list, max_length=12)
    tradeoffs: list[str] = Field(default_factory=list, max_length=12)
    recommendations: list[str] = Field(default_factory=list, max_length=12)


class ToolEvidence(StrictModel):
    id: str
    tool: str
    args: dict[str, Any]
    result: dict[str, Any]


class ChatResponse(AgentDraft):
    available: bool
    message: str | None = None
    score: Change | None = None
    evidence: list[ToolEvidence] = Field(default_factory=list)


class AnalysisResponse(StrictModel):
    available: bool
    explanation: str | None = None
    message: str | None = None
    analysis: ChatResponse | None = None
