from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import relationship

from app.database import Base


class CompletedTrade(Base):
    __tablename__ = "completed_trades"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    stock_symbol = Column(String(20), nullable=False)
    entry_date = Column(Date, nullable=False)
    exit_date = Column(Date, nullable=False)
    entry_price = Column(Numeric(10, 2), nullable=False)
    exit_price = Column(Numeric(10, 2), nullable=False)
    quantity = Column(Integer, nullable=False)
    pnl = Column(Numeric(12, 2), nullable=False)
    return_pct = Column(Numeric(6, 2), nullable=False)
    holding_days = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="completed_trades")
