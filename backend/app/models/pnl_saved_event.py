from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, JSON, Numeric, String, text
from sqlalchemy.orm import relationship

from app.database import Base
from app.utils.datetime import utcnow_naive


class PnlSavedEvent(Base):
    __tablename__ = "pnl_saved_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    broker_connection_id = Column(Integer, ForeignKey("broker_connections.id"), nullable=True)
    broker_order_id = Column(Integer, ForeignKey("broker_orders.id"), nullable=True)
    trade_guard_event_id = Column(Integer, ForeignKey("trade_guard_events.id"), nullable=False, index=True)
    symbol = Column(String(50), nullable=True, index=True)
    session_date = Column(Date, nullable=True, index=True)
    trigger_price = Column(Numeric(12, 2), nullable=True)
    price_after_15m = Column(Numeric(12, 2), nullable=True)
    price_after_30m = Column(Numeric(12, 2), nullable=True)
    estimated_saved_amount = Column(Numeric(12, 2), nullable=True)
    saved_basis = Column(String(100), nullable=True)
    methodology_version = Column(
        String(50),
        nullable=False,
        default="v1",
        server_default=text("'v1'"),
    )
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utcnow_naive)

    user = relationship("User", back_populates="pnl_saved_events")
    broker_connection = relationship("BrokerConnection", back_populates="pnl_saved_events")
    broker_order = relationship("BrokerOrder", back_populates="pnl_saved_events")
    trade_guard_event = relationship("TradeGuardEvent", back_populates="pnl_saved_events")
