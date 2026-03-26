from __future__ import annotations

import asyncio
import threading
from functools import lru_cache
import logging

from sqlalchemy import or_

from app.core.config import get_settings
from app.judge.runner import JudgeRunner
from app.models.problem import Problem
from app.models.schemas import SubmissionRequest
from app.models.submission_stats import UserSubmission
from app.models.contest import ContestEntry, ContestSubmission
from app.models.user import User
from app.repositories.submissions import SubmissionRepository
from app.services.problem_service import ProblemService, get_problem_service
from app.database import SessionLocal
from app.services.engagement_service import engagement_service
from app.services.rating_service import rating_service
from app.services.user_stats_service import user_stats_service


class SubmissionService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.repository = SubmissionRepository(self.settings.submissions_db_path)
        self.problem_service: ProblemService = get_problem_service()
        self.judge = JudgeRunner(self.settings)
        self.logger = logging.getLogger("pyzone.arena.submission")

    @staticmethod
    def _resolve_problem_id(db, problem_key: str) -> str:
        problem_id = (
            db.query(Problem.id)
            .filter(or_(Problem.id == problem_key, Problem.slug == problem_key))
            .scalar()
        )
        return str(problem_id or problem_key)

    def create_submission(self, payload: SubmissionRequest, mode: str, user_id: int | None = None) -> str:
        submission_id = self.repository.create(
            problem_id=payload.problem_id,
            code=payload.code,
            language=payload.language,
            mode=mode,
        )
        self.logger.info(
            "submission.created id=%s problem=%s mode=%s inline=%s",
            submission_id,
            payload.problem_id,
            mode,
            self.settings.use_inline_execution,
        )
        if user_id is not None and mode == "submit":
            with SessionLocal() as db:
                canonical_problem_id = self._resolve_problem_id(db, payload.problem_id)
                user_stats_service.record_submission(
                    db,
                    external_submission_id=submission_id,
                    user_id=user_id,
                    problem_id=canonical_problem_id,
                    code=payload.code,
                    language=payload.language,
                    status="pending",
                )
                record = UserSubmission(
                    user_id=user_id,
                    problem_id=canonical_problem_id,
                    submission_id=submission_id,
                    language=payload.language,
                    verdict=None,
                    runtime_ms=None,
                    memory_kb=None,
                )
                db.add(record)
                if payload.contest_id:
                    # Ensure the user is registered as a contest entry.
                    exists = (
                        db.query(ContestEntry)
                        .filter(ContestEntry.contest_id == payload.contest_id, ContestEntry.user_id == user_id)
                        .first()
                    )
                    if not exists:
                        db.add(ContestEntry(contest_id=payload.contest_id, user_id=user_id))
                    db.add(
                        ContestSubmission(
                            contest_id=payload.contest_id,
                            user_id=user_id,
                            problem_id=canonical_problem_id,
                            submission_id=submission_id,
                            verdict=None,
                            runtime_ms=None,
                            memory_kb=None,
                        )
                    )
                db.commit()
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
        submission = self.repository.get(submission_id)
        if submission is None:
            return

        self.repository.mark_running(submission_id)
        try:
            problem_bundle = asyncio.run(
                self.problem_service.get_problem_bundle(submission["problem_id"])
            )
            result = self.judge.run_submission(
                problem=problem_bundle,
                code=submission["code"],
                mode=submission["mode"],
            )
            self.repository.complete(submission_id, result)
            self.logger.info(
                "submission.completed id=%s verdict=%s runtime_ms=%s memory_kb=%s passed=%s/%s",
                submission_id,
                result.get("verdict"),
                result.get("runtime_ms"),
                result.get("memory_kb"),
                result.get("passed_count"),
                result.get("total_count"),
            )
            if submission.get("mode") == "submit":
                with SessionLocal() as db:
                    tracked_submission = None
                    record = None
                    stats_user_id = None
                    accepted_submission = False
                    accepted_problem_id = None
                    accepted_runtime = None
                    accepted_memory = None
                    accepted_solved_at = None

                    try:
                        tracked_submission = user_stats_service.finalize_submission(
                            db,
                            external_submission_id=submission_id,
                            verdict=result.get("verdict"),
                            runtime_ms=result.get("runtime_ms"),
                            memory_kb=result.get("memory_kb"),
                            error_text=result.get("error_text"),
                        )
                        record = user_stats_service.sync_submission_history(db, tracked_submission) if tracked_submission else None

                        if record:
                            contest_row = (
                                db.query(ContestSubmission)
                                .filter(ContestSubmission.submission_id == submission_id)
                                .first()
                            )
                            if contest_row:
                                contest_row.verdict = record.verdict
                                contest_row.runtime_ms = record.runtime_ms
                                contest_row.memory_kb = record.memory_kb

                            stats_user_id = record.user_id
                            accepted_submission = (record.verdict or "").strip().lower() == "accepted"
                            accepted_problem_id = record.problem_id
                            accepted_runtime = record.runtime_ms
                            accepted_memory = record.memory_kb
                            accepted_solved_at = tracked_submission.created_at if tracked_submission else None
                        elif tracked_submission and tracked_submission.user_id is not None:
                            stats_user_id = int(tracked_submission.user_id)
                            accepted_submission = (tracked_submission.verdict or "").strip().lower() == "accepted"
                            accepted_problem_id = str(tracked_submission.problem_id) if tracked_submission.problem_id else None
                            accepted_runtime = int(round(tracked_submission.runtime)) if tracked_submission.runtime is not None else None
                            accepted_memory = tracked_submission.memory_kb
                            accepted_solved_at = tracked_submission.created_at

                        if accepted_submission and stats_user_id and accepted_problem_id:
                            user_stats_service.record_accepted_progress(
                                db,
                                user_id=stats_user_id,
                                problem_id=accepted_problem_id,
                                runtime_ms=accepted_runtime,
                                memory_kb=accepted_memory,
                                solved_at=accepted_solved_at,
                            )
                        elif stats_user_id:
                            user = db.query(User).filter(User.id == stats_user_id).first()
                            if user is not None:
                                engagement_service.touch_last_active(db, user)

                        if stats_user_id:
                            user_stats_service.rebuild(db, stats_user_id)

                        db.commit()
                    except Exception:
                        db.rollback()
                        raise

                    if stats_user_id and record:
                        try:
                            rating_service.on_submission_result(
                                db,
                                user_id=record.user_id,
                                problem_id=record.problem_id,
                                submission_id=record.submission_id,
                                verdict=record.verdict,
                            )
                            if accepted_submission:
                                engagement_service.update_streak_for_accept(db, stats_user_id)
                            db.commit()
                        except Exception as side_effect_error:
                            db.rollback()
                            self.logger.exception(
                                "submission.side_effect_failed id=%s user_id=%s error=%s",
                                submission_id,
                                stats_user_id,
                                side_effect_error,
                            )
                    elif stats_user_id and accepted_submission:
                        try:
                            engagement_service.update_streak_for_accept(db, stats_user_id)
                            db.commit()
                        except Exception as side_effect_error:
                            db.rollback()
                            self.logger.exception(
                                "submission.streak_failed id=%s user_id=%s error=%s",
                                submission_id,
                                stats_user_id,
                                side_effect_error,
                            )
        except Exception as error:
            self.repository.mark_failed(submission_id, str(error))
            self.logger.exception("submission.failed id=%s error=%s", submission_id, error)
            if submission.get("mode") == "submit":
                with SessionLocal() as db:
                    tracked_submission = user_stats_service.finalize_submission(
                        db,
                        external_submission_id=submission_id,
                        verdict="Runtime Error",
                        runtime_ms=None,
                        memory_kb=None,
                        error_text=str(error),
                    )
                    record = user_stats_service.sync_submission_history(db, tracked_submission) if tracked_submission else None
                    if record:
                        contest_row = (
                            db.query(ContestSubmission)
                            .filter(ContestSubmission.submission_id == submission_id)
                            .first()
                        )
                        if contest_row:
                            contest_row.verdict = "Runtime Error"
                            contest_row.runtime_ms = None
                            contest_row.memory_kb = None
                    db.commit()

    def get_submission(self, submission_id: str) -> dict | None:
        return self.repository.get(submission_id)


@lru_cache(maxsize=1)
def get_submission_service() -> SubmissionService:
    return SubmissionService()
