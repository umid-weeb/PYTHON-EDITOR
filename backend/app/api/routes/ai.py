from __future__ import annotations

import json
import logging
from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.routes.auth import get_optional_user
from app.database import get_db
from app.models.ai_usage import AIChatUsage
from app.models.user import User
from app.services.ai_service import AIService, get_ai_service
from app.services.problem_service import ProblemService, get_problem_service

router = APIRouter(tags=["ai"])
logger = logging.getLogger("pyzone.ai.routes")

# Daily limits
GUEST_DAILY_LIMIT = 5
USER_DAILY_LIMIT = 300


# --------------------------------------------------------------------------- #
#  Pydantic schemas                                                             #
# --------------------------------------------------------------------------- #
class AIReviewRequest(BaseModel):
    code: str
    problem_slug: str
    language: str


class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class AIChatRequest(BaseModel):
    code: str
    problem_slug: str
    language: str
    user_message: str
    conversation_history: List[ChatMessage] = []


# --------------------------------------------------------------------------- #
#  Rate-limit helpers                                                           #
# --------------------------------------------------------------------------- #
def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_and_increment(
    db: Session,
    user_id: int | None,
    ip_address: str,
    problem_slug: str,
) -> tuple[bool, int, bool]:
    """
    Returns (allowed, remaining, is_guest_limit).
    Side-effect: increments counter and appends problem_slug to topics_summary.
    """
    today = date.today()

    if user_id:
        limit = USER_DAILY_LIMIT
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
        limit = GUEST_DAILY_LIMIT
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

    # Increment
    usage.request_count += 1

    # Track topic (problem slug)
    try:
        topics: list = json.loads(usage.topics_summary or "[]")
    except Exception:
        topics = []
    if problem_slug and problem_slug not in topics:
        topics.append(problem_slug)
        usage.topics_summary = json.dumps(topics)

    db.commit()
    remaining = limit - usage.request_count
    return True, remaining, False


# --------------------------------------------------------------------------- #
#  Endpoints                                                                    #
# --------------------------------------------------------------------------- #
@router.post("/review")
async def review_code(
    request: AIReviewRequest,
    current_user: User | None = Depends(get_optional_user),
    ai_service: AIService = Depends(get_ai_service),
    problem_service: ProblemService = Depends(get_problem_service),
):
    try:
        problem = await problem_service.get_problem(request.problem_slug)
        if not problem:
            raise HTTPException(status_code=404, detail="Problem topilmadi")

        review_data = await ai_service.review_code(
            code=request.code,
            problem_title=problem.title,
            language=request.language,
        )
        return review_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in AI review route: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI analizida xatolik yuz berdi: {str(e)}",
        )


@router.post("/chat")
async def ai_chat(
    request_data: AIChatRequest,
    raw_request: Request,
    current_user: User | None = Depends(get_optional_user),
    ai_service: AIService = Depends(get_ai_service),
    problem_service: ProblemService = Depends(get_problem_service),
    db: Session = Depends(get_db),
):
    """
    Multi-turn AI tutor endpoint.
    - Guests: 5 requests/day (tracked by IP)
    - Registered users: 300 requests/day (tracked by user_id)
    Response:
      { "reply": str, "remaining": int, "requires_auth": bool }
    """
    ip = _get_client_ip(raw_request)
    user_id = current_user.id if current_user else None

    # Rate limit check — wrapped so DB errors never block the chatbot
    allowed = True
    remaining = None
    is_guest_limit = False
    try:
        allowed, remaining, is_guest_limit = _check_and_increment(
            db, user_id, ip, request_data.problem_slug
        )
    except Exception as e:
        logger.error(f"Rate limit DB error (non-fatal): {e}")
        # Fail open: let the request through so the chatbot still works

    if not allowed:
        if is_guest_limit:
            return {"reply": None, "remaining": 0, "requires_auth": True}
        else:
            return {
                "reply": "Bugunlik 300 ta so'rov limitiga yetdingiz. Ertaga yana foydalanishingiz mumkin! 🌙",
                "remaining": 0,
                "requires_auth": False,
            }

    # Fetch problem details
    try:
        problem = await problem_service.get_problem(request_data.problem_slug)
        if not problem:
            raise HTTPException(status_code=404, detail="Problem topilmadi")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Problem fetch error: {e}")
        raise HTTPException(status_code=500, detail="Masala ma'lumotlarini olishda xatolik")

    # Build conversation history (max last 10 messages to limit tokens)
    history = [
        {"role": msg.role, "content": msg.content}
        for msg in request_data.conversation_history[-10:]
    ]

    # Get AI response
    try:
        reply = await ai_service.get_chat_response(
            user_message=request_data.user_message,
            conversation_history=history,
            problem_title=problem.title,
            problem_description=getattr(problem, "description", "") or "",
            constraints=getattr(problem, "constraints_text", "") or "",
            code=request_data.code,
            language=request_data.language,
        )
    except Exception as e:
        logger.error(f"AI chat get_chat_response error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"AI javob berishda xatolik: {str(e)}")

    return {
        "reply": reply,
        "remaining": remaining,
        "requires_auth": False,
    }


# Legacy single-shot hint endpoint (backward compat with AIReviewPanel)
@router.post("/hint")
async def get_hint(
    request: AIReviewRequest,
    current_user: User | None = Depends(get_optional_user),
    ai_service: AIService = Depends(get_ai_service),
    problem_service: ProblemService = Depends(get_problem_service),
):
    try:
        problem = await problem_service.get_problem(request.problem_slug)
        if not problem:
            raise HTTPException(status_code=404, detail="Problem topilmadi")

        hint = await ai_service.get_hint(
            code=request.code,
            problem_title=problem.title,
            language=request.language,
        )
        return {"hint": hint}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in AI hint route: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI shama yaratishda xatolik: {str(e)}",
        )
