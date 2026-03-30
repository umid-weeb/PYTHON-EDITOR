from __future__ import annotations

import asyncio
import logging
import threading
import time
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
from app.services.user_stats_service import user_stats_service


class SubmissionProblemNotFoundError(Exception):
    """Raised when the referenced problem cannot be found."""


class SubmissionService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.repository = submission_tracking_repository
        self.problem_service: ProblemService = get_problem_service()
        self.judge = JudgeRunner(self.settings)
        self.logger = logging.getLogger("pyzone.arena.submission")
        self._recovery_stop = threading.Event()
        self._recovery_thread: threading.Thread | None = None
        self._scheduled_submissions: set[str] = set()
        self._scheduled_lock = threading.Lock()

    def create_submission(self, payload: SubmissionRequest, mode: str, user_id: int | None = None) -> str:
        if mode == "submit" and user_id is None:
            raise PermissionError("Authenticated user required for submit mode")

        with SessionLocal() as db:
            problem = self.repository.resolve_problem(db, payload.problem_id)
            if problem is None:
                raise SubmissionProblemNotFoundError(payload.problem_id)

            # AUTO-HEAL: Ensure user stats and rating records exist before submission
            if user_id is not None:
                try:
                    user_stats_service.get_or_create(db, user_id)
                    rating_service.get_or_create(db, user_id)
                except Exception as e:
                    self.logger.warning("submission.auto_heal_failed id=%s user=%s error=%s", payload.problem_id, user_id, str(e))

            submission = self.repository.create_submission(
                db,
                user_id=user_id,
                problem_id=problem.id,
                code=payload.code,
                language=payload.language,
                mode=mode,
                is_extended=payload.is_extended,
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
            self._schedule_processing(submission_id, reason="inline")
            return

        try:
            from app.worker.tasks import process_submission_task

            process_submission_task.delay(submission_id)
            self.logger.info("submission.enqueued id=%s backend=celery", submission_id)
        except Exception:
            self.logger.warning("submission.celery_fallback id=%s running_inline", submission_id)
            self._schedule_processing(submission_id, reason="celery-fallback")
            return

        self._schedule_processing(
            submission_id,
            reason="watchdog",
            delay_seconds=self.settings.submission_watchdog_delay_seconds,
            recover_stale=True,
        )

    def process_submission(self, submission_id: str, *, recover_stale: bool = False) -> None:
        try:
            payload = self._prepare_for_execution(int(submission_id), recover_stale=recover_stale)
            if payload is None:
                return

            # Better loop handling for background threads:
            # We always want a fresh loop in our dedicated thread to avoid deadlock.
            self.logger.info("submission.processing_start id=%s problem=%s", submission_id, payload["problem_id"])
            try:
                # Use a specific asyncio utility to run the coroutine in a sync context
                # and handle both cases: no loop (common for background thread) and 
                # accidental loop (if someone called this from an async context).
                problem_bundle = asyncio.run(
                    self.problem_service.get_problem_bundle(payload["problem_id"], force_refresh=True)
                )
            except RuntimeError as loop_error:
                # Fallback if asyncio.run fails due to an already running loop - though this is rare in our thread
                self.logger.warning("submission.async_run_fallback id=%s reason=%s", submission_id, loop_error)
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    problem_bundle = asyncio.run_coroutine_threadsafe(
                        self.problem_service.get_problem_bundle(payload["problem_id"], force_refresh=True),
                        loop
                    ).result()
                else:
                    problem_bundle = loop.run_until_complete(
                        self.problem_service.get_problem_bundle(payload["problem_id"], force_refresh=True)
                    )
            
            problem_bundle["language"] = payload["language"]

            # PRE-FLIGHT CHECK: Verify test cases exist to avoid "silent" failures
            all_cases = problem_bundle.get("visible_testcases", []) + problem_bundle.get("hidden_testcases", [])
            if not all_cases:
                self.logger.error("submission.config_error id=%s problem=%s error=no_test_cases", submission_id, payload["problem_id"])
                self._finalize_failure(int(submission_id), "System Error: Ushbu masala uchun testlar topilmadi. Iltimos, administratorga xabar bering.")
                return

            self.logger.info("submission.judge_running id=%s mode=%s cases=%s extended=%s", submission_id, payload["mode"], len(all_cases), payload.get("is_extended", False))
            result = self.judge.run_submission(
                problem=problem_bundle,
                code=payload["code"],
                mode=payload["mode"],
                is_extended=payload.get("is_extended", False),
            )

            finalized = self._finalize_success(int(submission_id), result)
            if finalized is None:
                self.logger.warning("submission.finalize_skipped id=%s", submission_id)
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
            self._ensure_submission_processing(row)
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
            self._ensure_submission_processing(row)
            return profile_service.serialize_submission_status(row)

    def _prepare_for_execution(self, submission_id: int, *, recover_stale: bool = False) -> dict[str, Any] | None:
        with SessionLocal() as db:
            submission = self.repository.claim_submission_for_processing(
                db,
                submission_id,
                recover_running_after_seconds=(
                    self.settings.submission_recovery_stale_after_seconds if recover_stale else None
                ),
            )
            if submission is None:
                return None
            payload = {
                "problem_id": str(submission.problem_id),
                "user_id": submission.user_id,
                "code": submission.code,
                "language": submission.language,
                "mode": submission.mode,
                "is_extended": getattr(submission, "is_extended", False),
            }
            db.commit()
            return payload

    def recover_stale_submissions(
        self,
        *,
        limit: int | None = None,
        stale_after_seconds: int | None = None,
    ) -> list[str]:
        safe_limit = max(1, int(limit or self.settings.submission_recovery_batch_size))
        safe_stale_after = max(
            0,
            int(
                stale_after_seconds
                if stale_after_seconds is not None
                else self.settings.submission_recovery_stale_after_seconds
            ),
        )

        with SessionLocal() as db:
            stale_ids = self.repository.list_stale_submission_ids(
                db,
                stale_after_seconds=safe_stale_after,
                limit=safe_limit,
            )

        processed: list[str] = []
        for submission_id in stale_ids:
            submission_key = str(submission_id)
            self.process_submission(submission_key, recover_stale=True)
            processed.append(submission_key)
        return processed

    def start_recovery_loop(self) -> None:
        if self._recovery_thread and self._recovery_thread.is_alive():
            return

        self._recovery_stop.clear()
        self._recovery_thread = threading.Thread(
            target=self._recovery_worker,
            name="arena-submission-recovery",
            daemon=True,
        )
        self._recovery_thread.start()

    def stop_recovery_loop(self) -> None:
        self._recovery_stop.set()
        if self._recovery_thread and self._recovery_thread.is_alive():
            self._recovery_thread.join(timeout=2.0)
        self._recovery_thread = None

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

            # CRITICAL FIX: Handle accepted submissions with proper transaction safety
            is_accepted = (submission.verdict or "").strip().lower() == "accepted"
            first_solve = False
            
            if is_accepted and submission.user_id is not None:
                # Use the new safe function that handles idempotency and proper stats updates
                first_solve = self.repository.record_solved_problem_safe(
                    db,
                    user_id=int(submission.user_id),
                    problem_id=str(submission.problem_id),
                    solved_at=submission.created_at,
                    created_by="submission_service"
                )
                self.logger.info(
                    "submission.accepted user_id=%s problem_id=%s inserted=%s",
                    submission.user_id,
                    submission.problem_id,
                    first_solve
                )

            self._sync_contest_submission(
                db,
                submission_id=str(submission.id),
                verdict=submission.verdict,
                runtime_ms=submission.runtime_ms,
                memory_kb=submission.memory_kb,
                is_first_solve=first_solve,
                is_accepted=is_accepted,
            )

            side_effects = {
                "user_id": int(submission.user_id) if submission.user_id is not None else None,
                "problem_id": str(submission.problem_id),
                "verdict": submission.verdict,
                "submission_id": str(submission.id),
                "first_solve": first_solve,
                "is_accepted": is_accepted,
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
                submission = self.repository.get_submission(db, int(submission_id))
                engagement_service.update_streak_for_accept(
                    db,
                    user_id,
                    solved_at=submission.created_at if submission is not None else None,
                )
                db.commit()
            except Exception as side_effect_error:
                db.rollback()
                self.logger.exception(
                    "submission.side_effect_failed submission_id=%s user_id=%s error=%s",
                    submission_id,
                    user_id,
                    side_effect_error,
                )

    def _schedule_processing(
        self,
        submission_id: str,
        *,
        reason: str,
        delay_seconds: float = 0.0,
        recover_stale: bool = False,
    ) -> bool:
        submission_key = str(submission_id)
        with self._scheduled_lock:
            if submission_key in self._scheduled_submissions:
                return False
            self._scheduled_submissions.add(submission_key)

        def runner() -> None:
            try:
                if delay_seconds > 0:
                    time.sleep(delay_seconds)
                self.process_submission(submission_key, recover_stale=recover_stale)
            finally:
                with self._scheduled_lock:
                    self._scheduled_submissions.discard(submission_key)

        worker = threading.Thread(
            target=runner,
            name=f"arena-submission-{reason}-{submission_key}",
            daemon=True,
        )
        worker.start()
        return True

    def _ensure_submission_processing(self, submission) -> None:
        normalized_status = str(submission.status or "").strip().lower()
        if normalized_status not in {"pending", "running"}:
            return

        self._schedule_processing(
            str(submission.id),
            reason="status-poll",
            delay_seconds=0.0,
            recover_stale=True,
        )

    def _recovery_worker(self) -> None:
        while not self._recovery_stop.is_set():
            try:
                processed = self.recover_stale_submissions()
                if processed:
                    self.logger.info("submission.recovered count=%s ids=%s", len(processed), ",".join(processed))
            except Exception as recovery_error:
                self.logger.exception("submission.recovery_failed error=%s", recovery_error)

            if self._recovery_stop.wait(self.settings.submission_recovery_interval_seconds):
                break

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
