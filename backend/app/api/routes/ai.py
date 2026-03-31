from __future__ import annotations
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from app.api.routes.auth import get_optional_user
from app.models.user import User
from app.services.ai_service import AIService, get_ai_service
from app.services.problem_service import ProblemService, get_problem_service

router = APIRouter(tags=["ai"])
logger = logging.getLogger("pyzone.ai.routes")

class AIReviewRequest(BaseModel):
    code: str
    problem_slug: str
    language: str

@router.post("/review")
async def review_code(
    request: AIReviewRequest,
    current_user: User | None = Depends(get_optional_user),
    ai_service: AIService = Depends(get_ai_service),
    problem_service: ProblemService = Depends(get_problem_service),
):
    try:
        # Verify problem exists
        problem = await problem_service.get_problem(request.problem_slug)
        if not problem:
            raise HTTPException(status_code=404, detail="Problem topilmadi")

        # Call AI service for review
        review_data = await ai_service.review_code(
            code=request.code,
            problem_title=problem.title,
            language=request.language
        )
        
        return review_data
    except Exception as e:
        logger.error(f"Error in AI review route: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI analizida xatolik yuz berdi: {str(e)}"
        )

@router.post("/hint")
async def get_hint(
    request: AIReviewRequest,
    current_user: User | None = Depends(get_optional_user),
    ai_service: AIService = Depends(get_ai_service),
    problem_service: ProblemService = Depends(get_problem_service),
):
    try:
        # Verify problem exists
        problem = await problem_service.get_problem(request.problem_slug)
        if not problem:
            raise HTTPException(status_code=404, detail="Problem topilmadi")

        # Call AI service for hint
        hint = await ai_service.get_hint(
            code=request.code,
            problem_title=problem.title,
            language=request.language
        )
        
        return {"hint": hint}
    except Exception as e:
        logger.error(f"Error in AI hint route: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI shama (hint) yaratishda xatolik yuz berdi: {str(e)}"
        )
