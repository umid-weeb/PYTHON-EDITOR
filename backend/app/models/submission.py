from __future__ import annotations

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, desc, func
from sqlalchemy.orm import relationship

from app.database import Base


class Submission(Base):
    __tablename__ = "submissions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    external_submission_id = Column(Text, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True)
    problem_id = Column(String(36), ForeignKey("problems.id", ondelete="CASCADE"), index=True, nullable=False)
    code = Column(Text, nullable=False)
    language = Column(String(20), nullable=False)  # "python", "javascript", "cpp"
    mode = Column(String(10), nullable=False, default="submit", server_default="submit")
    status = Column(String(20), nullable=False, default="pending", server_default="pending")  # "pending", "running", "completed"
    verdict = Column(String(20), nullable=True)  # "accepted", "wrong_answer", "time_limit_exceeded", etc.
    runtime_ms = Column(Integer, nullable=True)
    memory_kb = Column(Integer, nullable=True)
    passed_count = Column(Integer, nullable=True)
    total_count = Column(Integer, nullable=True)
    error_text = Column(Text, nullable=True)
    case_results_json = Column(Text, nullable=False, default="[]", server_default="[]")
    is_extended = Column(Integer, nullable=False, default=0, server_default="0")  # 0 or 1
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_submissions_user_created", "user_id", desc("created_at")),
        Index("idx_submissions_problem_created", "problem_id", desc("created_at")),
        Index("idx_submissions_status", "status"),
    )

    # Relationships
    user = relationship("User", back_populates="submissions")
    problem = relationship("Problem", back_populates="submissions")


class SolvedProblem(Base):
    __tablename__ = "solved_problems"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    problem_id = Column(String(36), ForeignKey("problems.id", ondelete="CASCADE"), index=True, nullable=False)
    solved_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "problem_id", name="uq_solved_problems_user_problem"),
        Index("idx_solved_problems_user_id", "user_id"),
        Index("idx_solved_problems_problem_id", "problem_id"),
    )

    # Relationships
    user = relationship("User", back_populates="solved_problems")
    problem = relationship("Problem", back_populates="solved_problems")


class UserStats(Base):
    __tablename__ = "user_stats"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    solved_count = Column(Integer, default=0, nullable=False)
    easy_solved = Column(Integer, default=0, nullable=False)
    medium_solved = Column(Integer, default=0, nullable=False)
    hard_solved = Column(Integer, default=0, nullable=False)
    rating = Column(Integer, default=1200, nullable=False, server_default="1200")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("idx_user_stats_user_id", "user_id"),
    )

    # Relationship - point to the list relationship in the User model
    user = relationship("User", back_populates="stats_list")
