from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.database import Base


class PatternAnalysis(Base):
    __tablename__ = "pattern_analyses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    patterns = Column(JSONB, nullable=False)
    analyzed_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="pattern_analyses")
