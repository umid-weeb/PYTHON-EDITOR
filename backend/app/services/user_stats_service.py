from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.problem import Problem
from app.models.rating import RatingHistory, UserRating
from app.models.submission_stats import SubmissionRecord, UserStats, UserSubmission
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

    def rebuild(self, db: Session, user_id: int) -> UserStatsSnapshot:
        row = self.get_or_create(db, user_id)

        accepted_rows = (
            db.query(Problem.difficulty, func.count(func.distinct(UserSubmission.problem_id)).label("count"))
            .join(Problem, Problem.id == UserSubmission.problem_id)
            .filter(UserSubmission.user_id == user_id, UserSubmission.verdict == "Accepted")
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

    def backfill_all(self, db: Session) -> None:
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
