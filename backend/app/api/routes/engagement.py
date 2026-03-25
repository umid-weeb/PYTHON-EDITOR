from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user
from app.database import get_db
from app.models.problem import Problem
from app.models.user import User
from app.services.engagement_service import engagement_service


router = APIRouter(tags=["engagement"])


class OnboardingAnswers(BaseModel):
    complexity_answer: str | None = None
    language: str | None = None
    goal: str | None = None
    hours: str | None = None
    strong_topics: list[str] = Field(default_factory=list)
    weak_topics: list[str] = Field(default_factory=list)


class OnboardingAssessRequest(BaseModel):
    answers: OnboardingAnswers


def _calculate_assessment_score(answers: OnboardingAnswers) -> int:
    score = 0
    normalized_complexity = (answers.complexity_answer or "").strip().lower()
    if normalized_complexity in {"o(n)", "linear", "n"}:
        score += 25

    if answers.language:
        score += 10

    strong_topics = [topic.strip() for topic in answers.strong_topics if topic.strip()]
    score += min(len(strong_topics) * 8, 24)

    hours = (answers.hours or "").strip().lower()
    if hours in {"5h+", "5+", "5"}:
        score += 10
    elif hours in {"3-5h", "3-5"}:
        score += 6
    elif hours:
        score += 3

    goal = (answers.goal or "").strip().lower()
    if goal in {"competition", "interview prep"}:
        score += 8
    elif goal:
        score += 4

    return min(score, 100)


@router.post("/onboarding/assess")
def assess_onboarding(
    payload: OnboardingAssessRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    score = _calculate_assessment_score(payload.answers)
    if score < 30:
        level = "beginner"
        target_difficulties = ["easy"]
        daily_goal = 1
    elif score < 70:
        level = "intermediate"
        target_difficulties = ["easy", "medium"]
        daily_goal = 2
    else:
        level = "advanced"
        target_difficulties = ["medium", "hard"]
        daily_goal = 3

    current_user.level = level
    current_user.goal = payload.answers.goal
    current_user.weekly_hours = payload.answers.hours
    db.flush()

    recommended = (
        db.query(Problem)
        .filter(Problem.difficulty.in_(target_difficulties))
        .order_by(Problem.created_at.desc())
        .limit(5)
        .all()
    )
    db.commit()

    return {
        "score": score,
        "level": level,
        "daily_goal": daily_goal,
        "recommended_problems": [
            {
                "id": problem.id,
                "slug": problem.slug,
                "title": problem.title,
                "difficulty": problem.difficulty,
            }
            for problem in recommended
        ],
    }


@router.get("/user/streak")
def get_my_streak(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    return engagement_service.get_streak_snapshot(db, current_user.id).to_dict()


@router.get("/daily-challenge")
def get_daily_challenge(db: Session = Depends(get_db)) -> dict:
    challenge = engagement_service.get_or_create_today_challenge(db)
    if challenge is None or challenge.problem is None:
        raise HTTPException(status_code=404, detail="Daily challenge is not available")

    problem = challenge.problem
    return {
        "id": challenge.id,
        "date": challenge.challenge_date.isoformat(),
        "is_premium": bool(challenge.is_premium),
        "problem": {
            "id": problem.id,
            "slug": problem.slug,
            "title": problem.title,
            "difficulty": problem.difficulty,
        },
    }
