from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import relationship

from app.database import Base


class TradeChecklist(Base):
    __tablename__ = "trade_checklists"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    trade_setup_id = Column(Integer, ForeignKey("trade_setups.id"), index=True)
    name = Column(String(100), nullable=False)
    checklist_items = Column(JSON)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="trade_checklists")
    trade_setup = relationship("TradeSetup", back_populates="trade_checklists")
