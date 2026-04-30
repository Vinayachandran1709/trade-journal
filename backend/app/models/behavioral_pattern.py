from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base


class BehavioralPattern(Base):
    __tablename__ = "behavioral_patterns"
    __table_args__ = (
        UniqueConstraint("user_id", "pattern_type", name="uq_behavioral_patterns_user_pattern_type"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    pattern_type = Column(String(50), nullable=False)
    description = Column(Text, nullable=False)
    severity = Column(String(10), nullable=False)
    pattern_data = Column(JSON, nullable=False)
    trade_count_snapshot = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="behavioral_patterns")
