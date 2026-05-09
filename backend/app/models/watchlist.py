from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    symbol = Column(String(50), nullable=False, index=True)
    added_at = Column(DateTime, default=datetime.utcnow)
    notes = Column(String(500), nullable=True)
    alert_price_above = Column(String(20), nullable=True)
    alert_price_below = Column(String(20), nullable=True)

    user = relationship("User", back_populates="watchlist_items")
