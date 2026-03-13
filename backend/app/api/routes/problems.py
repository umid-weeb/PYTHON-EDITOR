from __future__ import annotations

import logging
from time import perf_counter

from fastapi import APIRouter, Depends, HTTPException

from app.models.schemas import ProblemDetail, ProblemListResponse
from app.services.problem_service import (
    ProblemNotFoundError,
    ProblemService,
    get_problem_service,
)


router = APIRouter(tags=["problems"])
logger = logging.getLogger("pyzone.arena.problems")


@router.get("/problems", response_model=ProblemListResponse)
async def list_problems(
    page: int = 1,
    per_page: int = 20,
    q: str = "",
    tags: str = "",
    refresh: bool = False,
    service: ProblemService = Depends(get_problem_service),
) -> ProblemListResponse:
    started_at = perf_counter()
    cache_hit = False
    if not refresh:
        try:
            cache_hit = service.cache.load_index() is not None
        except Exception:
            cache_hit = False

    tag_items = [item.strip() for item in tags.split(",") if item.strip()]
    payload = await service.list_problem_page(
        page=page,
        per_page=per_page,
        query=q,
        tags=tag_items,
        force_refresh=refresh,
    )

    logger.info(
        "problems.list source=%s github_fetch=%s refresh=%s cache=%s page=%s per_page=%s query=%r tags=%s loaded=%s total=%s latency_ms=%.2f",
        service.source_label,
        service.source.last_fetch_status,
        refresh,
        "hit" if cache_hit else "miss",
        payload["page"],
        payload["per_page"],
        q,
        payload["selected_tags"],
        len(payload["items"]),
        payload["total"],
        (perf_counter() - started_at) * 1000,
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
    started_at = perf_counter()
    cache_hit = False
    if not refresh:
        try:
            cache_hit = service.cache.load_problem(problem_id) is not None
        except Exception:
            cache_hit = False

    try:
        problem = await service.get_problem(problem_id, force_refresh=refresh)
        logger.info(
            "problems.detail problem_id=%s source=%s github_fetch=%s refresh=%s cache=%s visible=%s hidden=%s latency_ms=%.2f",
            problem_id,
            service.source_label,
            service.source.last_fetch_status,
            refresh,
            "hit" if cache_hit else "miss",
            len(problem.visible_testcases),
            problem.hidden_testcase_count,
            (perf_counter() - started_at) * 1000,
        )
        return problem
    except ProblemNotFoundError as error:
        logger.warning(
            "problems.detail.not_found problem_id=%s source=%s github_fetch=%s refresh=%s cache=%s",
            problem_id,
            service.source_label,
            "enabled" if service.settings.github_enabled else "local-fallback",
            refresh,
            "hit" if cache_hit else "miss",
        )
        raise HTTPException(status_code=404, detail="Problem topilmadi.") from error
