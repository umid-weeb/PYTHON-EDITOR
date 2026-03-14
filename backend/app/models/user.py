from __future__ import annotations

from sqlalchemy import Column, Integer, String, func, DateTime, Boolean, TIMESTAMP, text
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    country = Column(String(120), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    is_active = Column(Boolean, default=True)
    email = Column(String, unique=True, index=True, nullable=False)
    
    profile = relationship("UserProfile", back_populates="user", uselist=False)
