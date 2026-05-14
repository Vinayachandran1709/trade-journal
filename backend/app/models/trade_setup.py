from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, Numeric, String, Text
from sqlalchemy.orm import relationship

from app.database import Base
from app.utils.datetime import utcnow_naive


class TradeSetup(Base):
    __tablename__ = "trade_setups"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    setup_config = Column(JSON)
    is_active = Column(Boolean, default=True, nullable=False)
    symbol = Column(String(50), index=True)
    thesis = Column(Text)
    entry_price = Column(Numeric(12, 2))
    stop_loss_price = Column(Numeric(12, 2))
    target_price = Column(Numeric(12, 2))
    target2_price = Column(Numeric(12, 2))
    conviction_score = Column(Integer)
    checklist_responses = Column(JSON)
    position_size = Column(Integer)
    risk_amount = Column(Numeric(12, 2))
    risk_score = Column(Integer)
    risk_level = Column(String(20))
    linked_trade_id = Column(Integer, ForeignKey("completed_trades.id"), nullable=True, index=True)
    linked_at = Column(DateTime)
    created_at = Column(DateTime, default=utcnow_naive)
    updated_at = Column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)

    user = relationship("User", back_populates="trade_setups")
    trade_checklists = relationship("TradeChecklist", back_populates="trade_setup")
    linked_trade = relationship("CompletedTrade")
