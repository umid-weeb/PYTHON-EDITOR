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
    
    # Stats relationship - change uselist to True to prevent MultipleResultsFound crash if DB has duplicates
    stats_list = relationship(
        "UserStats",
        back_populates="user",
        viewonly=True,
    )
    
    @property
    def stats(self):
        """Resiliently return the first stats record if multiple exist."""
        if not self.stats_list:
            return None
        return self.stats_list[0]

    # Rating relationship - change uselist to True to prevent MultipleResultsFound crash
    rating_rows = relationship(
        "UserRating",
        back_populates="user",
        viewonly=True,
    )
    
    @property
    def rating_row(self):
        """Resiliently return the first rating record if multiple exist."""
        if not self.rating_rows:
            return None
        return self.rating_rows[0]

    # Explicitly map the rating history list
    rating_history_list = relationship(
        "RatingHistory",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
