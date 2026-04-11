from __future__ import annotations

import json
from datetime import date
import logging
import re
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.routes.auth import get_optional_user
from app.database import get_db
from app.models.ai_usage import AIChatUsage
from app.models.user import User
from app.judge.judge0_client import Judge0Client, get_judge0_settings
from app.services.editor_ai_service import EditorAIService, get_editor_ai_service


router = APIRouter(tags=["editor"])
logger = logging.getLogger("pyzone.editor")

EDITOR_DAILY_GUEST_LIMIT = 5
EDITOR_DAILY_USER_LIMIT = 300


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


class EditorChatMessage(BaseModel):
    role: str
    content: str


class EditorChatRequest(BaseModel):
    language: Literal["python", "javascript", "cpp", "java", "go"] = "python"
    starter_pack: str = "array"
    code: str = Field(min_length=1)
    selected_text: str = ""
    output_text: str = ""
    cursor_line: int = 1
    cursor_column: int = 1
    line_count: int = 0
    is_dark_mode: bool = False
    console_input_active: bool = False
    console_input_prompt: str = ""
    context_tag: str = "online-editor"
    user_message: str = Field(min_length=1)
    conversation_history: list[EditorChatMessage] = Field(default_factory=list)


class EditorChatResponse(BaseModel):
    reply: str | None = None
    remaining: int | None = None
    requires_auth: bool = False


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


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_and_increment(
    db: Session,
    user_id: int | None,
    ip_address: str,
    context_tag: str,
) -> tuple[bool, int, bool]:
    today = date.today()

    if user_id:
        limit = EDITOR_DAILY_USER_LIMIT
        usage = (
            db.query(AIChatUsage)
            .filter(AIChatUsage.user_id == user_id, AIChatUsage.date == today)
            .first()
        )
        if not usage:
            usage = AIChatUsage(user_id=user_id, date=today, request_count=0, topics_summary="[]")
            db.add(usage)
            db.flush()
    else:
        limit = EDITOR_DAILY_GUEST_LIMIT
        usage = (
            db.query(AIChatUsage)
            .filter(
                AIChatUsage.ip_address == ip_address,
                AIChatUsage.user_id.is_(None),
                AIChatUsage.date == today,
            )
            .first()
        )
        if not usage:
            usage = AIChatUsage(ip_address=ip_address, date=today, request_count=0, topics_summary="[]")
            db.add(usage)
            db.flush()

    if usage.request_count >= limit:
        return False, 0, (user_id is None)

    usage.request_count += 1

    try:
        topics: list = json.loads(usage.topics_summary or "[]")
    except Exception:
        topics = []
    if context_tag and context_tag not in topics:
        topics.append(context_tag)
        usage.topics_summary = json.dumps(topics)

    db.commit()
    remaining = limit - usage.request_count
    return True, remaining, False


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


@router.post("/chat", response_model=EditorChatResponse)
async def editor_chat(
    payload: EditorChatRequest,
    raw_request: Request,
    current_user: User | None = Depends(get_optional_user),
    editor_ai_service: EditorAIService = Depends(get_editor_ai_service),
    db: Session = Depends(get_db),
) -> EditorChatResponse:
    ip = _get_client_ip(raw_request)
    user_id = current_user.id if current_user else None

    allowed = True
    remaining = None
    is_guest_limit = False
    try:
        allowed, remaining, is_guest_limit = _check_and_increment(
            db,
            user_id,
            ip,
            payload.context_tag or f"online-editor:{payload.language}:{payload.starter_pack}",
        )
    except Exception as exc:  # pragma: no cover - defensive fail-open
        logger.error("Editor chat rate limit DB error (non-fatal): %s", exc)

    if not allowed:
        if is_guest_limit:
            return EditorChatResponse(reply=None, remaining=0, requires_auth=True)
        return EditorChatResponse(
            reply="Bugunlik AI so'rov limiti tugadi. Ertaga yana urinib ko'ring.",
            remaining=0,
            requires_auth=False,
        )

    history = [
        {"role": msg.role, "content": msg.content}
        for msg in payload.conversation_history[-4:]
    ]

    try:
        reply = await editor_ai_service.get_editor_chat_response(
            user_message=payload.user_message,
            conversation_history=history,
            language=payload.language,
            code=payload.code,
            starter_pack=payload.starter_pack,
            selected_text=payload.selected_text,
            output_text=payload.output_text,
            cursor_line=payload.cursor_line,
            cursor_column=payload.cursor_column,
            line_count=payload.line_count,
            is_dark_mode=payload.is_dark_mode,
            console_input_active=payload.console_input_active,
            console_input_prompt=payload.console_input_prompt,
        )
    except Exception as exc:
        logger.error("Editor chat get_editor_chat_response error: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI javob berishda xatolik: {str(exc)}",
        )

    return EditorChatResponse(reply=reply, remaining=remaining, requires_auth=False)


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
