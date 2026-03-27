from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import case, desc, func, or_
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session, joinedload

from app.models.problem import Problem
from app.models.rating import RatingHistory, UserRating
from app.models.submission import SolvedProblem, Submission, UserStats
from app.models.user import User


@dataclass(frozen=True)
class FinalizedSubmission:
    submission: Submission
    first_solve: bool


class SubmissionTrackingRepository:
    def __init__(self):
        import logging
        self.logger = logging.getLogger("pyzone.arena.submission_tracking")

    def _insert_builder(self, db: Session, model: type[Any]):
        dialect = db.get_bind().dialect.name
        if dialect == "postgresql":
            return pg_insert(model)
        if dialect == "sqlite":
            return sqlite_insert(model)
        raise RuntimeError(f"Unsupported database dialect for conflict handling: {dialect}")

    def resolve_problem(
        self,
        db: Session,
        problem_key: str,
        *,
        with_test_cases: bool = False,
    ) -> Problem | None:
        query = db.query(Problem)
        if with_test_cases:
            query = query.options(joinedload(Problem.test_cases))
        return query.filter(or_(Problem.id == problem_key, Problem.slug == problem_key)).first()

    def get_user(self, db: Session, user_id: int) -> User | None:
        return db.query(User).filter(User.id == user_id).first()

    def create_submission(
        self,
        db: Session,
        *,
        user_id: int | None,
        problem_id: str,
        code: str,
        language: str,
        mode: str,
    ) -> Submission:
        row = Submission(
            user_id=user_id,
            problem_id=problem_id,
            code=code,
            language=language,
            mode=mode,
            status="pending",
            case_results_json="[]",
        )
        db.add(row)
        db.flush()
        return row

    def get_submission(self, db: Session, submission_id: int, *, lock: bool = False) -> Submission | None:
        query = db.query(Submission).filter(Submission.id == submission_id)
        if lock:
            query = query.with_for_update()
        return query.first()

    def claim_submission_for_processing(
        self,
        db: Session,
        submission_id: int,
        *,
        recover_running_after_seconds: int | None = None,
    ) -> Submission | None:
        row = self.get_submission(db, submission_id, lock=True)
        if row is None:
            return None

        normalized_status = str(row.status or "").strip().lower()
        if normalized_status == "completed":
            return None

        if normalized_status == "running":
            if recover_running_after_seconds is None:
                return None

            updated_at = row.updated_at or row.created_at
            if updated_at is not None:
                comparable = updated_at if updated_at.tzinfo else updated_at.replace(tzinfo=timezone.utc)
                cutoff = datetime.now(timezone.utc) - timedelta(seconds=max(recover_running_after_seconds, 0))
                if comparable > cutoff:
                    return None
        elif normalized_status != "pending":
            return None

        row.status = "running"
        row.updated_at = datetime.now(timezone.utc)
        db.flush()
        return row

    def list_user_solved_problem_ids(self, db: Session, user_id: int) -> set[str]:
        return {
            str(problem_id)
            for (problem_id,) in db.query(SolvedProblem.problem_id).filter(SolvedProblem.user_id == user_id).all()
        }

    def list_user_attempted_problem_ids(self, db: Session, user_id: int) -> set[str]:
        return {
            str(problem_id)
            for (problem_id,) in (
                db.query(Submission.problem_id)
                .filter(Submission.user_id == user_id, Submission.problem_id.isnot(None), Submission.mode == "submit")
                .distinct()
                .all()
            )
        }

    def list_problem_acceptance_rates(self, db: Session) -> dict[str, int | None]:
        rows = (
            db.query(
                Submission.problem_id,
                func.count(Submission.id).label("total"),
                func.sum(case((func.lower(Submission.verdict) == "accepted", 1), else_=0)).label("accepted"),
            )
            .filter(Submission.problem_id.isnot(None), Submission.mode == "submit", Submission.status == "completed")
            .group_by(Submission.problem_id)
            .all()
        )
        return {
            str(row.problem_id): int(round((int(row.accepted or 0) / int(row.total)) * 100)) if int(row.total or 0) else None
            for row in rows
        }

    def mark_running(self, db: Session, submission_id: int) -> Submission | None:
        return self.claim_submission_for_processing(db, submission_id)

    def finalize_submission(
        self,
        db: Session,
        *,
        submission_id: int,
        verdict: str | None,
        runtime_ms: int | None,
        memory_kb: int | None,
        error_text: str | None,
        passed_count: int | None,
        total_count: int | None,
        case_results: list[dict[str, Any]] | None,
    ) -> FinalizedSubmission | None:
        row = self.get_submission(db, submission_id, lock=True)
        if row is None:
            return None

        if str(row.status or "").strip().lower() == "completed" and row.verdict:
            return FinalizedSubmission(submission=row, first_solve=False)

        normalized_verdict = (verdict or "").strip()
        row.status = "completed"
        row.verdict = normalized_verdict or None
        row.runtime_ms = runtime_ms
        row.memory_kb = memory_kb
        row.error_text = error_text
        row.passed_count = passed_count
        row.total_count = total_count
        row.case_results_json = json.dumps(case_results or [], ensure_ascii=False)

        first_solve = False
        if row.mode == "submit" and normalized_verdict.lower() == "accepted":
            difficulty = db.query(Problem.difficulty).filter(Problem.id == row.problem_id).scalar()
            first_solve = self.record_first_solve(
                db,
                user_id=int(row.user_id),
                problem_id=str(row.problem_id),
                difficulty=str(difficulty or ""),
                solved_at=row.created_at,
            )

        db.flush()
        return FinalizedSubmission(submission=row, first_solve=first_solve)

    def record_solved_problem_safe(
        self,
        db: Session,
        *,
        user_id: int,
        problem_id: str,
        solved_at: datetime | None = None,
        created_by: str = "submission_service",
    ) -> bool:
        """Safely record a solved problem with proper transaction handling and idempotency.
        
        This function:
        1. Uses INSERT ... ON CONFLICT DO NOTHING for idempotency
        2. Only updates user_stats if this is a NEW solve
        3. Returns True if a new solve was recorded, False if already solved
        4. Includes debugging information
        """
        # Get problem difficulty for stats
        difficulty = db.query(Problem.difficulty).filter(Problem.id == problem_id).scalar()
        
        # Use INSERT ... ON CONFLICT DO NOTHING for idempotency
        insert_stmt = (
            self._insert_builder(db, SolvedProblem)
            .values(
                user_id=user_id,
                problem_id=problem_id,
                solved_at=solved_at or datetime.now(timezone.utc),
            )
            .on_conflict_do_nothing(index_elements=["user_id", "problem_id"])
        )
        result = db.execute(insert_stmt)
        inserted = int(result.rowcount or 0) > 0
        
        # Only update stats if this is a NEW solve (CRITICAL for consistency)
        if inserted:
            self.increment_user_stats(db, user_id=user_id, difficulty=str(difficulty or ""))
            self.logger.info(
                "solved_problem.recorded user_id=%s problem_id=%s difficulty=%s created_by=%s",
                user_id,
                problem_id,
                difficulty,
                created_by
            )
        else:
            self.logger.info(
                "solved_problem.skipped user_id=%s problem_id=%s already_solved=True",
                user_id,
                problem_id
            )
        
        return inserted

    def backfill_solved_problems_for_user(self, db: Session, user_id: int) -> int:
        """Backfill solved problems for a user from existing accepted submissions.
        
        This function processes all accepted submissions for a user and creates
        solved_problems entries, using the new safe function for consistency.
        """
        accepted_rows = (
            db.query(
                Submission.problem_id,
                func.min(Submission.created_at).label("solved_at"),
                Problem.difficulty.label("difficulty"),
            )
            .join(Problem, Problem.id == Submission.problem_id)
            .filter(
                Submission.user_id == user_id,
                Submission.problem_id.isnot(None),
                Submission.mode == "submit",
                or_(
                    func.lower(func.coalesce(Submission.verdict, "")) == "accepted",
                    func.lower(func.coalesce(Submission.status, "")) == "accepted",
                ),
            )
            .group_by(Submission.problem_id, Problem.difficulty)
            .all()
        )

        inserted = 0
        for accepted_row in accepted_rows:
            # Use the new safe function for consistency
            if self.record_solved_problem_safe(
                db,
                user_id=user_id,
                problem_id=str(accepted_row.problem_id),
                solved_at=accepted_row.solved_at,
                created_by="backfill",
            ):
                inserted += 1
        
        self.logger.info(
            "backfill.completed user_id=%s problems_found=%s inserted=%s",
            user_id,
            len(accepted_rows),
            inserted
        )
        return inserted

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

    def increment_user_stats(self, db: Session, *, user_id: int, difficulty: str) -> None:
        normalized = str(difficulty or "").strip().lower()
        easy_inc = 1 if normalized == "easy" else 0
        medium_inc = 1 if normalized == "medium" else 0
        hard_inc = 1 if normalized == "hard" else 0

        insert_stmt = self._insert_builder(db, UserStats).values(
            user_id=user_id,
            solved_count=1,
            easy_solved=easy_inc,
            medium_solved=medium_inc,
            hard_solved=hard_inc,
            rating=self._seed_rating(db, user_id),
            updated_at=func.now(),
        )
        upsert_stmt = insert_stmt.on_conflict_do_update(
            index_elements=["user_id"],
            set_={
                "solved_count": UserStats.solved_count + 1,
                "easy_solved": UserStats.easy_solved + easy_inc,
                "medium_solved": UserStats.medium_solved + medium_inc,
                "hard_solved": UserStats.hard_solved + hard_inc,
                "updated_at": func.now(),
            },
        )
        db.execute(upsert_stmt)

    def get_user_stats(self, db: Session, user_id: int) -> UserStats | None:
        return db.query(UserStats).filter(UserStats.user_id == user_id).first()

    def rebuild_user_stats(self, db: Session, user_id: int) -> UserStats:
        row = self.get_user_stats(db, user_id)
        if row is None:
            row = UserStats(user_id=user_id, rating=self._seed_rating(db, user_id))
            db.add(row)
            db.flush()

        aggregate_rows = (
            db.query(Problem.difficulty, func.count(SolvedProblem.problem_id).label("count"))
            .join(Problem, Problem.id == SolvedProblem.problem_id)
            .filter(SolvedProblem.user_id == user_id)
            .group_by(Problem.difficulty)
            .all()
        )

        easy = medium = hard = 0
        for aggregate_row in aggregate_rows:
            difficulty = str(aggregate_row.difficulty or "").strip().lower()
            count = int(aggregate_row.count or 0)
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
        return row

    def list_recent_submissions(self, db: Session, user_id: int, *, limit: int = 20) -> list[tuple]:
        return (
            db.query(
                Submission,
                Problem.slug.label("problem_slug"),
                Problem.title.label("problem_title"),
                Problem.difficulty.label("difficulty"),
                Problem.leetcode_id.label("leetcode_id"),
            )
            .outerjoin(Problem, Problem.id == Submission.problem_id)
            .filter(Submission.user_id == user_id, Submission.mode == "submit")
            .order_by(Submission.created_at.desc(), Submission.id.desc())
            .limit(limit)
            .all()
        )

    def count_user_submissions(self, db: Session, user_id: int) -> int:
        return int(
            db.query(func.count(Submission.id))
            .filter(Submission.user_id == user_id, Submission.mode == "submit")
            .scalar()
            or 0
        )

    def list_user_submission_feed(self, db: Session, user_id: int, *, limit: int = 200) -> list[tuple]:
        return (
            db.query(
                Submission,
                Problem.title.label("problem_title"),
                Problem.difficulty.label("difficulty"),
                Problem.slug.label("problem_slug"),
            )
            .outerjoin(Problem, Problem.id == Submission.problem_id)
            .filter(Submission.user_id == user_id, Submission.mode == "submit")
            .order_by(Submission.created_at.desc(), Submission.id.desc())
            .limit(limit)
            .all()
        )

    def list_user_activity(self, db: Session, user_id: int) -> list[tuple]:
        return (
            db.query(
                func.date(Submission.created_at).label("date"),
                func.count().label("count"),
            )
            .filter(Submission.user_id == user_id, Submission.mode == "submit")
            .group_by(func.date(Submission.created_at))
            .order_by(func.date(Submission.created_at))
            .all()
        )

    def list_stale_submission_ids(
        self,
        db: Session,
        *,
        stale_after_seconds: int,
        limit: int = 25,
    ) -> list[int]:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=max(stale_after_seconds, 0))
        rows = (
            db.query(Submission.id)
            .filter(
                Submission.status.in_(["pending", "running"]),
                func.coalesce(Submission.updated_at, Submission.created_at) <= cutoff,
            )
            .order_by(func.coalesce(Submission.updated_at, Submission.created_at).asc(), Submission.id.asc())
            .limit(limit)
            .all()
        )
        return [int(submission_id) for (submission_id,) in rows]

    def get_problem_stats(self, db: Session, problem_id: str) -> dict[str, Any]:
        solved_count = int(
            db.query(func.count(SolvedProblem.id))
            .filter(SolvedProblem.problem_id == problem_id)
            .scalar()
            or 0
        )
        total_submissions = int(
            db.query(func.count(Submission.id))
            .filter(
                Submission.problem_id == problem_id,
                Submission.mode == "submit",
                Submission.status == "completed",
            )
            .scalar()
            or 0
        )
        acceptance_rate = round((solved_count / total_submissions) * 100, 2) if total_submissions else 0.0
        return {
            "solved_count": solved_count,
            "total_submissions": total_submissions,
            "acceptance_rate": acceptance_rate,
        }

    def get_leaderboard_rows(self, db: Session, *, limit: int = 50) -> list[tuple]:
        solved_subquery = (
            db.query(
                SolvedProblem.user_id.label("user_id"),
                func.count(SolvedProblem.id).label("solved"),
            )
            .group_by(SolvedProblem.user_id)
            .subquery()
        )

        submissions_subquery = (
            db.query(
                Submission.user_id.label("user_id"),
                func.count().label("submissions"),
                func.min(Submission.runtime_ms).label("fastest_ms"),
            )
            .filter(Submission.user_id.isnot(None), Submission.mode == "submit")
            .group_by(Submission.user_id)
            .subquery()
        )

        return (
            db.query(
                User.id.label("user_id"),
                User.username,
                func.coalesce(UserStats.rating, 1200).label("rating"),
                func.coalesce(solved_subquery.c.solved, UserStats.solved_count, 0).label("solved"),
                submissions_subquery.c.submissions,
                submissions_subquery.c.fastest_ms,
            )
            .outerjoin(UserStats, UserStats.user_id == User.id)
            .outerjoin(solved_subquery, solved_subquery.c.user_id == User.id)
            .outerjoin(submissions_subquery, submissions_subquery.c.user_id == User.id)
            .order_by(
                func.coalesce(UserStats.rating, 1200).desc(),
                func.coalesce(solved_subquery.c.solved, UserStats.solved_count, 0).desc(),
                User.username.asc(),
            )
            .limit(limit)
            .all()
        )

    def get_problem_bank_totals(self, db: Session) -> dict[str, int]:
        counts = {"total": 0, "easy": 0, "medium": 0, "hard": 0}
        aggregate_rows = (
            db.query(Problem.difficulty, func.count(Problem.id).label("count"))
            .group_by(Problem.difficulty)
            .all()
        )
        for aggregate_row in aggregate_rows:
            difficulty = str(aggregate_row.difficulty or "").strip().lower()
            count = int(aggregate_row.count or 0)
            counts["total"] += count
            if difficulty == "easy":
                counts["easy"] = count
            elif difficulty == "medium":
                counts["medium"] = count
            elif difficulty == "hard":
                counts["hard"] = count
        return counts

    def decode_case_results(self, submission: Submission) -> list[dict[str, Any]]:
        raw_value = submission.case_results_json or "[]"
        try:
            payload = json.loads(raw_value)
            if isinstance(payload, list):
                return [item for item in payload if isinstance(item, dict)]
        except json.JSONDecodeError:
            pass
        return []


submission_tracking_repository = SubmissionTrackingRepository()
