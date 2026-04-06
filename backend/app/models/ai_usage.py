from __future__ import annotations

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text, func

from app.database import Base


class AIChatUsage(Base):
    """Tracks daily AI chat usage per user (registered) or IP (guest)."""

    __tablename__ = "ai_chat_usage"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    ip_address = Column(String(45), nullable=True, index=True)  # IPv6 max = 45 chars
    date = Column(Date, nullable=False, index=True)
    request_count = Column(Integer, nullable=False, default=0)
    # JSON array of problem slugs discussed that day — e.g. ["two-sum", "valid-parens"]
    # Used for analytics: which problems users struggle with most
    topics_summary = Column(Text, nullable=True, default="[]")
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
