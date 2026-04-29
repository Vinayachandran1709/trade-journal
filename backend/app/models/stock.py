from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, JSON, String, Text

from app.database import Base


class Stock(Base):
    __tablename__ = "stocks"

    id = Column(Integer, primary_key=True, index=True)
    isin = Column(String(32), unique=True, index=True, nullable=True)
    company_name = Column(String(255), nullable=False)
    display_name = Column(String(255), nullable=False)
    normalized_company_name = Column(String(255), index=True, nullable=False)
    nse_symbol = Column(String(32), index=True, nullable=True)
    bse_code = Column(String(32), index=True, nullable=True)
    exchanges = Column(JSON, nullable=False, default=list)
    aliases = Column(JSON, nullable=False, default=list)
    alias_blob = Column(Text, nullable=False, default="")
    status = Column(String(32), nullable=False, default="active")
    last_updated = Column(DateTime, nullable=False, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
