from __future__ import annotations

import asyncio
import logging
import threading
from functools import lru_cache
from typing import Any

from app.core.config import get_settings
from app.database import SessionLocal
from app.judge.runner import JudgeRunner
from app.models.contest import ContestEntry, ContestSubmission
from app.models.schemas import SubmissionRequest
from app.repositories.submission_tracking import submission_tracking_repository
from app.services.engagement_service import engagement_service
from app.services.problem_service import ProblemService, get_problem_service
from app.services.profile_service import profile_service
from app.services.rating_service import rating_service


class SubmissionProblemNotFoundError(Exception):
    """Raised when the referenced problem cannot be found."""


class SubmissionService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.repository = submission_tracking_repository
        self.problem_service: ProblemService = get_problem_service()
        self.judge = JudgeRunner(self.settings)
        self.logger = logging.getLogger("pyzone.arena.submission")

    def create_submission(self, payload: SubmissionRequest, mode: str, user_id: int | None = None) -> str:
        if mode == "submit" and user_id is None:
            raise PermissionError("Authenticated user required for submit mode")

        with SessionLocal() as db:
            problem = self.repository.resolve_problem(db, payload.problem_id)
            if problem is None:
                raise SubmissionProblemNotFoundError(payload.problem_id)

            submission = self.repository.create_submission(
                db,
                user_id=user_id,
                problem_id=problem.id,
                code=payload.code,
                language=payload.language,
                mode=mode,
            )

            if payload.contest_id and user_id is not None and mode == "submit":
                registration = (
                    db.query(ContestEntry)
                    .filter(ContestEntry.contest_id == payload.contest_id, ContestEntry.user_id == user_id)
                    .first()
                )
                if registration is None:
                    db.add(ContestEntry(contest_id=payload.contest_id, user_id=user_id))
                db.add(
                    ContestSubmission(
                        contest_id=payload.contest_id,
                        user_id=user_id,
                        problem_id=problem.id,
                        submission_id=str(submission.id),
                    )
                )

            submission_id = str(submission.id)
            problem_slug = str(problem.slug)
            db.commit()

        self.logger.info(
            "submission.created id=%s problem=%s mode=%s inline=%s",
            submission_id,
            problem_slug,
            mode,
            self.settings.use_inline_execution,
        )
        return submission_id

    def enqueue_submission(self, submission_id: str) -> None:
        if self.settings.use_inline_execution:
            worker = threading.Thread(
                target=self.process_submission,
                args=(submission_id,),
                daemon=True,
            )
            worker.start()
            return

        try:
            from app.worker.tasks import process_submission_task

            process_submission_task.delay(submission_id)
            self.logger.info("submission.enqueued id=%s backend=celery", submission_id)
        except Exception:
            worker = threading.Thread(
                target=self.process_submission,
                args=(submission_id,),
                daemon=True,
            )
            worker.start()
            self.logger.warning("submission.celery_fallback id=%s running_inline", submission_id)

    def process_submission(self, submission_id: str) -> None:
        try:
            payload = self._prepare_for_execution(int(submission_id))
            if payload is None:
                return

            problem_bundle = asyncio.run(
                self.problem_service.get_problem_bundle(payload["problem_id"], force_refresh=True)
            )
            problem_bundle["language"] = payload["language"]

            result = self.judge.run_submission(
                problem=problem_bundle,
                code=payload["code"],
                mode=payload["mode"],
            )

            finalized = self._finalize_success(int(submission_id), result)
            if finalized is None:
                return

            self.logger.info(
                "submission.completed id=%s verdict=%s runtime_ms=%s memory_kb=%s passed=%s/%s first_solve=%s",
                submission_id,
                result.get("verdict"),
                result.get("runtime_ms"),
                result.get("memory_kb"),
                result.get("passed_count"),
                result.get("total_count"),
                finalized["first_solve"],
            )
        except Exception as error:
            self.logger.exception("submission.failed id=%s error=%s", submission_id, error)
            self._finalize_failure(int(submission_id), str(error))

    def get_submission(self, submission_id: str) -> dict[str, Any] | None:
        with SessionLocal() as db:
            row = self.repository.get_submission(db, int(submission_id))
            if row is None:
                return None
            return profile_service.serialize_submission_status(row)

    def get_submission_for_user(self, submission_id: str, user_id: int | None = None) -> dict[str, Any] | None:
        with SessionLocal() as db:
            row = self.repository.get_submission(db, int(submission_id))
            if row is None:
                return None
            if row.user_id is not None and user_id is not None and int(row.user_id) != int(user_id):
                return None
            if row.user_id is not None and user_id is None:
                return None
            return profile_service.serialize_submission_status(row)

    def _prepare_for_execution(self, submission_id: int) -> dict[str, Any] | None:
        with SessionLocal() as db:
            submission = self.repository.get_submission(db, submission_id, lock=True)
            if submission is None:
                return None
            normalized_status = str(submission.status or "").strip().lower()
            if normalized_status != "pending":
                return None

            self.repository.mark_running(db, submission_id)
            payload = {
                "problem_id": str(submission.problem_id),
                "user_id": submission.user_id,
                "code": submission.code,
                "language": submission.language,
                "mode": submission.mode,
            }
            db.commit()
            return payload

    def _finalize_success(self, submission_id: int, result: dict[str, Any]) -> dict[str, Any] | None:
        side_effects: dict[str, Any] = {}

        with SessionLocal() as db:
            finalized = self.repository.finalize_submission(
                db,
                submission_id=submission_id,
                verdict=result.get("verdict"),
                runtime_ms=result.get("runtime_ms"),
                memory_kb=result.get("memory_kb"),
                error_text=result.get("error_text"),
                passed_count=result.get("passed_count"),
                total_count=result.get("total_count"),
                case_results=result.get("case_results"),
            )
            if finalized is None:
                return None

            submission = finalized.submission
            if submission.user_id is not None:
                user = self.repository.get_user(db, int(submission.user_id))
                if user is not None:
                    engagement_service.touch_last_active(db, user)

            self._sync_contest_submission(
                db,
                submission_id=str(submission.id),
                verdict=submission.verdict,
                runtime_ms=submission.runtime_ms,
                memory_kb=submission.memory_kb,
                is_first_solve=finalized.first_solve,
                is_accepted=(submission.verdict or "").strip().lower() == "accepted",
            )

            side_effects = {
                "user_id": int(submission.user_id) if submission.user_id is not None else None,
                "problem_id": str(submission.problem_id),
                "verdict": submission.verdict,
                "submission_id": str(submission.id),
                "first_solve": finalized.first_solve,
            }
            db.commit()

        if side_effects.get("first_solve") and side_effects.get("user_id"):
            self._run_first_solve_side_effects(
                user_id=int(side_effects["user_id"]),
                problem_id=str(side_effects["problem_id"]),
                submission_id=str(side_effects["submission_id"]),
                verdict=side_effects.get("verdict"),
            )

        return side_effects

    def _finalize_failure(self, submission_id: int, error_text: str) -> None:
        with SessionLocal() as db:
            finalized = self.repository.finalize_submission(
                db,
                submission_id=submission_id,
                verdict="Runtime Error",
                runtime_ms=None,
                memory_kb=None,
                error_text=error_text,
                passed_count=0,
                total_count=None,
                case_results=[],
            )
            if finalized is None:
                return

            submission = finalized.submission
            if submission.user_id is not None:
                user = self.repository.get_user(db, int(submission.user_id))
                if user is not None:
                    engagement_service.touch_last_active(db, user)

            self._sync_contest_submission(
                db,
                submission_id=str(submission.id),
                verdict=submission.verdict,
                runtime_ms=submission.runtime_ms,
                memory_kb=submission.memory_kb,
                is_first_solve=False,
                is_accepted=False,
            )
            db.commit()

    def _run_first_solve_side_effects(
        self,
        *,
        user_id: int,
        problem_id: str,
        submission_id: str,
        verdict: str | None,
    ) -> None:
        with SessionLocal() as db:
            try:
                rating_service.on_submission_result(
                    db,
                    user_id=user_id,
                    problem_id=problem_id,
                    submission_id=submission_id,
                    verdict=verdict,
                    is_first_solve=True,
                )
                engagement_service.update_streak_for_accept(db, user_id)
                db.commit()
            except Exception as side_effect_error:
                db.rollback()
                self.logger.exception(
                    "submission.side_effect_failed submission_id=%s user_id=%s error=%s",
                    submission_id,
                    user_id,
                    side_effect_error,
                )

    @staticmethod
    def _sync_contest_submission(
        db,
        *,
        submission_id: str,
        verdict: str | None,
        runtime_ms: int | None,
        memory_kb: int | None,
        is_first_solve: bool,
        is_accepted: bool,
    ) -> None:
        contest_row = db.query(ContestSubmission).filter(ContestSubmission.submission_id == submission_id).first()
        if contest_row is None:
            return
        contest_row.verdict = verdict
        contest_row.runtime_ms = runtime_ms
        contest_row.memory_kb = memory_kb
        contest_row.is_first_solve = bool(is_first_solve)
        contest_row.is_accepted = bool(is_accepted)
        db.flush()


@lru_cache(maxsize=1)
def get_submission_service() -> SubmissionService:
    return SubmissionService()
