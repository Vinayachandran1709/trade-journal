from sqlalchemy import Column, DateTime, Integer, JSON, String, Text

from app.database import Base
from app.utils.datetime import utcnow_naive


class MarketDataCache(Base):
    __tablename__ = "market_data_cache"

    id = Column(Integer, primary_key=True, index=True)
    cache_key = Column(String(255), nullable=False, unique=True, index=True)
    symbol = Column(String(50), nullable=False, index=True)
    timeframe = Column(String(50))
    provider = Column(String(50))
    payload = Column(JSON)
    source_url = Column(Text)
    fetched_at = Column(DateTime, default=utcnow_naive, nullable=False)
    expires_at = Column(DateTime)
    created_at = Column(DateTime, default=utcnow_naive)
