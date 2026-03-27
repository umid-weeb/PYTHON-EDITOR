from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.submission import UserStats
from app.models.user import User
from app.repositories.submission_tracking import submission_tracking_repository


@dataclass(frozen=True)
class UserStatsSnapshot:
    user_id: int
    solved_count: int
    easy_solved: int
    medium_solved: int
    hard_solved: int
    rating: int


class UserStatsService:
    def get_or_create(self, db: Session, user_id: int) -> UserStats:
        submission_tracking_repository.backfill_solved_problems_for_user(db, user_id)
        return submission_tracking_repository.rebuild_user_stats(db, user_id)

    def rebuild(self, db: Session, user_id: int) -> UserStatsSnapshot:
        submission_tracking_repository.backfill_solved_problems_for_user(db, user_id)
        row = submission_tracking_repository.rebuild_user_stats(db, user_id)
        return self._snapshot_from_row(row)

    def ensure_user_stats_fresh(self, db: Session, user_id: int) -> UserStatsSnapshot:
        submission_tracking_repository.backfill_solved_problems_for_user(db, user_id)
        row = submission_tracking_repository.rebuild_user_stats(db, user_id)
        db.flush()
        return self._snapshot_from_row(row)

    def backfill_all(self, db: Session) -> None:
        user_ids = [int(user_id) for (user_id,) in db.query(User.id).all()]
        for user_id in user_ids:
            submission_tracking_repository.rebuild_user_stats(db, user_id)
        db.flush()

    @staticmethod
    def _snapshot_from_row(row: UserStats) -> UserStatsSnapshot:
        return UserStatsSnapshot(
            user_id=int(row.user_id),
            solved_count=int(row.solved_count or 0),
            easy_solved=int(row.easy_solved or 0),
            medium_solved=int(row.medium_solved or 0),
            hard_solved=int(row.hard_solved or 0),
            rating=int(row.rating or 1200),
        )


user_stats_service = UserStatsService()
