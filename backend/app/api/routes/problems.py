from __future__ import annotations
from app.models.schemas import ProblemDetail
import logging
from time import perf_counter

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.models.schemas import ProblemListResponse, ProblemDetail
from app.models.user import User
from app.models.submission import Submission, SolvedProblem
from app.api.routes.auth import get_optional_user, get_current_user
from app.database import SessionLocal, get_db
from app.services.problem_service import (
    ProblemNotFoundError,
    ProblemService,
    get_problem_service,
)
from app.repositories.submission_tracking import submission_tracking_repository


router = APIRouter(tags=["problems"])
logger = logging.getLogger("pyzone.arena.problems")


@router.get("/problems", response_model=ProblemListResponse)
async def list_problems(
    page: int = 1,
    per_page: int = 200,
    q: str = "",
    tags: str = "",
    difficulty: str = "",
    refresh: bool = False,
    current_user: User | None = Depends(get_optional_user),
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
        difficulty=difficulty,
        user_id=current_user.id if current_user else None,
        force_refresh=refresh,
    )

    logger.info(
        "problems.list source=%s refresh=%s cache=%s page=%s per_page=%s query=%r tags=%s loaded=%s total=%s latency_ms=%.2f",
        service.source_label,
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
        easy_only=False,
    )


@router.get("/search", response_model=ProblemListResponse)
async def search_problems(
    q: str,
    page: int = 1,
    per_page: int = 200,
    tags: str = "",
    difficulty: str = "",
    current_user: User | None = Depends(get_optional_user),
    service: ProblemService = Depends(get_problem_service),
) -> ProblemListResponse:
    """Enhanced search endpoint for problems with better query handling"""
    if not q.strip():
        raise HTTPException(status_code=400, detail="Search query cannot be empty")
    
    tag_items = [item.strip() for item in tags.split(",") if item.strip()]
    payload = await service.list_problem_page(
        page=page,
        per_page=per_page,
        query=q.strip(),
        tags=tag_items,
        difficulty=difficulty,
        user_id=current_user.id if current_user else None,
        force_refresh=False,
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
        easy_only=False,
    )


@router.get("/problems/{problem_slug}", response_model=ProblemDetail)
async def get_problem(
    problem_slug: str,
    lang: str = Query("uz", description="Language code (uz for Uzbek, en for English)"),
    refresh: bool = False,
    service: ProblemService = Depends(get_problem_service),
) -> ProblemDetail:
    started_at = perf_counter()
    cache_hit = False
    if not refresh:
        try:
            cache_key = f"{problem_slug}_{lang}"
            cache_hit = service.cache.load_problem(cache_key) is not None
        except Exception:
            cache_hit = False

    try:
        # Use multilingual version if language is specified
        if lang in ["uz", "en"]:
            with SessionLocal() as db:
                from app.models.problem import Problem
                problem_obj = db.query(Problem).filter(Problem.slug == problem_slug).first()
                if problem_obj is None:
                    raise ProblemNotFoundError(problem_slug)
                
                bundle = service._build_problem_bundle_multilingual(problem_obj, lang)
                public_payload = dict(bundle)
                public_payload.pop("hidden_testcases", None)
                problem = ProblemDetail.model_validate(public_payload)
        else:
            # Fallback to original method for backward compatibility
            problem = await service.get_problem(problem_slug, force_refresh=refresh)
        
        logger.info(
            "problems.detail problem=%s lang=%s source=%s refresh=%s cache=%s visible=%s hidden=%s latency_ms=%.2f",
            problem_slug,
            lang,
            service.source_label,
            refresh,
            "hit" if cache_hit else "miss",
            len(problem.visible_testcases),
            problem.hidden_testcase_count,
            (perf_counter() - started_at) * 1000,
        )
        return problem
    except ProblemNotFoundError as error:
        logger.warning(
            "problems.detail.not_found problem=%s lang=%s source=%s refresh=%s cache=%s",
            problem_slug,
            lang,
            service.source_label,
            refresh,
            "hit" if cache_hit else "miss",
        )
        raise HTTPException(status_code=404, detail="Problem topilmadi.") from error


@router.get("/problem/{problem_key}", response_model=ProblemDetail)
async def get_problem_legacy(
    problem_key: str,
    refresh: bool = False,
    service: ProblemService = Depends(get_problem_service),
) -> ProblemDetail:
    return await get_problem(problem_slug=problem_key, refresh=refresh, service=service)


@router.get("/problems/{problem_slug}/solutions")
async def get_problem_solutions(
    problem_slug: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.models.problem import Problem
    from sqlalchemy import and_, not_
    
    # 1. Get the problem ID from slug
    problem = db.query(Problem).filter(Problem.slug == problem_slug).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem topilmadi")

    # 2. Check if the current user has already solved this problem
    is_solved = db.query(SolvedProblem).filter(
        SolvedProblem.user_id == current_user.id,
        SolvedProblem.problem_id == problem.id
    ).first()

    if not is_solved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Yechimlarni ko'rish uchun avval masalani o'zingiz yechishingiz kerak."
        )

    # 3. Fetch top unique user solutions
    solutions = (
        db.query(Submission)
        .filter(
            and_(
                Submission.problem_id == problem.id,
                Submission.verdict == "accepted",
                Submission.status == "completed",
                not_(Submission.user_id == current_user.id)
            )
        )
        .order_by(Submission.runtime_ms.asc())
        .limit(30)
        .all()
    )

    unique_solutions = []
    seen_users = set()
    for sub in solutions:
        if sub.user_id not in seen_users:
            unique_solutions.append({
                "id": sub.id,
                "username": sub.user.username if sub.user else "Anonim",
                "code": sub.code,
                "language": sub.language,
                "runtime": sub.runtime_ms,
                "memory": sub.memory_kb,
                "created_at": sub.created_at.isoformat()
            })
            seen_users.add(sub.user_id)
        if len(unique_solutions) >= 10:
            break
            
    return unique_solutions
