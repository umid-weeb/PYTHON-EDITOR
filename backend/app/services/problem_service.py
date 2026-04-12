from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

import redis
from sqlalchemy import case, func, or_
from sqlalchemy.orm import joinedload

from app.core.config import get_settings
from app.database import SessionLocal
from app.models.problem import Problem
from app.models.problem_translation import ProblemTranslation
from app.models.schemas import ProblemDetail, ProblemSummary
from app.models.submission import SolvedProblem, Submission
from app.services.problem_cache import ProblemCache
from app.services.problem_catalog import build_problem_order_map
from app.services.sql_problem_catalog import build_sql_problem_order_map


class ProblemNotFoundError(Exception):
    """Raised when a problem cannot be located."""


class ProblemService:
    def __init__(self) -> None:
        self.settings = get_settings()
        redis_client = None
        try:
            if self.settings.redis_url:
                candidate = redis.from_url(self.settings.redis_url, decode_responses=True)
                candidate.ping()
                redis_client = candidate
        except Exception:
            redis_client = None

        self.cache = ProblemCache(
            self.settings.cache_dir,
            ttl_seconds=self.settings.cache_ttl_seconds,
            redis_client=redis_client,
        )
        self._source_label = "database"

    def _catalog_ready(self) -> bool:
        try:
            from app.main import catalog_ready  # noqa: PLC0415

            return bool(catalog_ready.is_set())
        except Exception:
            return False

    @property
    def source_label(self) -> str:
        return self._source_label

    async def list_problems(self, force_refresh: bool = False) -> list[ProblemSummary]:
        order_map = build_combined_problem_order_map()
        visible_slugs = set(order_map)

        if not force_refresh and self._catalog_ready():
            cached = self.cache.load_index()
            if cached is not None and all(
                isinstance(item, dict) and item.get("slug") and item.get("order_index") is not None
                for item in cached
            ) and len(cached) == len(order_map):
                return [ProblemSummary.model_validate(item) for item in cached]

        with SessionLocal() as db:
            problems = db.query(Problem).filter(Problem.slug.in_(visible_slugs)).all()

        problems.sort(key=lambda problem: (order_map.get(problem.slug, 10**9), str(problem.slug)))

        items = [self._build_summary(problem) for problem in problems]
        if self._catalog_ready():
            self.cache.save_index([item.model_dump() for item in items])
        return items

    async def list_problem_page(
        self,
        *,
        page: int = 1,
        per_page: int = 200,
        query: str = "",
        tags: list[str] | None = None,
        difficulty: str | None = None,
        user_id: int | None = None,
        force_refresh: bool = False,
    ) -> dict[str, Any]:
        all_items = await self.list_problems(force_refresh=force_refresh)
        normalized_query = query.strip().lower()
        normalized_tags = [tag.strip().lower() for tag in (tags or []) if tag.strip()]
        normalized_difficulty = (difficulty or "").strip().lower()

        filtered = []
        for item in all_items:
            haystack = " ".join(
                [
                    str(item.order_index or ""),
                    item.id,
                    item.slug,
                    item.title,
                    item.preview or "",
                    *item.tags,
                ]
            ).lower()
            matches_query = not normalized_query or normalized_query in haystack
            matches_tags = not normalized_tags or all(
                tag in [problem_tag.lower() for problem_tag in item.tags]
                for tag in normalized_tags
            )
            matches_difficulty = (
                not normalized_difficulty
                or str(item.difficulty or "").strip().lower() == normalized_difficulty
            )
            if matches_query and matches_tags and matches_difficulty:
                filtered.append(item)

        # Get real-time metrics from solved_problems table (source of truth)
        acceptance_rates, solvers_counts, solved_ids, attempted_ids = self._load_problem_metrics_realtime(user_id=user_id)
        enriched = [
            item.model_copy(
                update={
                    "acceptance_rate": acceptance_rates.get(item.id),
                    "solvers_count": solvers_counts.get(item.id, 0),
                    "is_solved": item.id in solved_ids,
                    "is_attempted": item.id in attempted_ids,
                }
            )
            for item in filtered
        ]

        total = len(enriched)
        safe_per_page = max(1, min(per_page, 500))
        total_pages = max(1, (total + safe_per_page - 1) // safe_per_page)
        safe_page = min(max(1, page), total_pages)
        start = (safe_page - 1) * safe_per_page
        end = start + safe_per_page

        available_tags = sorted({tag for item in all_items for tag in item.tags if tag})

        return {
            "items": enriched[start:end],
            "total": total,
            "page": safe_page,
            "per_page": safe_per_page,
            "total_pages": total_pages,
            "query": query or None,
            "selected_tags": normalized_tags,
            "available_tags": available_tags,
        }

    def _load_problem_metrics(self, user_id: int | None = None) -> tuple[dict[str, int | None], set[str], set[str]]:
        acceptance_rates: dict[str, int | None] = {}
        solved_ids: set[str] = set()
        attempted_ids: set[str] = set()

        with SessionLocal() as db:
            acceptance_rates = {
                str(row.problem_id): int(round((int(row.accepted or 0) / int(row.total or 0)) * 100))
                if int(row.total or 0)
                else None
                for row in (
                    db.query(
                        Submission.problem_id,
                        func.count(Submission.id).label("total"),
                        func.sum(case((func.lower(Submission.verdict) == "accepted", 1), else_=0)).label("accepted"),
                    )
                    .filter(
                        Submission.problem_id.isnot(None),
                        Submission.mode == "submit",
                        Submission.status == "completed",
                    )
                    .group_by(Submission.problem_id)
                    .all()
                )
            }

            if user_id is not None:
                solved_ids = {
                    str(problem_id)
                    for (problem_id,) in db.query(SolvedProblem.problem_id).filter(SolvedProblem.user_id == user_id).all()
                }
                attempted_ids = {
                    str(problem_id)
                    for (problem_id,) in (
                        db.query(Submission.problem_id)
                        .filter(
                            Submission.user_id == user_id,
                            Submission.problem_id.isnot(None),
                            Submission.mode == "submit",
                        )
                        .distinct()
                        .all()
                    )
                }

        return acceptance_rates, solved_ids, attempted_ids

    def _load_problem_metrics_realtime(self, user_id: int | None = None) -> tuple[dict[str, int | None], dict[str, int], set[str], set[str]]:
        """Get real-time problem metrics from solved_problems table (source of truth)."""
        acceptance_rates: dict[str, int | None] = {}
        solvers_counts: dict[str, int] = {}
        solved_ids: set[str] = set()
        attempted_ids: set[str] = set()

        with SessionLocal() as db:
            # Get acceptance rates from submissions (this is still correct)
            # Use lower() on verdict to be case-insensitive ("Accepted" vs "accepted")
            acceptance_rates = {
                str(row.problem_id): int(round((int(row.accepted or 0) / int(row.total or 0)) * 100))
                if int(row.total or 0)
                else 0
                for row in (
                    db.query(
                        Submission.problem_id,
                        func.count(Submission.id).label("total"),
                        func.sum(
                            case(
                                (func.lower(func.coalesce(Submission.verdict, "")) == "accepted", 1),
                                else_=0
                            )
                        ).label("accepted"),
                    )
                    .filter(
                        Submission.problem_id.isnot(None),
                        Submission.mode == "submit",
                        Submission.status == "completed",
                    )
                    .group_by(Submission.problem_id)
                    .all()
                )
            }

            # Get unique solvers count from SolvedProblem table
            solvers_counts = {
                str(row.problem_id): int(row.count or 0)
                for row in (
                    db.query(
                        SolvedProblem.problem_id,
                        func.count(SolvedProblem.user_id).label("count")
                    )
                    .group_by(SolvedProblem.problem_id)
                    .all()
                )
            }

            # Get solved status from solved_problems table (source of truth)
            if user_id is not None:
                solved_ids = {
                    str(problem_id)
                    for (problem_id,) in db.query(SolvedProblem.problem_id).filter(SolvedProblem.user_id == user_id).all()
                }
                attempted_ids = {
                    str(problem_id)
                    for (problem_id,) in (
                        db.query(Submission.problem_id)
                        .filter(
                            Submission.user_id == user_id,
                            Submission.problem_id.isnot(None),
                            Submission.mode == "submit",
                        )
                        .distinct()
                        .all()
                    )
                }

        return acceptance_rates, solvers_counts, solved_ids, attempted_ids

    async def get_problem(self, problem_key: str, force_refresh: bool = False) -> ProblemDetail:
        bundle = await self.get_problem_bundle(problem_key, force_refresh=force_refresh)
        public_payload = dict(bundle)
        public_payload.pop("hidden_testcases", None)
        return ProblemDetail.model_validate(public_payload)

    async def get_problem_bundle(self, problem_key: str, force_refresh: bool = False) -> dict[str, Any]:
        order_map = build_combined_problem_order_map()

        if not force_refresh and self._catalog_ready():
            cached = self.cache.load_problem(problem_key)
            if (
                cached is not None
                and cached.get("slug") in order_map
                and cached.get("order_index") is not None
            ):
                return cached

        with SessionLocal() as db:
            problem = (
                db.query(Problem)
                .options(joinedload(Problem.test_cases))
                .filter(or_(Problem.slug == problem_key, Problem.id == problem_key))
                .first()
            )

        if problem is None or problem.slug not in order_map:
            raise ProblemNotFoundError(problem_key)

        bundle = self._build_problem_bundle(problem)
        if self._catalog_ready():
            self.cache.save_problem(problem.slug, bundle)
            if problem.slug != problem_key:
                self.cache.save_problem(problem_key, bundle)
        return bundle

    def _build_summary(self, problem: Problem) -> ProblemSummary:
        order_map = build_combined_problem_order_map()
        constraints = self._split_constraints(problem.constraints_text)
        tags = self._load_tags(problem.tags_json)
        preview = constraints[0] if constraints else (problem.input_format or None)

        return ProblemSummary(
            id=problem.id,
            slug=problem.slug,
            title=problem.title,
            order_index=order_map.get(problem.slug),
            difficulty=problem.difficulty.lower(),
            tags=tags,
            preview=preview,
            acceptance_rate=None,
            solvers_count=0,
            is_solved=False,
            time_limit_seconds=2.0,
            memory_limit_mb=256,
        )

    def _build_problem_bundle(self, problem: Problem) -> dict[str, Any]:
        order_map = build_combined_problem_order_map()
        visible_testcases = []
        hidden_testcases = []

        for index, test_case in enumerate(problem.test_cases, start=1):
            payload = {
                "name": f"Test {index}",
                "input": test_case.input.strip(),
                "expected_output": test_case.expected_output.strip(),
                "hidden": bool(test_case.is_hidden),
            }
            if test_case.is_hidden:
                hidden_testcases.append(payload)
            else:
                visible_testcases.append(payload)

        constraints = self._split_constraints(problem.constraints_text)
        tags = self._load_tags(problem.tags_json)

        return {
            "id": problem.id,
            "slug": problem.slug,
            "title": problem.title,
            "order_index": order_map.get(problem.slug),
            "difficulty": problem.difficulty.lower(),
            "description": problem.description,
            "starter_code": problem.starter_code,
            "function_name": problem.function_name or "solve",
            "input_format": problem.input_format,
            "output_format": problem.output_format,
            "constraints": constraints,
            "tags": tags,
            "time_limit_seconds": 2.0,
            "memory_limit_mb": 256,
            "visible_testcases": visible_testcases,
            "hidden_testcases": hidden_testcases,
            "hidden_testcase_count": len(hidden_testcases),
        }

    def _split_constraints(self, raw_value: str | None) -> list[str]:
        if not raw_value:
            return []
        return [line.strip() for line in str(raw_value).splitlines() if line.strip()]

    def _load_tags(self, raw_value: str | None) -> list[str]:
        if not raw_value:
            return []
        try:
            payload = json.loads(raw_value)
            if isinstance(payload, list):
                return [str(item).strip() for item in payload if str(item).strip()]
        except json.JSONDecodeError:
            pass
        return [item.strip() for item in str(raw_value).split(",") if item.strip()]

    def _get_problem_translation(self, problem: Problem, language_code: str = "uz") -> dict[str, Any]:
        """Get problem content in specified language with fallback to English."""
        with SessionLocal() as db:
            # Try to get the requested language first
            translation = db.query(ProblemTranslation).filter(
                ProblemTranslation.problem_id == problem.id,
                ProblemTranslation.language_code == language_code
            ).first()
            
            # If not found, fallback to English
            if not translation:
                translation = db.query(ProblemTranslation).filter(
                    ProblemTranslation.problem_id == problem.id,
                    ProblemTranslation.language_code == "en"
                ).first()
            
            # If still not found, use original problem content (backward compatibility)
            if not translation:
                return {
                    "title": problem.title,
                    "description": problem.description,
                    "input_format": problem.input_format,
                    "output_format": problem.output_format,
                    "constraints": problem.constraints_text,
                    "starter_code": problem.starter_code,
                    "language_code": "en"
                }
            
            return {
                "title": translation.title,
                "description": translation.description,
                "input_format": translation.input_format,
                "output_format": translation.output_format,
                "constraints": translation.constraints,
                "starter_code": translation.starter_code,
                "language_code": translation.language_code
            }

    def _build_summary_multilingual(self, problem: Problem, language_code: str = "uz") -> ProblemSummary:
        """Build problem summary with multilingual support."""
        order_map = build_combined_problem_order_map()
        translation = self._get_problem_translation(problem, language_code)
        constraints = self._split_constraints(translation["constraints"])
        tags = self._load_tags(problem.tags_json)
        preview = constraints[0] if constraints else (translation["input_format"] or None)

        return ProblemSummary(
            id=problem.id,
            slug=problem.slug,
            title=translation["title"],
            order_index=order_map.get(problem.slug),
            difficulty=problem.difficulty.lower(),
            tags=tags,
            preview=preview,
            acceptance_rate=None,
            solvers_count=0,
            is_solved=False,
            time_limit_seconds=2.0,
            memory_limit_mb=256,
            language_code=translation["language_code"]
        )

    def _build_problem_bundle_multilingual(self, problem: Problem, language_code: str = "uz") -> dict[str, Any]:
        """Build problem bundle with multilingual support."""
        order_map = build_combined_problem_order_map()
        translation = self._get_problem_translation(problem, language_code)
        visible_testcases = []
        hidden_testcases = []

        for index, test_case in enumerate(problem.test_cases, start=1):
            payload = {
                "name": f"Test {index}",
                "input": test_case.input.strip(),
                "expected_output": test_case.expected_output.strip(),
                "hidden": bool(test_case.is_hidden),
            }
            if test_case.is_hidden:
                hidden_testcases.append(payload)
            else:
                visible_testcases.append(payload)

        constraints = self._split_constraints(translation["constraints"])
        tags = self._load_tags(problem.tags_json)

        return {
            "id": problem.id,
            "slug": problem.slug,
            "title": translation["title"],
            "order_index": order_map.get(problem.slug),
            "difficulty": problem.difficulty.lower(),
            "description": translation["description"],
            "starter_code": translation["starter_code"],
            "function_name": problem.function_name or "solve",
            "input_format": translation["input_format"],
            "output_format": translation["output_format"],
            "constraints": constraints,
            "tags": tags,
            "time_limit_seconds": 2.0,
            "memory_limit_mb": 256,
            "visible_testcases": visible_testcases,
            "hidden_testcases": hidden_testcases,
            "hidden_testcase_count": len(hidden_testcases),
            "language_code": translation["language_code"]
        }


@lru_cache(maxsize=1)
def build_combined_problem_order_map() -> dict[str, int]:
    combined = dict(build_problem_order_map())
    combined.update(build_sql_problem_order_map())
    return combined


@lru_cache(maxsize=1)
def get_problem_service() -> ProblemService:
    return ProblemService()
