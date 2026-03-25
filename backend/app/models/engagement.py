from __future__ import annotations

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import relationship

from app.database import Base


class StreakHistory(Base):
    __tablename__ = "streak_history"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_streak_history_user_date"),)

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    streak_date = Column("date", Date, nullable=False, index=True)
    solved = Column(Integer, nullable=False, default=0, server_default="0")
    streak_day = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    user = relationship("User", backref="streak_history_rows")


class DailyChallenge(Base):
    __tablename__ = "daily_challenges"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    problem_id = Column(String(36), ForeignKey("problems.id", ondelete="CASCADE"), nullable=False, index=True)
    challenge_date = Column("date", Date, nullable=False, unique=True, index=True)
    is_premium = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    problem = relationship("Problem", backref="daily_challenge_rows")
