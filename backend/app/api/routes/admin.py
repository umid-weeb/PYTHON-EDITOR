"""
Admin panel API routes.
Faqat is_admin=True foydalanuvchilar uchun.
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.routes.auth import get_admin_user, get_current_user
from app.database import get_db
from app.models.problem import Problem, TestCase
from app.models.user import User
from app.services.problem_service import get_problem_service, ProblemService

logger = logging.getLogger("pyzone.arena.admin")

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class TestCaseIn(BaseModel):
    input: str = Field(..., description="Test case input")
    expected_output: str = Field(..., description="Kutilgan natija")
    is_hidden: bool = False
    sort_order: int = 0


class TestCaseOut(BaseModel):
    id: int
    problem_id: str
    input: str
    expected_output: str
    is_hidden: bool
    sort_order: int

    class Config:
        from_attributes = True


class ProblemIn(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    slug: Optional[str] = Field(None, max_length=180, description="Bo'sh qoldirilsa avtomatik yaratiladi")
    difficulty: str = Field(..., pattern="^(easy|medium|hard)$")
    description: str = Field(..., min_length=10)
    input_format: Optional[str] = None
    output_format: Optional[str] = None
    constraints_text: Optional[str] = None
    starter_code: str = Field(default="def solve():\n    pass")
    function_name: str = Field(default="solve", max_length=64)
    tags: List[str] = Field(default_factory=list)
    leetcode_id: Optional[int] = None
    test_cases: List[TestCaseIn] = Field(default_factory=list)


class ProblemUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=255)
    slug: Optional[str] = Field(None, max_length=180)
    difficulty: Optional[str] = Field(None, pattern="^(easy|medium|hard)$")
    description: Optional[str] = None
    input_format: Optional[str] = None
    output_format: Optional[str] = None
    constraints_text: Optional[str] = None
    starter_code: Optional[str] = None
    function_name: Optional[str] = Field(None, max_length=64)
    tags: Optional[List[str]] = None
    leetcode_id: Optional[int] = None


class ProblemAdminSummary(BaseModel):
    id: str
    title: str
    slug: str
    difficulty: str
    tags: List[str]
    leetcode_id: Optional[int]
    test_case_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class ProblemAdminDetail(BaseModel):
    id: str
    title: str
    slug: str
    difficulty: str
    description: str
    input_format: Optional[str]
    output_format: Optional[str]
    constraints_text: Optional[str]
    starter_code: str
    function_name: str
    tags: List[str]
    leetcode_id: Optional[int]
    test_cases: List[TestCaseOut]
    created_at: datetime

    class Config:
        from_attributes = True


class SetAdminRequest(BaseModel):
    email: str
    is_admin: bool = True


class AdminStatsResponse(BaseModel):
    total_problems: int
    easy_count: int
    medium_count: int
    hard_count: int
    total_test_cases: int
    total_users: int
    admin_users: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _slug_from_title(title: str) -> str:
    """Title dan URL-friendly slug yaratadi."""
    slug = title.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = slug.strip("-")
    return slug[:180]


def _ensure_unique_slug(db: Session, slug: str, exclude_id: str | None = None) -> str:
    """Slug noyob bo'lishini ta'minlaydi, kerak bo'lsa raqam qo'shadi."""
    base = slug
    counter = 1
    while True:
        query = db.query(Problem.id).filter(Problem.slug == slug)
        if exclude_id:
            query = query.filter(Problem.id != exclude_id)
        if not query.first():
            return slug
        slug = f"{base}-{counter}"
        counter += 1


def _parse_tags(problem: Problem) -> List[str]:
    try:
        return json.loads(problem.tags_json or "[]")
    except Exception:
        return []


def _problem_to_summary(problem: Problem) -> ProblemAdminSummary:
    return ProblemAdminSummary(
        id=problem.id,
        title=problem.title,
        slug=problem.slug,
        difficulty=problem.difficulty,
        tags=_parse_tags(problem),
        leetcode_id=problem.leetcode_id,
        test_case_count=len(problem.test_cases),
        created_at=problem.created_at,
    )


def _problem_to_detail(problem: Problem) -> ProblemAdminDetail:
    return ProblemAdminDetail(
        id=problem.id,
        title=problem.title,
        slug=problem.slug,
        difficulty=problem.difficulty,
        description=problem.description,
        input_format=problem.input_format,
        output_format=problem.output_format,
        constraints_text=problem.constraints_text,
        starter_code=problem.starter_code,
        function_name=problem.function_name,
        tags=_parse_tags(problem),
        leetcode_id=problem.leetcode_id,
        test_cases=[
            TestCaseOut(
                id=tc.id,
                problem_id=tc.problem_id,
                input=tc.input,
                expected_output=tc.expected_output,
                is_hidden=tc.is_hidden,
                sort_order=tc.sort_order,
            )
            for tc in sorted(problem.test_cases, key=lambda t: t.sort_order)
        ],
        created_at=problem.created_at,
    )


def _invalidate_cache(problem_id: str | None = None) -> None:
    """Problem cache ni tozalaydi."""
    try:
        service = get_problem_service()
        service.cache.invalidate(problem_id)
    except Exception as exc:
        logger.warning("Cache invalidation failed: %s", exc)


# ---------------------------------------------------------------------------
# Dashboard stats
# ---------------------------------------------------------------------------

@router.get("/stats", response_model=AdminStatsResponse)
def admin_stats(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> AdminStatsResponse:
    from sqlalchemy import func
    from app.models.user import User as UserModel

    easy = db.query(Problem).filter(Problem.difficulty == "easy").count()
    medium = db.query(Problem).filter(Problem.difficulty == "medium").count()
    hard = db.query(Problem).filter(Problem.difficulty == "hard").count()
    total_tc = db.query(TestCase).count()
    total_users = db.query(UserModel).count()
    admin_users = db.query(UserModel).filter(UserModel.is_admin == True).count()  # noqa: E712

    return AdminStatsResponse(
        total_problems=easy + medium + hard,
        easy_count=easy,
        medium_count=medium,
        hard_count=hard,
        total_test_cases=total_tc,
        total_users=total_users,
        admin_users=admin_users,
    )


# ---------------------------------------------------------------------------
# Problem CRUD
# ---------------------------------------------------------------------------

@router.get("/problems", response_model=List[ProblemAdminSummary])
def list_admin_problems(
    q: str = "",
    difficulty: str = "",
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> List[ProblemAdminSummary]:
    """Barcha masalalar ro'yxati (admin uchun to'liq ma'lumot bilan)."""
    query = db.query(Problem)
    if q:
        query = query.filter(Problem.title.ilike(f"%{q}%"))
    if difficulty:
        query = query.filter(Problem.difficulty == difficulty.lower())
    problems = query.order_by(Problem.created_at.desc()).all()
    return [_problem_to_summary(p) for p in problems]


