from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    name = Column(String(100))
    created_at = Column(DateTime, default=datetime.utcnow)

    trades = relationship("Trade", back_populates="user")
    pattern_analyses = relationship("PatternAnalysis", back_populates="user")
    completed_trades = relationship("CompletedTrade", back_populates="user")
