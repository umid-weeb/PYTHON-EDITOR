from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text

from app.core.config import get_settings
from app.database import engine
from app.services.problem_service import ProblemService, get_problem_service


router = APIRouter(tags=["health"])


def _db_ping() -> dict:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {
        "status": "ok",
        "dialect": engine.dialect.name,
    }


@router.get("/health", methods=["GET", "HEAD"])
async def health(
    service: ProblemService = Depends(get_problem_service),
) -> dict:
    settings = get_settings()
    return {
        "status": "ok",
        "api_prefix": settings.api_prefix,
        "problem_source": service.source_label,
        "hidden_source": (
            f"local:{settings.hidden_test_root}"
            if settings.hidden_test_root.exists()
            else (
                f"github:{settings.hidden_github_owner}/{settings.hidden_github_repo}"
                if settings.hidden_github_enabled
                else "fallback-public"
            )
        ),
        "db": _db_ping(),
        "cache": service.cache.status(),
    }


@router.get("/health/db")
async def health_db() -> dict:
    return _db_ping()


@router.get("/health/cache")
async def health_cache(
    service: ProblemService = Depends(get_problem_service),
) -> dict:
    return {
        "status": "ok",
        **service.cache.status(),
    }
