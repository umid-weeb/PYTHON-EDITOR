from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.database import Base


class Submission(Base):
    __tablename__ = "submissions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    problem_id = Column(String(36), ForeignKey("problems.id", ondelete="CASCADE"), index=True, nullable=False)
    code = Column(Text, nullable=False)
    language = Column(String(20), nullable=False)  # "python", "javascript", "cpp"
    status = Column(String(20), nullable=False, default="pending")  # "pending", "running", "completed"
    verdict = Column(String(20), nullable=True)  # "accepted", "wrong_answer", "time_limit_exceeded", etc.
    runtime_ms = Column(Integer, nullable=True)
    memory_kb = Column(Integer, nullable=True)
    error_text = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    user = relationship("User", back_populates="submissions")
    problem = relationship("Problem", back_populates="submissions")


class SolvedProblem(Base):
    __tablename__ = "solved_problems"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    problem_id = Column(String(36), ForeignKey("problems.id", ondelete="CASCADE"), index=True, nullable=False)
    solved_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Unique constraint handled at database level
    __table_args__ = (
        # Ensure unique combination of user_id and problem_id
        # This is enforced at database level in the migration
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
    rating = Column(Integer, default=1000, nullable=False)
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationship
    user = relationship("User", back_populates="stats")