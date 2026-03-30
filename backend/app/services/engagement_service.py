from __future__ import annotations

import random
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
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


def _date_for_timezone(value: datetime | date | None, tz_name: str | None) -> date:
    if value is None:
        return _today_for_timezone(tz_name)
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    comparable = value if value.tzinfo else value.replace(tzinfo=_coerce_timezone("UTC"))
    return comparable.astimezone(_coerce_timezone(tz_name)).date()


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
        user.last_active = datetime.now(timezone.utc)
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

    def update_streak_for_accept(
        self,
        db: Session,
        user_id: int,
        *,
        solved_at: datetime | date | None = None,
    ) -> StreakSnapshot:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError("User not found")

        tz_name = user.timezone or "Asia/Tashkent"
        solved_date = _date_for_timezone(solved_at, tz_name)
        yesterday = solved_date - timedelta(days=1)

        history_row = (
            db.query(StreakHistory)
            .filter(StreakHistory.user_id == user_id, StreakHistory.streak_date == solved_date)
            .first()
        )

        if user.last_solve_date == solved_date:
            if history_row is None:
                history_row = StreakHistory(
                    user_id=user_id,
                    streak_date=solved_date,
                    solved=0,
                    streak_day=int(user.streak or 0),
                )
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
        user.last_solve_date = solved_date
        user.last_active = datetime.now(timezone.utc)

        if history_row is None:
            history_row = StreakHistory(user_id=user_id, streak_date=solved_date, solved=0, streak_day=new_streak)
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


class EngagementSpecialist:
    """AI Engagement Specialist responsible for user re-engagement and motivation."""

    def get_motivation_message(self, db: Session, user: User) -> str | None:
        """Analyze user state and return the most relevant motivational message."""
        
        # Priority 1: Streak Maintain (Most urgent to keep zanjir)
        if user.streak >= 2:
            return self._msg_streak_maintain(user.display_name or user.username, user.streak)
            
        # Priority 2: Leaderboard Push (Competitive feel)
        leaderboard_msg = self._check_leaderboard_push(db, user)
        if leaderboard_msg:
            return leaderboard_msg
            
        # Priority 3: New Hard Problem (Challenge for pros)
        hard_problem_msg = self._check_new_hard_problem(db)
        if hard_problem_msg:
            return hard_problem_msg
            
        # Priority 4: Inactivity (Sog'inganini bildirish)
        if user.last_active:
            days_inactive = (datetime.now(timezone.utc) - user.last_active).days
            if days_inactive >= 3:
                return self._msg_inactive_3_days()
                
        # Default fallback
        return f"Bugun yangi script yozishga tayyormisiz? 🚀 www.pyzone.uz"

    def _msg_streak_maintain(self, name: str, n: int) -> str:
        templates = [
            f"{name}, 🔥 streak {n} kunda! Zanjirni uzma, bugungi masalani deploy qilish vaqti keldi! 🚀 www.pyzone.uz",
            f"🔥 {n} kunlik streak! {name}, logic-ni o'chirib qo'yma, bugungi challenge kutmoqda! 🐍 www.pyzone.uz",
        ]
        return random.choice(templates)

    def _msg_inactive_3_days(self) -> str:
        templates = [
            "3 kundan beri ko'rinmadingiz... Algoritmlar esdan chiqmasin, yangi masalalar kutmoqda! 💻 www.pyzone.uz",
            "Sizsiz Pyzone-da bug ko'payib ketdi. 😉 Qayting va yangi scriptlarni yozishni davom ettiring! 🚀 www.pyzone.uz",
        ]
        return random.choice(templates)

    def _check_leaderboard_push(self, db: Session, user: User) -> str | None:
        from app.models.rating import UserRating
        
        # Simple logic: find users with slightly higher rating who might have overtaken
        rating_row = user.rating_row
        if not rating_row:
            return None
            
        competitor = (
            db.query(User)
            .join(UserRating)
            .filter(UserRating.rating > rating_row.rating)
            .order_by(UserRating.rating.asc())
            .first()
        )
        
        if competitor:
            comp_name = competitor.display_name or competitor.username
            return f"{comp_name} sizdan o'zib ketdi! 😱 O'z o'rningizni qaytarib oling va TOP-10 talikka kiring! 🚀 www.pyzone.uz"
        
        return None

    def _check_new_hard_problem(self, db: Session) -> str | None:
        last_72h = datetime.now(timezone.utc) - timedelta(hours=72)
        new_hard = (
            db.query(Problem)
            .filter(Problem.difficulty == "hard", Problem.created_at >= last_72h)
            .first()
        )
        
        if new_hard:
            return "Yangi murakkab masala qo'shildi! 🧠 Haqiqiy Python ustalari uchun 'hard' challenge. Tayyormisiz? 💻 www.pyzone.uz"
            
        return None

    async def run_automated_notifications(self, db: Session):
        """Scan all users and send automated motivational notifications."""
        from app.services.notification_service import notification_service
        
        # 1. Base filter: notifications enabled + not notified in last 24h
        now = datetime.now(timezone.utc)
        day_ago = now - timedelta(hours=24)
        
        users = (
            db.query(User)
            .filter(User.notifications_enabled == True)
            .filter((User.last_notified_at == None) | (User.last_notified_at < day_ago))
            .limit(50)  # Safe batch size
            .all()
        )
        
        for user in users:
            # Skip if they already solved today
            today = _today_for_timezone(user.timezone)
            if user.last_solve_date == today:
                continue
                
            message = self.get_motivation_message(db, user)
            if message:
                # We skip the generic fallback to avoid boring the user
                if "Bugun yangi script yozishga tayyormisiz?" in message:
                    continue
                    
                sent = await notification_service.notify_user(user, message)
                if sent:
                    user.last_notified_at = now
        
        db.commit()


engagement_service = EngagementService()
engagement_specialist = EngagementSpecialist()
