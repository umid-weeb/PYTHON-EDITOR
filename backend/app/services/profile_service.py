from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.models.submission import Submission
from app.models.user import User
from app.repositories.submission_tracking import submission_tracking_repository
from app.services.rating_service import rating_service
from app.services.user_stats_service import user_stats_service


@dataclass(frozen=True)
class ProfilePayload:
    user: User
    solved_count: int
    easy_solved: int
    medium_solved: int
    hard_solved: int
    rating: int
    recent_submissions: list[dict[str, Any]]
    submissions_count: int


class ProfileService:
    def get_user_profile(self, db: Session, user_id: int, *, recent_limit: int = 20) -> ProfilePayload:
        """Get user profile with real-time data from solved_problems (source of truth)."""
        user = submission_tracking_repository.get_user(db, user_id)
        if user is None:
            raise ValueError("User not found")

        user_stats_service.ensure_user_stats_fresh(db, user_id)
        # Get real-time stats from solved_problems table (source of truth)
        solved_stats = self._get_realtime_solved_stats(db, user_id)
        rating = rating_service.snapshot(db, user_id)
        recent_rows = submission_tracking_repository.list_recent_submissions(db, user_id, limit=recent_limit)
        submissions_count = submission_tracking_repository.count_user_submissions(db, user_id)

        return ProfilePayload(
            user=user,
            solved_count=int(solved_stats["solved_count"]),
            easy_solved=int(solved_stats["easy_solved"]),
            medium_solved=int(solved_stats["medium_solved"]),
            hard_solved=int(solved_stats["hard_solved"]),
            rating=int(rating.rating or 1200),
            recent_submissions=[self._serialize_submission_row(row[0], row, include_problem_key=False) for row in recent_rows],
            submissions_count=submissions_count,
        )

    def _get_realtime_solved_stats(self, db: Session, user_id: int) -> dict[str, int]:
        """Get real-time solved stats directly from solved_problems table (source of truth)."""
        result = db.execute(
            """
            SELECT 
                COUNT(*) as solved_count,
                COUNT(*) FILTER (WHERE p.difficulty = 'easy') as easy_solved,
                COUNT(*) FILTER (WHERE p.difficulty = 'medium') as medium_solved,
                COUNT(*) FILTER (WHERE p.difficulty = 'hard') as hard_solved
            FROM solved_problems sp
            JOIN problems p ON sp.problem_id = p.id
            WHERE sp.user_id = :user_id
            """,
            {"user_id": user_id}
        ).fetchone()
        
        return {
            "solved_count": int(result.solved_count or 0),
            "easy_solved": int(result.easy_solved or 0),
            "medium_solved": int(result.medium_solved or 0),
            "hard_solved": int(result.hard_solved or 0),
        }

    def get_problem_stats(self, db: Session, problem_key: str) -> dict[str, Any]:
        problem = submission_tracking_repository.resolve_problem(db, problem_key)
        if problem is None:
            raise ValueError("Problem not found")

        payload = submission_tracking_repository.get_problem_stats(db, problem.id)
        return {
            "problem_id": problem.id,
            "slug": problem.slug,
            "title": problem.title,
            "leetcode_id": problem.leetcode_id,
            "difficulty": problem.difficulty,
            **payload,
        }

    def get_leaderboard(self, db: Session, *, limit: int = 50) -> list[dict[str, Any]]:
        user_stats_service.backfill_all(db)
        rows = submission_tracking_repository.get_leaderboard_rows(db, limit=limit)
        return [
            {
                "user_id": int(row.user_id),
                "username": row.username,
                "display_name": getattr(row, "display_name", None),
                "avatar_url": getattr(row, "avatar_url", None),
                "rating": int(row.rating or 1200),
                "solved": int(row.solved or 0),
                "solved_count": int(row.solved or 0),
                "submissions": int(row.submissions or 0),
                "fastest_ms": int(row.fastest_ms) if row.fastest_ms is not None else None,
            }
            for row in rows
        ]

    def get_user_activity(self, db: Session, user_id: int) -> list[dict[str, Any]]:
        return [
            {"date": str(row.date), "count": int(row.count)}
            for row in submission_tracking_repository.list_user_activity(db, user_id)
        ]

    def get_user_submission_feed(self, db: Session, user_id: int, *, limit: int = 200) -> list[dict[str, Any]]:
        rows = submission_tracking_repository.list_user_submission_feed(db, user_id, limit=limit)
        return [self._serialize_submission_row(row[0], row) for row in rows]

    def serialize_submission_status(self, submission: Submission) -> dict[str, Any]:
        return {
            "submission_id": str(submission.id),
            "problem_id": submission.problem_id,
            "mode": submission.mode,
            "language": submission.language,
            "status": submission.status,
            "verdict": submission.verdict,
            "runtime_ms": submission.runtime_ms,
            "memory_kb": submission.memory_kb,
            "passed_count": submission.passed_count,
            "total_count": submission.total_count,
            "created_at": submission.created_at.isoformat() if submission.created_at else None,
            "updated_at": submission.updated_at.isoformat() if submission.updated_at else None,
            "error_text": submission.error_text,
            "case_results": submission_tracking_repository.decode_case_results(submission),
        }

    def _serialize_submission_row(
        self,
        submission: Submission,
        row: tuple,
        *,
        include_problem_key: bool = True,
    ) -> dict[str, Any]:
        payload = {
            "submission_id": str(submission.id),
            "problem_id": submission.problem_id,
            "problem_slug": getattr(row, "problem_slug", None),
            "problem_title": getattr(row, "problem_title", None),
            "difficulty": getattr(row, "difficulty", None),
            "language": submission.language,
            "verdict": submission.verdict,
            "status": submission.status,
            "runtime_ms": submission.runtime_ms,
            "memory_kb": submission.memory_kb,
            "created_at": submission.created_at.isoformat() if submission.created_at else None,
        }
        if include_problem_key:
            payload["mode"] = submission.mode
        leetcode_id = getattr(row, "leetcode_id", None)
        if leetcode_id is not None:
            payload["leetcode_id"] = leetcode_id
        return payload


profile_service = ProfileService()
