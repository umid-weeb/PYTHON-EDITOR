from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user, get_optional_user
from app.database import get_db
from app.models.schemas import SubmissionRequest
from app.models.user import User
from app.services.profile_service import profile_service
from app.services.submission_service import (
    SubmissionProblemNotFoundError,
    SubmissionService,
    get_submission_service,
)


router = APIRouter(tags=["submissions"])
logger = logging.getLogger("pyzone.submissions")


class SubmissionResponse(BaseModel):
    submission_id: str
    status: str
    message: str


class SubmissionStatusResponse(BaseModel):
    submission_id: str
    problem_id: str
    mode: str
    language: str
    status: str
    verdict: str | None = None
    runtime_ms: int | None = None
    memory_kb: int | None = None
    passed_count: int | None = None
    total_count: int | None = None
    created_at: datetime
    updated_at: datetime
    error_text: str | None = None
    case_results: list[dict[str, Any]] = Field(default_factory=list)


class UserProfileResponse(BaseModel):
    user_id: int
    username: str
    email: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    country: str | None = None
    created_at: datetime | None = None
    solved_count: int
    easy_solved: int
    medium_solved: int
    hard_solved: int
    rating: int
    submissions_count: int
    recent_submissions: list[dict[str, Any]]


@router.post("/run", response_model=SubmissionResponse, status_code=status.HTTP_201_CREATED)
async def run_code(
    request: SubmissionRequest,
    current_user: User | None = Depends(get_optional_user),
    service: SubmissionService = Depends(get_submission_service),
) -> SubmissionResponse:
    try:
        submission_id = service.create_submission(
            request,
            mode="run",
            user_id=current_user.id if current_user else None,
        )
        service.enqueue_submission(submission_id)
        return SubmissionResponse(
            submission_id=submission_id,
            status="pending",
            message="Kod ishga tushirildi.",
        )
    except SubmissionProblemNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Problem topilmadi") from error
    except Exception as error:
        logger.exception("Error creating run submission: %s", error)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Kodni ishga tushirishda xatolik yuz berdi",
        ) from error


@router.post("/submit", response_model=SubmissionResponse, status_code=status.HTTP_201_CREATED)
async def submit_code(
    request: SubmissionRequest,
    current_user: User = Depends(get_current_user),
    service: SubmissionService = Depends(get_submission_service),
) -> SubmissionResponse:
    try:
        submission_id = service.create_submission(request, mode="submit", user_id=current_user.id)
        service.enqueue_submission(submission_id)
        return SubmissionResponse(
            submission_id=submission_id,
            status="pending",
            message="Yechim tekshirilmoqda...",
        )
    except SubmissionProblemNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Problem topilmadi") from error
    except Exception as error:
        logger.exception("Error creating submit submission: %s", error)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Yechim yuborishda xatolik yuz berdi",
        ) from error


@router.get("/submission/{submission_id}", response_model=SubmissionStatusResponse)
async def get_submission_status(
    submission_id: str,
    current_user: User | None = Depends(get_optional_user),
    service: SubmissionService = Depends(get_submission_service),
) -> SubmissionStatusResponse:
    payload = service.get_submission_for_user(
        submission_id,
        current_user.id if current_user else None,
    )
    if payload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Yechim topilmadi")
    return SubmissionStatusResponse.model_validate(payload)


@router.get("/profile/{user_id}", response_model=UserProfileResponse)
async def get_user_profile(
    user_id: int,
    db: Session = Depends(get_db),
) -> UserProfileResponse:
    try:
        profile = profile_service.get_user_profile(db, user_id)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Foydalanuvchi topilmadi") from error

    return UserProfileResponse(
        user_id=profile.user.id,
        username=profile.user.username,
        email=None,
        display_name=getattr(profile.user, "display_name", None),
        avatar_url=getattr(profile.user, "avatar_url", None),
        country=profile.user.country,
        created_at=getattr(profile.user, "created_at", None),
        solved_count=profile.solved_count,
        easy_solved=profile.easy_solved,
        medium_solved=profile.medium_solved,
        hard_solved=profile.hard_solved,
        rating=profile.rating,
        submissions_count=profile.submissions_count,
        recent_submissions=profile.recent_submissions,
    )


@router.get("/stats/problem/{problem_id}")
async def get_problem_stats(
    problem_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        return profile_service.get_problem_stats(db, problem_id)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Problem topilmadi") from error


@router.get("/leaderboard")
async def get_leaderboard(
    limit: int = 10,
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    return profile_service.get_leaderboard(db, limit=max(1, min(limit, 100)))
