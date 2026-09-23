"""FastAPI integration: deterministic operations remain usable without an LLM."""
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env", override=False)

from ai import tools  # noqa: E402
from ai.agent import is_configured, run_supervisor  # noqa: E402
from ai.simulator import simulate  # noqa: E402
from ai.validator import validate_plan  # noqa: E402
from backend.agent_schemas import AnalysisResponse, ChatRequest, ChatResponse, CompareRequest, SearchRequest  # noqa: E402
from backend.schemas import Plan, SimulationResult, ValidationResult  # noqa: E402
from backend.tiles import router as tiles_router  # noqa: E402

app = FastAPI(title="Аким на 5 часов · Urban Strategy Copilot", version="1.0.0",
              description="Синтетическая модель города. Числа считает Python; один AI Supervisor выбирает tools и объясняет результаты.")
app.include_router(tiles_router)


@app.get("/api/health")
def health():
    return {"status": "ok", "ai_configured": is_configured()}


@app.get("/api/context")
def city_state():
    return tools.inspect_city_state()


@app.post("/api/validate", response_model=ValidationResult)
def validate(plan: Plan):
    return validate_plan(plan.decisions)


@app.post("/api/simulate", response_model=SimulationResult | ValidationResult)
def simulation(plan: Plan):
    return simulate(plan.decisions)


@app.post("/api/search")
def search(request: SearchRequest):
    return tools.search_scenarios(**request.model_dump())


@app.post("/api/compare")
def compare(request: CompareRequest):
    return tools.compare_scenarios(**request.model_dump(mode="json"))


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    return await run_supervisor(request)


@app.post("/api/analyze", response_model=AnalysisResponse)
async def analyze(result: SimulationResult):
    trusted = simulate(result.decisions)
    if not isinstance(trusted, SimulationResult) or trusted != result:
        raise HTTPException(status_code=422, detail="Результат не соответствует выбранным решениям. Запустите симуляцию повторно.")
    answer = await run_supervisor(ChatRequest(
        message="Объясни результат текущего сценария: почему изменился Score, сильные стороны, оставшиеся слабые места, риски и компромиссы.",
        decisions=trusted.decisions,
    ), analysis_result=trusted)
    explanation = "\n\n".join([answer.summary, *answer.calculated_results, *answer.interpretation,
                                *answer.strengths, *answer.risks, *answer.tradeoffs, *answer.recommendations]) if answer.available else None
    return AnalysisResponse(available=answer.available, explanation=explanation, message=answer.message, analysis=answer)


@app.exception_handler(RequestValidationError)
async def invalid_request(_request: Request, _exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"valid": False, "errors": [
        {"code": "INVALID_REQUEST", "message": "Неверный формат запроса. Проверьте типы полей, цель поиска и допустимые ограничения."},
    ]})


# Optional production build: one origin and one server, no permissive CORS needed.
if (ROOT / "frontend" / "dist").is_dir():
    app.mount("/", StaticFiles(directory=ROOT / "frontend" / "dist", html=True), name="frontend")
