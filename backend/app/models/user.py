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
    subscription_status = Column(String(50))
    subscription_plan = Column(String(50))
    subscription_expires_at = Column(DateTime)
    razorpay_customer_id = Column(String(255))
    razorpay_subscription_id = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)

    trades = relationship("Trade", back_populates="user")
    pattern_analyses = relationship("PatternAnalysis", back_populates="user")
    completed_trades = relationship("CompletedTrade", back_populates="user")
    behavioral_patterns = relationship("BehavioralPattern", back_populates="user")
    trade_setups = relationship("TradeSetup", back_populates="user")
    trade_checklists = relationship("TradeChecklist", back_populates="user")
    payment_events = relationship("PaymentEvent", back_populates="user")
    ai_query_logs = relationship("AIQueryLog", back_populates="user")
