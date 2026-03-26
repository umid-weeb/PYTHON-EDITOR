from __future__ import annotations

from sqlalchemy import Boolean, Column, Date, DateTime, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=True)
    password_hash = Column(String(255), nullable=False)
    display_name = Column(String(120), nullable=True)
    avatar_url = Column(String(512), nullable=True)
    bio = Column(Text, nullable=True)
    country = Column(String(120), nullable=True)
    level = Column(String(32), nullable=True)
    goal = Column(String(64), nullable=True)
    weekly_hours = Column(String(32), nullable=True)
    notifications_enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    timezone = Column(String(64), nullable=False, default="Asia/Tashkent", server_default="Asia/Tashkent")
    streak = Column(Integer, nullable=False, default=0, server_default="0")
    longest_streak = Column(Integer, nullable=False, default=0, server_default="0")
    last_solve_date = Column(Date, nullable=True)
    streak_freeze = Column(Integer, nullable=False, default=0, server_default="0")
    last_active = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships for submission system
    submissions = relationship(
        "Submission",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    solved_problems = relationship(
        "SolvedProblem",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    stats = relationship(
        "UserStats",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
