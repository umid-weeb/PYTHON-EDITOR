from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.problem import Problem
from app.models.rating import RatingHistory, UserRating
from app.models.submission_stats import SubmissionRecord, UserProgress, UserStats, UserSubmission
from app.models.user import User


@dataclass(frozen=True)
class UserStatsSnapshot:
    user_id: int
    solved_count: int
    easy_solved: int
    medium_solved: int
    hard_solved: int
    rating: int


class UserStatsService:
    @staticmethod
    def _is_accepted(verdict: str | None, status: str | None = None) -> bool:
        normalized_verdict = (verdict or "").strip().lower()
        normalized_status = (status or "").strip().lower()
        return normalized_verdict == "accepted" or normalized_status == "accepted"

    def _seed_rating(self, db: Session, user_id: int) -> int:
        latest_history = (
            db.query(RatingHistory.rating_after)
            .filter(RatingHistory.user_id == user_id)
            .order_by(RatingHistory.created_at.desc(), RatingHistory.id.desc())
            .scalar()
        )
        if latest_history is not None:
            return int(latest_history)

        legacy_rating = db.query(UserRating.rating).filter(UserRating.user_id == user_id).scalar()
        if legacy_rating is not None:
            return int(legacy_rating)

        return 1200

    def get_or_create(self, db: Session, user_id: int) -> UserStats:
        row = db.query(UserStats).filter(UserStats.user_id == user_id).first()
        if row:
            return row

        row = UserStats(user_id=user_id, rating=self._seed_rating(db, user_id))
        db.add(row)
        db.flush()
        return row

    def sync_submission_history(
        self,
        db: Session,
        submission: SubmissionRecord,
    ) -> UserSubmission | None:
        if submission.user_id is None or not submission.problem_id or not submission.external_submission_id:
            return None

        row = (
            db.query(UserSubmission)
            .filter(UserSubmission.submission_id == submission.external_submission_id)
            .first()
        )
        if row is None:
            row = UserSubmission(
                user_id=int(submission.user_id),
                problem_id=str(submission.problem_id),
                submission_id=submission.external_submission_id,
                created_at=submission.created_at or datetime.now(timezone.utc),
            )
            db.add(row)

        row.user_id = int(submission.user_id)
        row.problem_id = str(submission.problem_id)
        row.language = submission.language
        row.verdict = submission.verdict
        row.runtime_ms = int(round(submission.runtime)) if submission.runtime is not None else None
        row.memory_kb = submission.memory_kb
        if submission.created_at is not None:
            row.created_at = submission.created_at
        db.flush()
        return row

    def record_accepted_progress(
        self,
        db: Session,
        *,
        user_id: int,
        problem_id: str,
        runtime_ms: int | None,
        memory_kb: int | None,
        solved_at: datetime | None = None,
    ) -> UserProgress:
        row = (
            db.query(UserProgress)
            .filter(UserProgress.user_id == user_id, UserProgress.problem_id == problem_id)
            .first()
        )
        if row is None:
            row = UserProgress(
                user_id=user_id,
                problem_id=problem_id,
                solved_at=solved_at or datetime.now(timezone.utc),
                attempts=1,
                best_runtime=runtime_ms,
                best_memory=memory_kb,
            )
            db.add(row)
            db.flush()
            return row

        row.attempts = int(row.attempts or 0) + 1
        if solved_at is not None and (row.solved_at is None or solved_at < row.solved_at):
            row.solved_at = solved_at
        if runtime_ms is not None:
            row.best_runtime = runtime_ms if row.best_runtime is None else min(int(row.best_runtime), int(runtime_ms))
        if memory_kb is not None:
            row.best_memory = memory_kb if row.best_memory is None else min(int(row.best_memory), int(memory_kb))
        db.flush()
        return row

    def rebuild(self, db: Session, user_id: int) -> UserStatsSnapshot:
        row = self.get_or_create(db, user_id)

        accepted_rows = (
            db.query(Problem.difficulty, func.count(UserProgress.problem_id).label("count"))
            .join(Problem, Problem.id == UserProgress.problem_id)
            .filter(UserProgress.user_id == user_id)
            .group_by(Problem.difficulty)
            .all()
        )

        easy = medium = hard = 0
        for accepted_row in accepted_rows:
            difficulty = (accepted_row.difficulty or "").strip().lower()
            count = int(accepted_row.count or 0)
            if difficulty == "easy":
                easy = count
            elif difficulty == "medium":
                medium = count
            elif difficulty == "hard":
                hard = count

        row.solved_count = easy + medium + hard
        row.easy_solved = easy
        row.medium_solved = medium
        row.hard_solved = hard
        if not row.rating:
            row.rating = self._seed_rating(db, user_id)
        db.flush()

        return UserStatsSnapshot(
            user_id=user_id,
            solved_count=int(row.solved_count or 0),
            easy_solved=int(row.easy_solved or 0),
            medium_solved=int(row.medium_solved or 0),
            hard_solved=int(row.hard_solved or 0),
            rating=int(row.rating or 0),
        )

    def rebuild_progress_from_submissions(self, db: Session, user_id: int | None = None) -> None:
        progress_query = db.query(UserProgress)
        if user_id is not None:
            progress_query = progress_query.filter(UserProgress.user_id == user_id)
        progress_query.delete(synchronize_session=False)
        db.flush()

        records_query = (
            db.query(SubmissionRecord)
            .filter(SubmissionRecord.user_id.isnot(None), SubmissionRecord.problem_id.isnot(None))
            .order_by(SubmissionRecord.created_at.asc(), SubmissionRecord.id.asc())
        )
        if user_id is not None:
            records_query = records_query.filter(SubmissionRecord.user_id == user_id)

        aggregates: dict[tuple[int, str], dict[str, int | datetime | None]] = {}
        for record in records_query.all():
            if not self._is_accepted(record.verdict, record.status):
                continue

            key = (int(record.user_id), str(record.problem_id))
            current = aggregates.get(key)
            runtime_ms = int(round(record.runtime)) if record.runtime is not None else None
            memory_kb = int(record.memory_kb) if record.memory_kb is not None else None

            if current is None:
                aggregates[key] = {
                    "attempts": 1,
                    "solved_at": record.created_at or datetime.now(timezone.utc),
                    "best_runtime": runtime_ms,
                    "best_memory": memory_kb,
                }
                continue

            current["attempts"] = int(current["attempts"] or 0) + 1
            solved_at = current["solved_at"]
            if record.created_at is not None and (solved_at is None or record.created_at < solved_at):
                current["solved_at"] = record.created_at
            if runtime_ms is not None:
                best_runtime = current["best_runtime"]
                current["best_runtime"] = runtime_ms if best_runtime is None else min(int(best_runtime), runtime_ms)
            if memory_kb is not None:
                best_memory = current["best_memory"]
                current["best_memory"] = memory_kb if best_memory is None else min(int(best_memory), memory_kb)

        for (progress_user_id, progress_problem_id), payload in aggregates.items():
            db.add(
                UserProgress(
                    user_id=progress_user_id,
                    problem_id=progress_problem_id,
                    solved_at=payload["solved_at"] or datetime.now(timezone.utc),
                    attempts=int(payload["attempts"] or 1),
                    best_runtime=int(payload["best_runtime"]) if payload["best_runtime"] is not None else None,
                    best_memory=int(payload["best_memory"]) if payload["best_memory"] is not None else None,
                )
            )

        db.flush()

    def backfill_submission_history(self, db: Session, user_id: int | None = None) -> None:
        query = db.query(SubmissionRecord).filter(
            SubmissionRecord.user_id.isnot(None),
            SubmissionRecord.problem_id.isnot(None),
        )
        if user_id is not None:
            query = query.filter(SubmissionRecord.user_id == user_id)

        for submission in query.order_by(SubmissionRecord.created_at.asc(), SubmissionRecord.id.asc()).all():
            self.sync_submission_history(db, submission)

    def backfill_all(self, db: Session) -> None:
        self.backfill_submission_history(db)
        self.rebuild_progress_from_submissions(db)
        user_ids = [row[0] for row in db.query(User.id).all()]
        for user_id in user_ids:
            self.rebuild(db, int(user_id))

    def record_submission(
        self,
        db: Session,
        *,
        external_submission_id: str,
        user_id: int | None,
        problem_id: str,
        code: str,
        language: str,
        status: str = "pending",
    ) -> SubmissionRecord:
        row = (
            db.query(SubmissionRecord)
            .filter(SubmissionRecord.external_submission_id == external_submission_id)
            .first()
        )
        if row:
            return row

        row = SubmissionRecord(
            external_submission_id=external_submission_id,
            user_id=user_id,
            problem_id=problem_id,
            code=code,
            language=language,
            status=status,
        )
        db.add(row)
        db.flush()
        return row

    def finalize_submission(
        self,
        db: Session,
        *,
        external_submission_id: str,
        verdict: str | None,
        runtime_ms: int | None,
        memory_kb: int | None,
        error_text: str | None,
    ) -> SubmissionRecord | None:
        row = (
            db.query(SubmissionRecord)
            .filter(SubmissionRecord.external_submission_id == external_submission_id)
            .first()
        )
        if row is None:
            return None

        normalized_verdict = (verdict or "").strip()
        row.verdict = normalized_verdict or None
        row.status = (
            "accepted"
            if normalized_verdict.lower() == "accepted"
            else normalized_verdict.lower().replace(" ", "_") or "runtime_error"
        )
        row.runtime = float(runtime_ms) if runtime_ms is not None else None
        row.memory_kb = memory_kb
        row.error_text = error_text
        db.flush()
        return row


user_stats_service = UserStatsService()
