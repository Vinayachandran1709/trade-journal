from sqlalchemy import Boolean, Column, DateTime, Integer, String, UniqueConstraint

from app.database import Base
from app.utils.datetime import utcnow_naive


class WaitlistEntry(Base):
    __tablename__ = "waitlist_entries"

    __table_args__ = (
        UniqueConstraint("normalized_email", name="uq_waitlist_entries_normalized_email"),
    )

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False)
    normalized_email = Column(String(255), nullable=False, index=True)
    broker = Column(String(50), nullable=False)
    early_access = Column(Boolean, nullable=False, default=False)
    source = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=utcnow_naive, nullable=False)
    updated_at = Column(
        DateTime,
        default=utcnow_naive,
        onupdate=utcnow_naive,
        nullable=False,
    )
