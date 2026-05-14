from sqlalchemy import Column, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.database import Base
from app.utils.datetime import utcnow_naive


class PatternAnalysis(Base):
    __tablename__ = "pattern_analyses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    patterns = Column(JSONB, nullable=False)
    analyzed_at = Column(DateTime, default=utcnow_naive)

    user = relationship("User", back_populates="pattern_analyses")
