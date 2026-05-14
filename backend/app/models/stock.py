from sqlalchemy import Column, DateTime, Integer, JSON, String, Text

from app.database import Base
from app.utils.datetime import utcnow_naive


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
    last_updated = Column(DateTime, nullable=False, default=utcnow_naive)
    created_at = Column(DateTime, default=utcnow_naive)
    updated_at = Column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)
