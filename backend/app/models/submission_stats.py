from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.database import Base


class UserSubmission(Base):
    __tablename__ = "user_submissions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    problem_id = Column(String(36), index=True, nullable=False)
    submission_id = Column(String(64), index=True, nullable=False)
    language = Column(String(64), nullable=True)
    verdict = Column(String(64), nullable=True)
    runtime_ms = Column(Integer, nullable=True)
    memory_kb = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", backref="submissions")
    problem = relationship("Problem", backref="user_submissions")


class UserProgress(Base):
    __tablename__ = "user_progress"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    problem_id = Column(String(36), ForeignKey("problems.id", ondelete="CASCADE"), primary_key=True)
    solved_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    attempts = Column(Integer, nullable=False, default=1, server_default="1")
    best_runtime = Column(Integer, nullable=True)
    best_memory = Column(Integer, nullable=True)

    user = relationship("User", backref="progress_rows")
    problem = relationship("Problem", backref="progress_rows")


class SubmissionRecord(Base):
    __tablename__ = "submissions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    external_submission_id = Column(String(64), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True)
    problem_id = Column(String(36), ForeignKey("problems.id", ondelete="SET NULL"), index=True, nullable=True)
    code = Column(Text, nullable=False)
    language = Column(String(64), nullable=False)
    status = Column(String(64), nullable=False, default="pending")
    verdict = Column(String(64), nullable=True)
    runtime = Column(Float, nullable=True)
    memory_kb = Column(Integer, nullable=True)
    error_text = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", backref="submission_records")
    problem = relationship("Problem", backref="submission_records")


class UserStats(Base):
    __tablename__ = "user_stats"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    solved_count = Column(Integer, nullable=False, default=0)
    easy_solved = Column(Integer, nullable=False, default=0)
    medium_solved = Column(Integer, nullable=False, default=0)
    hard_solved = Column(Integer, nullable=False, default=0)
    rating = Column(Integer, nullable=False, default=1200)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", backref="stats_row")