@router.get("/problems/{problem_id}", response_model=ProblemAdminDetail)
def get_admin_problem(
    problem_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> ProblemAdminDetail:
    """Bitta masalaning to'liq ma'lumotlari (tahrirlash uchun)."""
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Masala topilmadi.")
    return _problem_to_detail(problem)


@router.post("/problems", response_model=ProblemAdminDetail, status_code=201)
def create_problem(
    data: ProblemIn,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> ProblemAdminDetail:
    """Yangi masala yaratish."""
    # Slug: berilmagan bo'lsa title dan avtomatik
    raw_slug = data.slug or _slug_from_title(data.title)
    slug = _ensure_unique_slug(db, raw_slug)

    problem_id = str(uuid.uuid4())
    problem = Problem(
        id=problem_id,
        title=data.title,
        slug=slug,
        difficulty=data.difficulty,
        description=data.description,
        input_format=data.input_format,
        output_format=data.output_format,
        constraints_text=data.constraints_text,
        starter_code=data.starter_code,
        function_name=data.function_name,
        tags_json=json.dumps(data.tags, ensure_ascii=False),
        leetcode_id=data.leetcode_id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(problem)

    # Test case lar
    for i, tc in enumerate(data.test_cases):
        db.add(TestCase(
            problem_id=problem_id,
            input=tc.input,
            expected_output=tc.expected_output,
            is_hidden=tc.is_hidden,
            sort_order=tc.sort_order if tc.sort_order else i,
        ))

    db.commit()
    db.refresh(problem)
    _invalidate_cache()
    logger.info("Admin: yangi masala yaratildi id=%s slug=%s", problem_id, slug)
    return _problem_to_detail(problem)


@router.put("/problems/{problem_id}", response_model=ProblemAdminDetail)
def update_problem(
    problem_id: str,
    data: ProblemUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> ProblemAdminDetail:
    """Mavjud masalani yangilash."""
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Masala topilmadi.")

    if data.title is not None:
        problem.title = data.title
    if data.slug is not None:
        new_slug = _ensure_unique_slug(db, data.slug, exclude_id=problem_id)
        problem.slug = new_slug
    if data.difficulty is not None:
        problem.difficulty = data.difficulty
    if data.description is not None:
        problem.description = data.description
    if data.input_format is not None:
        problem.input_format = data.input_format
    if data.output_format is not None:
        problem.output_format = data.output_format
    if data.constraints_text is not None:
        problem.constraints_text = data.constraints_text
    if data.starter_code is not None:
        problem.starter_code = data.starter_code
    if data.function_name is not None:
        problem.function_name = data.function_name
    if data.tags is not None:
        problem.tags_json = json.dumps(data.tags, ensure_ascii=False)
    if data.leetcode_id is not None:
        problem.leetcode_id = data.leetcode_id

    db.commit()
    db.refresh(problem)
    _invalidate_cache()
    logger.info("Admin: masala yangilandi id=%s", problem_id)
    return _problem_to_detail(problem)


@router.delete("/problems/{problem_id}")
def delete_problem(
    problem_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> dict:
    """Masalani o'chirish (barcha test case va submissionlar bilan)."""
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Masala topilmadi.")
    db.delete(problem)
    db.commit()
    _invalidate_cache()
    logger.info("Admin: masala o'chirildi id=%s", problem_id)
    return {"deleted": True, "id": problem_id}


# ---------------------------------------------------------------------------
# Test Case CRUD
# ---------------------------------------------------------------------------

@router.post("/problems/{problem_id}/test-cases", response_model=TestCaseOut, status_code=201)
def add_test_case(
    problem_id: str,
    data: TestCaseIn,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> TestCaseOut:
    """Masalaga yangi test case qo'shish."""
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Masala topilmadi.")

    # sort_order: mavjud eng yuqori + 1
    existing_max = db.query(TestCase).filter(TestCase.problem_id == problem_id).count()
    tc = TestCase(
        problem_id=problem_id,
        input=data.input,
        expected_output=data.expected_output,
        is_hidden=data.is_hidden,
        sort_order=data.sort_order if data.sort_order else existing_max,
    )
    db.add(tc)
    db.commit()
    db.refresh(tc)
    return TestCaseOut(
        id=tc.id,
        problem_id=tc.problem_id,
        input=tc.input,
        expected_output=tc.expected_output,
        is_hidden=tc.is_hidden,
        sort_order=tc.sort_order,
    )


@router.put("/test-cases/{tc_id}", response_model=TestCaseOut)
def update_test_case(
    tc_id: int,
    data: TestCaseIn,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> TestCaseOut:
    """Test case ni yangilash."""
    tc = db.query(TestCase).filter(TestCase.id == tc_id).first()
    if not tc:
        raise HTTPException(status_code=404, detail="Test case topilmadi.")
    tc.input = data.input
    tc.expected_output = data.expected_output
    tc.is_hidden = data.is_hidden
    tc.sort_order = data.sort_order
    db.commit()
    db.refresh(tc)
    return TestCaseOut(
        id=tc.id,
        problem_id=tc.problem_id,
        input=tc.input,
        expected_output=tc.expected_output,
        is_hidden=tc.is_hidden,
        sort_order=tc.sort_order,
    )


@router.delete("/test-cases/{tc_id}")
def delete_test_case(
    tc_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> dict:
    """Test case ni o'chirish."""
    tc = db.query(TestCase).filter(TestCase.id == tc_id).first()
    if not tc:
        raise HTTPException(status_code=404, detail="Test case topilmadi.")
    db.delete(tc)
    db.commit()
    return {"deleted": True, "id": tc_id}


@router.post("/problems/{problem_id}/test-cases/bulk", response_model=List[TestCaseOut], status_code=201)
def bulk_replace_test_cases(
    problem_id: str,
    test_cases: List[TestCaseIn],
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> List[TestCaseOut]:
    """
    Masalaning barcha test case larini to'liq almashtirish.
    AI generate qilgandan keyin bir marta yuboriladi.
    """
    problem = db.query(Problem).filter(Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Masala topilmadi.")

    # Eski test case larni o'chirish
    db.query(TestCase).filter(TestCase.problem_id == problem_id).delete()

    # Yangilarini qo'shish
    result = []
    for i, tc_data in enumerate(test_cases):
        tc = TestCase(
            problem_id=problem_id,
            input=tc_data.input,
            expected_output=tc_data.expected_output,
            is_hidden=tc_data.is_hidden,
            sort_order=i,
        )
        db.add(tc)
        db.flush()
        result.append(TestCaseOut(
            id=tc.id,
            problem_id=tc.problem_id,
            input=tc.input,
            expected_output=tc.expected_output,
            is_hidden=tc.is_hidden,
            sort_order=tc.sort_order,
        ))

    db.commit()
    return result


# ---------------------------------------------------------------------------
# Admin user management
# ---------------------------------------------------------------------------

@router.post("/set-admin")
def set_admin(
    data: SetAdminRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
) -> dict:
    """Email orqali foydalanuvchiga admin huquqi berish yoki olish."""
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"Foydalanuvchi topilmadi: {data.email}")
    user.is_admin = data.is_admin
    db.commit()
    action = "berildi" if data.is_admin else "olindi"
    logger.info("Admin huquqi %s: %s (id=%s)", action, data.email, user.id)
    return {
        "message": f"Admin huquqi {action}.",
        "user_id": user.id,
        "username": user.username,
        "email": user.email,
        "is_admin": user.is_admin,
    }


@router.post("/activate-self")
def activate_self_as_admin(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Birinchi marta admin yaratish uchun maxsus endpoint.
    Faqat hech qanday admin yo'q bo'lsa ishlaydi.
    ADMIN_BOOTSTRAP_EMAIL env variable bilan cheklangan.
    """
    import os
    bootstrap_email = os.getenv("ADMIN_BOOTSTRAP_EMAIL", "isroilov0705@gmail.com")

    if current_user.email != bootstrap_email:
        raise HTTPException(
            status_code=403,
            detail="Bu endpoint faqat asosiy admin email uchun.",
        )

    # Hech qanday admin yo'qmi tekshirish
    admin_count = db.query(User).filter(User.is_admin == True).count()  # noqa: E712
    if admin_count > 0 and not current_user.is_admin:
        raise HTTPException(
            status_code=403,
            detail="Admin allaqachon mavjud. /api/admin/set-admin endpoint ni ishlating.",
        )

    current_user.is_admin = True
    db.commit()
    logger.info("Asosiy admin aktivlashtirildi: %s (id=%s)", current_user.email, current_user.id)
    return {
        "message": "Admin muvaffaqiyatli aktivlashtirildi!",
        "user_id": current_user.id,
        "username": current_user.username,
        "is_admin": True,
    }
