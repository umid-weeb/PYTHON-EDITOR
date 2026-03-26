from __future__ import annotations

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.database import Base


class ProblemTranslation(Base):
    __tablename__ = "problem_translations"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    problem_id = Column(String(36), ForeignKey("problems.id", ondelete="CASCADE"), index=True, nullable=False)
    language_code = Column(String(5), nullable=False)
    title = Column(Text, nullable=False)
    description = Column(Text, nullable=False)
    input_format = Column(Text, nullable=True)
    output_format = Column(Text, nullable=True)
    constraints = Column(Text, nullable=True)
    starter_code = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationship to Problem
    problem = relationship("Problem", back_populates="translations")

    # Unique constraint handled at database level
    __table_args__ = (
        # Ensure unique combination of problem_id and language_code
        # This is enforced at database level in the migration
    )


# Add relationship to existing Problem model
# This should be added to the Problem model in problem.py
# Problem.translations = relationship("ProblemTranslation", back_populates="problem", cascade="all, delete-orphan", passive_deletes=True)