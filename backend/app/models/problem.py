from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import relationship

from app.database import Base


class Problem(Base):
    __tablename__ = "problems"

    id = Column(String(36), primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    slug = Column(String(180), unique=True, index=True, nullable=False)
    difficulty = Column(String(20), index=True, nullable=False)
    description = Column(Text, nullable=False)
    input_format = Column(Text, nullable=True)
    output_format = Column(Text, nullable=True)
    constraints_text = Column("constraints", Text, nullable=True)
    starter_code = Column(Text, nullable=False)
    function_name = Column(String(64), nullable=False, default="solve")
    # Language-agnostic signature spec (source of truth for per-language stubs):
    # {"function_name": str, "params": [{"name", "type"}], "returns": {"type"}}
    signature_json = Column(Text, nullable=True)
    tags_json = Column(Text, nullable=False, default="[]")
    leetcode_id = Column(Integer, nullable=True)
    order_index = Column(Integer, nullable=True, index=True)
    is_published = Column(Boolean, nullable=True, default=True)
    view_count = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    test_cases = relationship(
        "TestCase",
        back_populates="problem",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="TestCase.sort_order.asc()",
    )
    
    # Relationships for submission system
    submissions = relationship(
        "Submission",
        back_populates="problem",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    solved_problems = relationship(
        "SolvedProblem",
        back_populates="problem",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    translations = relationship(
        "ProblemTranslation",
        back_populates="problem",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    starter_codes = relationship(
        "ProblemStarterCode",
        back_populates="problem",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class ProblemStarterCode(Base):
    """Per-(problem, programming-language) starter stub.

    Generated from ``Problem.signature_json``; ``is_custom`` marks rows that
    were manually edited so a regeneration pass leaves them untouched.
    """

    __tablename__ = "problem_starter_codes"
    __table_args__ = (
        UniqueConstraint("problem_id", "language", name="uq_problem_starter_lang"),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    problem_id = Column(String(36), ForeignKey("problems.id", ondelete="CASCADE"), nullable=False)
    language = Column(String(20), nullable=False)
    code = Column(Text, nullable=False)
    is_custom = Column(Boolean, nullable=False, default=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    problem = relationship("Problem", back_populates="starter_codes")


class TestCase(Base):
    __tablename__ = "test_cases"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    problem_id = Column(String(36), ForeignKey("problems.id", ondelete="CASCADE"), index=True, nullable=False)
    input = Column(Text, nullable=False)
    expected_output = Column(Text, nullable=False)
    is_hidden = Column(Boolean, nullable=False, default=False)
    sort_order = Column(Integer, nullable=False, default=0)

    problem = relationship("Problem", back_populates="test_cases")
