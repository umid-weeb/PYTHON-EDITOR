from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.models.schemas import ProblemDetail, ProblemListResponse
from app.services.problem_service import (
    ProblemNotFoundError,
    ProblemService,
    get_problem_service,
)


router = APIRouter(tags=["problems"])


@router.get("/problems", response_model=ProblemListResponse)
async def list_problems(
    page: int = 1,
    per_page: int = 20,
    q: str = "",
    tags: str = "",
    refresh: bool = False,
    service: ProblemService = Depends(get_problem_service),
) -> ProblemListResponse:
    tag_items = [item.strip() for item in tags.split(",") if item.strip()]
    payload = await service.list_problem_page(
        page=page,
        per_page=per_page,
        query=q,
        tags=tag_items,
        force_refresh=refresh,
    )
    return ProblemListResponse(
        items=payload["items"],
        total=payload["total"],
        page=payload["page"],
        per_page=payload["per_page"],
        total_pages=payload["total_pages"],
        query=payload["query"],
        selected_tags=payload["selected_tags"],
        available_tags=payload["available_tags"],
        source=service.source_label,
        easy_only=True,
    )


@router.get("/problem/{problem_id}", response_model=ProblemDetail)
async def get_problem(
    problem_id: str,
    refresh: bool = False,
    service: ProblemService = Depends(get_problem_service),
) -> ProblemDetail:
    try:
        return await service.get_problem(problem_id, force_refresh=refresh)
    except ProblemNotFoundError as error:
        raise HTTPException(status_code=404, detail="Problem topilmadi.") from error
