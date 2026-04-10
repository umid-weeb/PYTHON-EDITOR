from __future__ import annotations

import logging
import re
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.judge.judge0_client import Judge0Client, get_judge0_settings


router = APIRouter(tags=["editor"])
logger = logging.getLogger("pyzone.editor")


class EditorRunRequest(BaseModel):
    language: Literal["python", "javascript", "cpp", "java", "go"] = "python"
    code: str = Field(min_length=1)
    stdin: str = ""
    time_limit_seconds: float = Field(default=20.0, ge=1.0, le=60.0)


class EditorRunResponse(BaseModel):
    language: str
    language_name: str | None = None
    verdict: str
    stdout: str = ""
    stderr: str = ""
    compile_output: str = ""
    runtime_ms: int = 0
    memory_kb: int = 0
    status: str | None = None
    message: str | None = None
    error: str | None = None
    token: str | None = None
    language_id: int | None = None


_LANGUAGE_PATTERNS: dict[str, tuple[re.Pattern[str], ...]] = {
    "python": (
        re.compile(r"^python(?:\s|\(|$)", re.IGNORECASE),
    ),
    "javascript": (
        re.compile(r"^javascript(?:\s|\(|$)", re.IGNORECASE),
        re.compile(r"\bnode\.js\b", re.IGNORECASE),
    ),
    "cpp": (
        re.compile(r"^c\+\+(?:\s|\(|$)", re.IGNORECASE),
        re.compile(r"^cpp(?:\s|\(|$)", re.IGNORECASE),
    ),
    "java": (
        re.compile(r"^java(?:\s|\(|$)", re.IGNORECASE),
    ),
    "go": (
        re.compile(r"^go(?:\s|\(|$)", re.IGNORECASE),
        re.compile(r"^golang(?:\s|\(|$)", re.IGNORECASE),
    ),
}


def _to_int(value: Any, default: int = 0) -> int:
    try:
        return int(float(value))
    except Exception:
        return default


def _resolve_language_id(client: Judge0Client, language: str) -> tuple[int | None, str | None]:
    patterns = _LANGUAGE_PATTERNS.get(language, ())
    if not patterns:
        return None, None

    catalog = client.list_languages()
    normalized: list[tuple[int, str]] = []
    for item in catalog:
        try:
            language_id = int(item.get("id"))
        except Exception:
            continue
        name = str(item.get("name") or "").strip()
        if name:
            normalized.append((language_id, name))

    for language_id, name in sorted(normalized, key=lambda pair: pair[0], reverse=True):
        if any(pattern.search(name) for pattern in patterns):
            return language_id, name

    return None, None


def _build_response(
    *,
    language: str,
    language_name: str | None,
    language_id: int | None,
    token: str | None,
    payload: dict[str, Any],
) -> EditorRunResponse:
    status_payload = payload.get("status") or {}
    status_description = str(status_payload.get("description") or "").strip()
    stdout = str(payload.get("stdout") or "")
    stderr = str(payload.get("stderr") or "")
    compile_output = str(payload.get("compile_output") or "")
    message = payload.get("message")
    runtime_ms = _to_int(float(payload.get("time") or 0) * 1000)
    memory_kb = _to_int(payload.get("memory"))

    verdict = status_description or "Accepted"
    lower_status = verdict.lower()
    if lower_status == "accepted":
        error_text = None
    elif "compilation" in lower_status:
        verdict = "Compilation Error"
        error_text = compile_output or stderr or status_description or message
    elif "time limit" in lower_status:
        verdict = "Time Limit Exceeded"
        error_text = stderr or status_description or message
    elif "memory limit" in lower_status:
        verdict = "Memory Limit Exceeded"
        error_text = stderr or status_description or message
    elif "wrong answer" in lower_status:
        verdict = "Wrong Answer"
        error_text = stderr or status_description or message
    else:
        verdict = status_description or "Runtime Error"
        error_text = stderr or compile_output or status_description or message

    return EditorRunResponse(
        language=language,
        language_name=language_name,
        verdict=verdict,
        stdout=stdout,
        stderr=stderr,
        compile_output=compile_output,
        runtime_ms=runtime_ms,
        memory_kb=memory_kb,
        status=status_description or None,
        message=str(message) if message not in {None, ""} else None,
        error=str(error_text) if error_text not in {None, ""} else None,
        token=token,
        language_id=language_id,
    )


@router.post("/run", response_model=EditorRunResponse)
async def run_editor_code(payload: EditorRunRequest) -> EditorRunResponse:
    settings = get_judge0_settings()
    if not settings.enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Compiler service ulanmagan. JUDGE0_BASE_URL ni sozlang.",
        )

    client = Judge0Client(settings)
    language_id, language_name = _resolve_language_id(client, payload.language)
    if language_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tanlangan til Judge0 xizmatida topilmadi.",
        )

    try:
        token = client.submit(
            source_code=payload.code,
            language_id=language_id,
            stdin=payload.stdin,
        )
        result = client.get_result(token, timeout_seconds=payload.time_limit_seconds)
    except TimeoutError as error:
        logger.warning("Judge0 execution timed out for %s: %s", payload.language, error)
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Kodni bajarish vaqt chegarasidan oshib ketdi.",
        ) from error
    except HTTPException:
        raise
    except Exception as error:  # pragma: no cover - defensive
        logger.exception("Judge0 execution failed for %s", payload.language)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Kodni ishga tushirishda xatolik yuz berdi.",
        ) from error

    return _build_response(
        language=payload.language,
        language_name=language_name,
        language_id=language_id,
        token=token,
        payload=result,
    )
