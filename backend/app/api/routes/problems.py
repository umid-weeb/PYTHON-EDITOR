from __future__ import annotations
from app.models.schemas import ProblemDetail
import logging
from time import perf_counter

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import text as _text
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


# ---------------------------------------------------------------------------
# Comments (Discussion)
# ---------------------------------------------------------------------------

class CommentCreateRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)
    parent_id: int | None = None


def _fetch_comments(db: Session, problem_id: str, current_user_id: int | None) -> list[dict]:
    rows = db.execute(
        _text("""
            SELECT
                c.id, c.parent_id, c.content, c.likes, c.created_at, c.updated_at,
                u.id AS uid, u.username, u.display_name, u.avatar_url,
                u.is_admin, u.is_owner,
                CASE WHEN cl.user_id IS NOT NULL THEN true ELSE false END AS liked_by_me
            FROM problem_comments c
            JOIN users u ON u.id = c.user_id
            LEFT JOIN comment_likes cl ON cl.comment_id = c.id AND cl.user_id = :uid
            WHERE c.problem_id = :pid
            ORDER BY c.created_at ASC
        """),
        {"pid": problem_id, "uid": current_user_id or 0},
    ).fetchall()

    comments_map: dict[int, dict] = {}
    for r in rows:
        comments_map[r.id] = {
            "id": r.id,
            "parent_id": r.parent_id,
            "content": r.content,
            "likes": r.likes,
            "created_at": r.created_at.isoformat(),
            "updated_at": r.updated_at.isoformat(),
            "liked_by_me": bool(r.liked_by_me),
            "author": {
                "id": r.uid,
                "username": r.username,
                "display_name": r.display_name,
                "avatar_url": r.avatar_url,
                "is_admin": bool(r.is_admin),
                "is_owner": bool(r.is_owner),
            },
            "replies": [],
        }

    # Build tree
    roots: list[dict] = []
    for c in comments_map.values():
        pid = c["parent_id"]
        if pid and pid in comments_map:
            comments_map[pid]["replies"].append(c)
        else:
            roots.append(c)

    return roots


@router.get("/problems/{slug}/comments")
def get_comments(
    slug: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    problem_row = db.execute(
        _text("SELECT id FROM problems WHERE slug = :s OR id = :s"),
        {"s": slug},
    ).fetchone()
    if not problem_row:
        raise HTTPException(status_code=404, detail="Masala topilmadi")
    return _fetch_comments(db, problem_row.id, current_user.id if current_user else None)


@router.post("/problems/{slug}/comments", status_code=201)
def create_comment(
    slug: str,
    body: CommentCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    problem_row = db.execute(
        _text("SELECT id FROM problems WHERE slug = :s OR id = :s"),
        {"s": slug},
    ).fetchone()
    if not problem_row:
        raise HTTPException(status_code=404, detail="Masala topilmadi")

    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=422, detail="Fikr bo'sh bo'lishi mumkin emas")

    # Validate parent belongs to same problem
    if body.parent_id:
        parent = db.execute(
            _text("SELECT id FROM problem_comments WHERE id = :pid AND problem_id = :prob"),
            {"pid": body.parent_id, "prob": problem_row.id},
        ).fetchone()
        if not parent:
            raise HTTPException(status_code=404, detail="Javob beriladigan fikr topilmadi")

    row = db.execute(
        _text("""
            INSERT INTO problem_comments (problem_id, user_id, parent_id, content)
            VALUES (:prob, :uid, :parent, :content)
            RETURNING id, content, likes, created_at, updated_at
        """),
        {
            "prob": problem_row.id,
            "uid": current_user.id,
            "parent": body.parent_id,
            "content": content,
        },
    ).fetchone()
    db.commit()

    return {
        "id": row.id,
        "parent_id": body.parent_id,
        "content": row.content,
        "likes": row.likes,
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat(),
        "liked_by_me": False,
        "author": {
            "id": current_user.id,
            "username": current_user.username,
            "display_name": current_user.display_name,
            "avatar_url": current_user.avatar_url,
            "is_admin": bool(current_user.is_admin),
            "is_owner": bool(getattr(current_user, "is_owner", False)),
        },
        "replies": [],
    }


@router.delete("/comments/{comment_id}", status_code=204)
def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.execute(
        _text("SELECT id, user_id FROM problem_comments WHERE id = :cid"),
        {"cid": comment_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Fikr topilmadi")

    is_own = row.user_id == current_user.id
    is_staff = bool(current_user.is_admin) or bool(getattr(current_user, "is_owner", False))
    if not is_own and not is_staff:
        raise HTTPException(status_code=403, detail="Ruxsat yo'q")

    db.execute(_text("DELETE FROM problem_comments WHERE id = :cid"), {"cid": comment_id})
    db.commit()


@router.post("/comments/{comment_id}/like")
def toggle_like(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.execute(
        _text("SELECT id FROM problem_comments WHERE id = :cid"),
        {"cid": comment_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Fikr topilmadi")

    existing = db.execute(
        _text("SELECT 1 FROM comment_likes WHERE user_id = :uid AND comment_id = :cid"),
        {"uid": current_user.id, "cid": comment_id},
    ).fetchone()

    if existing:
        db.execute(
            _text("DELETE FROM comment_likes WHERE user_id = :uid AND comment_id = :cid"),
            {"uid": current_user.id, "cid": comment_id},
        )
        db.execute(
            _text("UPDATE problem_comments SET likes = GREATEST(0, likes - 1) WHERE id = :cid"),
            {"cid": comment_id},
        )
        liked = False
    else:
        db.execute(
            _text("INSERT INTO comment_likes (user_id, comment_id) VALUES (:uid, :cid) ON CONFLICT DO NOTHING"),
            {"uid": current_user.id, "cid": comment_id},
        )
        db.execute(
            _text("UPDATE problem_comments SET likes = likes + 1 WHERE id = :cid"),
            {"cid": comment_id},
        )
        liked = True

    db.commit()
    new_likes = db.execute(
        _text("SELECT likes FROM problem_comments WHERE id = :cid"),
        {"cid": comment_id},
    ).fetchone().likes

    return {"liked": liked, "likes": new_likes}
