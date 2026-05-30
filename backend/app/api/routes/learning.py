from __future__ import annotations

import os
import logging
from typing import List

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.services.learning_service import (
    get_learning_pattern,
    get_remediation_payload,
    mark_mastery_complete,
    record_failure,
)

router = APIRouter(tags=["learning"])
logger = logging.getLogger("pyzone.learning.routes")


class QuizItem(BaseModel):
    question: str
    options: List[str]
    correct_answer_index: int


class RemediationResponse(BaseModel):
    concept_explanation: str
    youtube_embed_id: str
    quiz: List[QuizItem]


class LearningPatternResponse(BaseModel):
    user_id: int
    topic: str
    fail_count: int
    mastery_score: int
    is_locked: bool


class LearningActionRequest(BaseModel):
    topic: str


def _validate_user_access(current_user: User, requested_user_id: int) -> int:
    if current_user.id != requested_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Noto'g'ri foydalanuvchi ma'lumotlari.",
        )
    return requested_user_id


async def _fetch_adaptive_service_payload(user_id: int, topic: str) -> dict:
    service_url = os.getenv("ARENA_ADAPTIVE_SERVICE_URL", "").strip()
    if not service_url:
        return {}

    if service_url.endswith("/"):
        service_url = service_url[:-1]

    endpoint = f"{service_url}/api/ai/adaptive/remediation"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(endpoint, params={"userId": user_id, "topic": topic})
            if response.status_code != 200:
                logger.warning(
                    "Adaptive service returned non-200 status %s for topic %s",
                    response.status_code,
                    topic,
                )
                return {}
            payload = response.json()
            if (
                isinstance(payload, dict)
                and isinstance(payload.get("concept_explanation"), str)
                and isinstance(payload.get("youtube_embed_id"), str)
                and isinstance(payload.get("quiz"), list)
            ):
                return payload
    except Exception as exc:
        logger.warning("Adaptive service request failed: %s", exc)
    return {}


@router.get(
    "/learning-patterns/{user_id}/{topic}",
    response_model=LearningPatternResponse,
    status_code=status.HTTP_200_OK,
)
async def get_learning_patterns(
    user_id: int,
    topic: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _validate_user_access(current_user, user_id)
    try:
        pattern = get_learning_pattern(db, user_id, topic)
        return pattern
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:  # pragma: no cover
        logger.error("Error fetching learning pattern: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="O'rganish holatini olishda xatolik yuz berdi.",
        )


@router.get(
    "/ai/adaptive/remediation",
    response_model=RemediationResponse,
    status_code=status.HTTP_200_OK,
)
async def get_adaptive_remediation(
    topic: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_user),
):
    try:
        remote_payload = await _fetch_adaptive_service_payload(current_user.id, topic)
        if remote_payload:
            return remote_payload

        return get_remediation_payload(topic)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:  # pragma: no cover
        logger.error("Error generating remediation: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Remediation olishda xatolik yuz berdi.",
        )


@router.post(
    "/learning/complete",
    response_model=LearningPatternResponse,
    status_code=status.HTTP_200_OK,
)
async def post_learning_complete(
    request: LearningActionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        result = mark_mastery_complete(db, current_user.id, request.topic)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:  # pragma: no cover
        logger.error("Error marking mastery complete: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Tugatildi holatini yangilashni amalga oshirishda xatolik yuz berdi.",
        )


@router.post(
    "/learning/failure",
    response_model=LearningPatternResponse,
    status_code=status.HTTP_200_OK,
)
async def post_learning_failure(
    request: LearningActionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        result = record_failure(db, current_user.id, request.topic)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:  # pragma: no cover
        logger.error("Error recording failure: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Xatolikni hisoblashda xatolik yuz berdi.",
        )
