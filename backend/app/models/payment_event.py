from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import relationship

from app.database import Base
from app.utils.datetime import utcnow_naive


class PaymentEvent(Base):
    __tablename__ = "payment_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    provider = Column(String(50), nullable=False)
    event_type = Column(String(100), nullable=False)
    provider_event_id = Column(String(255), nullable=False, unique=True, index=True)
    payload = Column(JSON)
    processed_at = Column(DateTime)
    created_at = Column(DateTime, default=utcnow_naive)

    user = relationship("User", back_populates="payment_events")
