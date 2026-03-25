from __future__ import annotations

import random
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session

from app.models.engagement import DailyChallenge, StreakHistory
from app.models.problem import Problem
from app.models.user import User


def _coerce_timezone(tz_name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name or "Asia/Tashkent")
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def _today_for_timezone(tz_name: str | None) -> date:
    return datetime.now(_coerce_timezone(tz_name)).date()


@dataclass(frozen=True)
class StreakSnapshot:
    streak: int
    longest_streak: int
    last_solve_date: str | None
    streak_freeze: int
    timezone: str
    today_solved: bool

    def to_dict(self) -> dict:
        return asdict(self)


class EngagementService:
    def touch_last_active(self, db: Session, user: User) -> None:
        user.last_active = datetime.utcnow()
        db.flush()

    def get_streak_snapshot(self, db: Session, user_id: int) -> StreakSnapshot:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError("User not found")

        today = _today_for_timezone(user.timezone)
        today_row = (
            db.query(StreakHistory.id)
            .filter(StreakHistory.user_id == user_id, StreakHistory.streak_date == today)
            .first()
        )
        return StreakSnapshot(
            streak=int(user.streak or 0),
            longest_streak=int(user.longest_streak or 0),
            last_solve_date=user.last_solve_date.isoformat() if user.last_solve_date else None,
            streak_freeze=int(user.streak_freeze or 0),
            timezone=user.timezone or "Asia/Tashkent",
            today_solved=bool(today_row),
        )

    def update_streak_for_accept(self, db: Session, user_id: int) -> StreakSnapshot:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError("User not found")

        tz_name = user.timezone or "Asia/Tashkent"
        today = _today_for_timezone(tz_name)
        yesterday = today - timedelta(days=1)

        history_row = (
            db.query(StreakHistory)
            .filter(StreakHistory.user_id == user_id, StreakHistory.streak_date == today)
            .first()
        )

        if user.last_solve_date == today:
            if history_row is None:
                history_row = StreakHistory(user_id=user_id, streak_date=today, solved=0, streak_day=int(user.streak or 0))
                db.add(history_row)
            history_row.solved = int(history_row.solved or 0) + 1
            db.flush()
            return self.get_streak_snapshot(db, user_id)

        current_streak = int(user.streak or 0)
        freeze_balance = int(user.streak_freeze or 0)

        if user.last_solve_date == yesterday:
            new_streak = current_streak + 1
        elif user.last_solve_date and user.last_solve_date < yesterday and freeze_balance > 0:
            new_streak = current_streak
            user.streak_freeze = max(0, freeze_balance - 1)
        else:
            new_streak = 1

        user.streak = new_streak
        user.longest_streak = max(int(user.longest_streak or 0), new_streak)
        user.last_solve_date = today
        user.last_active = datetime.utcnow()

        if history_row is None:
            history_row = StreakHistory(user_id=user_id, streak_date=today, solved=0, streak_day=new_streak)
            db.add(history_row)
        history_row.solved = int(history_row.solved or 0) + 1
        history_row.streak_day = new_streak

        db.flush()
        return self.get_streak_snapshot(db, user_id)

    def ensure_upcoming_daily_challenges(self, db: Session, days: int = 7) -> None:
        today = datetime.now(_coerce_timezone("Asia/Tashkent")).date()
        scheduled_dates = {
            row.challenge_date
            for row in db.query(DailyChallenge).filter(DailyChallenge.challenge_date >= today).all()
        }

        missing_dates = [today + timedelta(days=offset) for offset in range(days) if today + timedelta(days=offset) not in scheduled_dates]
        if not missing_dates:
            return

        recent_cutoff = today - timedelta(days=30)
        recent_problem_ids = {
            row.problem_id
            for row in db.query(DailyChallenge.problem_id).filter(DailyChallenge.challenge_date >= recent_cutoff).all()
        }

        eligible = db.query(Problem).filter(Problem.difficulty.in_(["easy", "medium"])).all()
        unused = [problem for problem in eligible if problem.id not in recent_problem_ids]
        pool = unused if len(unused) >= len(missing_dates) else eligible
        if not pool:
            return

        random.shuffle(pool)
        for index, challenge_date in enumerate(missing_dates):
            problem = pool[index % len(pool)]
            db.add(DailyChallenge(problem_id=problem.id, challenge_date=challenge_date, is_premium=False))

        db.flush()

    def get_or_create_today_challenge(self, db: Session) -> DailyChallenge | None:
        self.ensure_upcoming_daily_challenges(db, days=7)
        today = datetime.now(_coerce_timezone("Asia/Tashkent")).date()
        return (
            db.query(DailyChallenge)
            .filter(DailyChallenge.challenge_date == today)
            .first()
        )


engagement_service = EngagementService()
