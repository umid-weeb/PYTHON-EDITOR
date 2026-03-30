from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.problem import Problem
from app.models.rating import RatingHistory
from app.models.submission import UserStats
from app.services.rating_formula import BASE_RATING


@dataclass(frozen=True)
class RatingSnapshot:
    rating: int
    max_rating: int
    global_rank: int | None

class RatingService:
    def get_or_create(self, db: Session, user_id: int) -> UserStats:
        row = db.query(UserStats).filter(UserStats.user_id == user_id).first()
        if row:
            return row
        row = UserStats(user_id=user_id, rating=BASE_RATING)
        db.add(row)
        db.flush()
        return row

    def on_submission_result(
        self,
        db: Session,
        *,
        user_id: int,
        problem_id: str,
        submission_id: str,
        verdict: str | None,
        is_first_solve: bool = False,
    ) -> None:
        if (verdict or "").strip().lower() != "accepted" or not is_first_solve:
            return

        exists = (
            db.query(RatingHistory.id)
            .filter(RatingHistory.user_id == user_id, RatingHistory.submission_id == submission_id)
            .first()
        )
        if exists:
            return

        # Use first() to safely handle potential duplicate problem IDs
        prob_row = db.query(Problem.difficulty).filter(Problem.id == problem_id).first()
        difficulty = prob_row[0] if prob_row else None

        rating_row = self.get_or_create(db, user_id)
        base_rating = int(rating_row.rating or BASE_RATING)

        from app.repositories.submission_tracking import submission_tracking_repository

        rating_row = submission_tracking_repository.rebuild_user_stats(db, user_id)
        rating_after = int(rating_row.rating or BASE_RATING)

        db.add(
            RatingHistory(
                user_id=user_id,
                delta=rating_after - base_rating,
                rating_after=rating_after,
                reason=f"first_ac:{difficulty or 'unknown'}",
                submission_id=submission_id,
            )
        )

    def snapshot(self, db: Session, user_id: int) -> RatingSnapshot:
        from app.repositories.submission_tracking import submission_tracking_repository

        submission_tracking_repository.backfill_solved_problems_for_user(db, user_id)
        row = submission_tracking_repository.rebuild_user_stats(db, user_id)
        # Dense rank by rating desc.
        higher = db.query(func.count(UserStats.user_id)).filter(UserStats.rating > row.rating).scalar() or 0
        max_rating = (
            db.query(func.max(RatingHistory.rating_after))
            .filter(RatingHistory.user_id == user_id)
            .scalar()
        )
        global_rank = int(higher) + 1
        return RatingSnapshot(
            rating=int(row.rating or BASE_RATING),
            max_rating=max(int(max_rating or 0), int(row.rating or BASE_RATING), BASE_RATING),
            global_rank=global_rank,
        )


rating_service = RatingService()
