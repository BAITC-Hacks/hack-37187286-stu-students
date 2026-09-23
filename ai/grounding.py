"""Resolve numerical claims from tool evidence; never accept model-written scores."""
import re
from typing import Any

from backend.agent_schemas import AgentDraft, ToolEvidence

_REFERENCE = re.compile(r"\{\{(e\d+)\.([A-Za-z0-9_А-Яа-яЁё .-]+)\}\}")
_DOMAIN_ID = re.compile(r"\b(?:M(?:1[0-4]|[1-9])|[TESBC][12])\b")


class GroundingError(ValueError):
    pass


def _value_at(result: dict[str, Any], path: str) -> Any:
    value: Any = result
    for part in path.split("."):
        if isinstance(value, dict) and part in value:
            value = value[part]
        elif isinstance(value, list) and part.isdigit() and int(part) < len(value):
            value = value[int(part)]
        else:
            raise GroundingError("Ссылка на отсутствующее поле результата.")
    if value is None or isinstance(value, (dict, list, bool)):
        raise GroundingError("Ссылка должна указывать на число или строку.")
    return value


def render_grounded(draft: AgentDraft, evidence: list[ToolEvidence]) -> AgentDraft:
    sources = {item.id: item.result for item in evidence}

    def render(text: str) -> str:
        without_refs = _REFERENCE.sub("", text)
        if "{{" in without_refs or "}}" in without_refs:
            raise GroundingError("Некорректная ссылка на источник.")
        if re.search(r"\d", _DOMAIN_ID.sub("", without_refs)):
            raise GroundingError("Числа в объяснении должны быть ссылками на результаты tools.")

        def substitute(match: re.Match[str]) -> str:
            if match[1] not in sources:
                raise GroundingError("Неизвестный источник данных.")
            value = _value_at(sources[match[1]], match[2])
            if isinstance(value, float):
                return f"{value:.2f}".rstrip("0").rstrip(".")
            return str(value)

        return _REFERENCE.sub(substitute, text)

    rendered = {key: render(value) if isinstance(value, str) else [render(item) for item in value]
                for key, value in draft.model_dump().items()}
    return AgentDraft.model_validate(rendered)
