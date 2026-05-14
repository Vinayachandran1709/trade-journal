from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Time,
)
from sqlalchemy.orm import relationship

from app.database import Base
from app.utils.datetime import utcnow_naive


class Trade(Base):
    __tablename__ = "trades"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    stock_symbol = Column(String(20), nullable=False)
    trade_type = Column(String(10), nullable=False)
    quantity = Column(Integer, nullable=False)
    price = Column(Numeric(10, 2), nullable=False)
    trade_date = Column(Date, nullable=False)
    broker = Column(String(50))
    import_source = Column(String(20))
    emotion_tag = Column(String(50))
    notes = Column(Text)
    screenshot_url = Column(String(500))
    entry_method = Column(String(100))
    trade_time = Column(Time)
    instrument_type = Column(String(50))
    created_at = Column(DateTime, default=utcnow_naive)

    user = relationship("User", back_populates="trades")
