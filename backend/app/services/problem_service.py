from __future__ import annotations

import logging
import re
from dataclasses import replace
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
import redis

from app.core.config import get_settings
from app.judge.parser import parse_memory_limit_mb, parse_time_limit_seconds
from app.models.schemas import ProblemDetail, ProblemSummary
from app.services.github_client import ProblemSourceClient
from app.services.problem_cache import ProblemCache


class ProblemNotFoundError(Exception):
    """Raised when a problem cannot be located in the source repository."""


class ProblemService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.source = ProblemSourceClient(self.settings)
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
        self.logger = logging.getLogger("pyzone.arena.problem_service")
        self.hidden_source = None
        if self.settings.hidden_github_enabled:
            hidden_settings = replace(
                self.settings,
                github_owner=self.settings.hidden_github_owner,
                github_repo=self.settings.hidden_github_repo,
                github_branch=self.settings.hidden_github_branch,
                github_token=self.settings.hidden_github_token,
                github_problem_root=self.settings.hidden_github_problem_root,
            )
            self.hidden_source = ProblemSourceClient(hidden_settings)

    @property
    def source_label(self) -> str:
        return self.source.source_label

    async def list_problems(self, force_refresh: bool = False) -> list[ProblemSummary]:
        if not force_refresh:
            cached = self.cache.load_index()
            if cached is not None:
                return [ProblemSummary.model_validate(item) for item in cached]

        index_path = f"{self.settings.github_problem_root}/index.json"
        try:
            index_text = await self.source.read_text(index_path)
            index_payload = yaml.safe_load(index_text) if index_text.strip().startswith("{") is False else None
            if index_text.strip().startswith("{"):
                import json as _json
                index_payload = _json.loads(index_text)
            if index_payload and "items" in index_payload:
                problems = [
                    ProblemSummary.model_validate(item)
                    for item in index_payload.get("items", [])
                    if str(item.get("difficulty", "easy")).lower() == "easy"
                ]
                problems.sort(key=lambda item: item.title.lower())
                self.cache.save_index([item.model_dump() for item in problems])
                return problems
        except Exception:
            pass

        entries = await self.source.list_directory(self.settings.github_problem_root)
        problems: list[ProblemSummary] = []

        for entry in entries:
            if entry["type"] != "dir":
                continue

            summary = await self._load_problem_summary(entry["name"])
            if summary is not None and summary.difficulty.lower() == "easy":
                problems.append(summary)

        problems.sort(key=lambda item: item.title.lower())
        self.cache.save_index([item.model_dump() for item in problems])
        return problems

    async def list_problem_page(
        self,
        *,
        page: int = 1,
        per_page: int = 20,
        query: str = "",
        tags: list[str] | None = None,
        force_refresh: bool = False,
    ) -> dict[str, Any]:
        all_items = await self.list_problems(force_refresh=force_refresh)
        normalized_query = query.strip().lower()
        normalized_tags = [tag.strip().lower() for tag in (tags or []) if tag.strip()]

        filtered = []
        for item in all_items:
            haystack = " ".join(
                [
                    item.id,
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
            if matches_query and matches_tags:
                filtered.append(item)

        total = len(filtered)
        safe_per_page = max(1, min(per_page, 100))
        total_pages = max(1, (total + safe_per_page - 1) // safe_per_page)
        safe_page = min(max(1, page), total_pages)
        start = (safe_page - 1) * safe_per_page
        end = start + safe_per_page

        available_tags = sorted(
            {
                tag
                for item in all_items
                for tag in item.tags
                if tag
            }
        )

        return {
            "items": filtered[start:end],
            "total": total,
            "page": safe_page,
            "per_page": safe_per_page,
            "total_pages": total_pages,
            "query": query or None,
            "selected_tags": normalized_tags,
            "available_tags": available_tags,
        }

    async def get_problem(self, problem_id: str, force_refresh: bool = False) -> ProblemDetail:
        bundle = await self.get_problem_bundle(problem_id, force_refresh=force_refresh)
        public_payload = dict(bundle)
        public_payload.pop("hidden_testcases", None)
        return ProblemDetail.model_validate(public_payload)

    async def get_problem_bundle(
        self,
        problem_id: str,
        force_refresh: bool = False,
    ) -> dict[str, Any]:
        if not force_refresh:
            cached = self.cache.load_problem(problem_id)
            if cached is not None:
                return cached

        base_path = f"{self.settings.github_problem_root}/{problem_id}"

        try:
            metadata_text = await self.source.read_text(f"{base_path}/metadata.yaml")
            description = await self.source.read_text(f"{base_path}/problem.md")
            starter_code = await self.source.read_text(f"{base_path}/starter_code.py")
        except FileNotFoundError as error:
            raise ProblemNotFoundError(problem_id) from error

        metadata = yaml.safe_load(metadata_text) or {}
        visible_testcases = await self._load_testcases(problem_id, "visible")
        hidden_testcases = await self._load_hidden_testcases(problem_id)

        bundle = {
            "id": problem_id,
            "title": metadata.get("title") or self._humanize(problem_id),
            "difficulty": str(metadata.get("difficulty", "easy")).lower(),
            "description": description,
            "starter_code": starter_code,
            "function_name": metadata.get("function_name", "solve"),
            "input_format": metadata.get("input_format"),
            "output_format": metadata.get("output_format"),
            "constraints": self._normalize_list(metadata.get("constraints")),
            "tags": self._normalize_list(metadata.get("tags")),
            "time_limit_seconds": parse_time_limit_seconds(metadata.get("time_limit")),
            "memory_limit_mb": parse_memory_limit_mb(metadata.get("memory_limit")),
            "visible_testcases": visible_testcases,
            "hidden_testcases": hidden_testcases,
            "hidden_testcase_count": len(hidden_testcases),
        }

        self.cache.save_problem(problem_id, bundle)
        return bundle

    async def _load_problem_summary(self, problem_id: str) -> ProblemSummary | None:
        base_path = f"{self.settings.github_problem_root}/{problem_id}"
        try:
            metadata_text = await self.source.read_text(f"{base_path}/metadata.yaml")
        except FileNotFoundError:
            return None

        metadata = yaml.safe_load(metadata_text) or {}
        return ProblemSummary(
            id=problem_id,
            title=metadata.get("title") or self._humanize(problem_id),
            difficulty=str(metadata.get("difficulty", "easy")).lower(),
            tags=self._normalize_list(metadata.get("tags")),
            preview=self._build_preview(metadata),
            acceptance_rate=self._normalize_acceptance_rate(metadata.get("acceptance_rate")),
            is_solved=bool(metadata.get("is_solved", False)),
            time_limit_seconds=parse_time_limit_seconds(metadata.get("time_limit")),
            memory_limit_mb=parse_memory_limit_mb(metadata.get("memory_limit")),
        )

    async def _load_testcases(self, problem_id: str, visibility: str) -> list[dict[str, Any]]:
        directory = (
            f"{self.settings.github_problem_root}/{problem_id}/tests/{visibility}"
        )
        entries = await self.source.list_directory(directory)
        return await self._build_testcases_from_entries(entries, visibility, self.source)

    async def _load_hidden_testcases(self, problem_id: str) -> list[dict[str, Any]]:
        hidden_root = self.settings.hidden_test_root / problem_id / "tests" / "hidden"
        if hidden_root.exists():
            return self._load_hidden_testcases_from_local_root(hidden_root)

        if self.hidden_source is not None:
            directory = (
                f"{self.settings.hidden_github_problem_root}/{problem_id}/tests/hidden"
            )
            entries = await self.hidden_source.list_directory(directory)
            return await self._build_testcases_from_entries(
                entries,
                "hidden",
                self.hidden_source,
            )

        self.logger.warning(
            "Hidden testcase source not configured for problem_id=%s. Falling back to public problem source.",
            problem_id,
        )
        directory = (
            f"{self.settings.github_problem_root}/{problem_id}/tests/hidden"
        )
        entries = await self.source.list_directory(directory)
        return await self._build_testcases_from_entries(entries, "hidden", self.source)

    async def _build_testcases_from_entries(
        self,
        entries: list[dict[str, Any]],
        visibility: str,
        source_client: ProblemSourceClient,
    ) -> list[dict[str, Any]]:
        input_files: dict[str, str] = {}
        output_files: dict[str, str] = {}

        for entry in entries:
            if entry["type"] != "file":
                continue
            name = entry["name"]
            if name.startswith("input"):
                input_files[self._suffix(name, "input")] = entry["path"]
            if name.startswith("output"):
                output_files[self._suffix(name, "output")] = entry["path"]

        testcase_keys = sorted(
            set(input_files) & set(output_files),
            key=self._sort_suffix,
        )

        testcases: list[dict[str, Any]] = []
        for index, key in enumerate(testcase_keys, start=1):
            testcases.append(
                {
                    "name": f"Case {index}",
                    "input": (await source_client.read_text(input_files[key])).strip(),
                    "expected_output": (
                        await source_client.read_text(output_files[key])
                    ).strip(),
                    "hidden": visibility == "hidden",
                }
            )

        return testcases

    def _load_hidden_testcases_from_local_root(self, hidden_root: Path) -> list[dict[str, Any]]:
        input_files = {
            self._suffix(path.name, "input"): path
            for path in hidden_root.glob("input*.txt")
        }
        output_files = {
            self._suffix(path.name, "output"): path
            for path in hidden_root.glob("output*.txt")
        }
        testcase_keys = sorted(set(input_files) & set(output_files), key=self._sort_suffix)

        testcases: list[dict[str, Any]] = []
        for index, key in enumerate(testcase_keys, start=1):
            testcases.append(
                {
                    "name": f"Case {index}",
                    "input": input_files[key].read_text(encoding="utf-8").strip(),
                    "expected_output": output_files[key].read_text(encoding="utf-8").strip(),
                    "hidden": True,
                }
            )
        return testcases

    def _suffix(self, filename: str, prefix: str) -> str:
        return filename[len(prefix) :]

    def _sort_suffix(self, value: str) -> tuple[int, str]:
        match = re.search(r"(\d+)", value)
        return (int(match.group(1)) if match else 0, value)

    def _humanize(self, problem_id: str) -> str:
        return problem_id.replace("_", " ").replace("-", " ").title()

    def _normalize_list(self, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return [str(item).strip() for item in value if str(item).strip()]

    def _build_preview(self, metadata: dict[str, Any]) -> str | None:
        preview = metadata.get("preview")
        if preview:
            return str(preview).strip()

        constraints = self._normalize_list(metadata.get("constraints"))
        if constraints:
            return constraints[0]

        tags = self._normalize_list(metadata.get("tags"))
        if tags:
            return ", ".join(tags[:3])

        return None

    def _normalize_acceptance_rate(self, value: Any) -> int | None:
        if value is None:
            return None
        if isinstance(value, int):
            return value
        match = re.search(r"(\d+)", str(value))
        return int(match.group(1)) if match else None


@lru_cache(maxsize=1)
def get_problem_service() -> ProblemService:
    return ProblemService()
