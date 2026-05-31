from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, JSON, Numeric, String, Text, text
from sqlalchemy.orm import relationship

from app.database import Base
from app.utils.datetime import utcnow_naive


class TradeGuardEvent(Base):
    __tablename__ = "trade_guard_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    broker_connection_id = Column(Integer, ForeignKey("broker_connections.id"), nullable=True, index=True)
    broker_order_id = Column(Integer, ForeignKey("broker_orders.id"), nullable=True)
    behavior_profile_id = Column(Integer, ForeignKey("trader_behavior_profiles.id"), nullable=True)
    event_type = Column(String(100), nullable=False, index=True)
    event_phase = Column(
        String(50),
        nullable=False,
        default="pre_trade",
        server_default=text("'pre_trade'"),
    )
    rule_code = Column(String(100), nullable=True)
    warning_type = Column(String(100), nullable=True, index=True)
    severity = Column(
        String(20),
        nullable=False,
        default="medium",
        server_default=text("'medium'"),
    )
    risk_score = Column(Integer, nullable=True)
    symbol = Column(String(50), nullable=True, index=True)
    session_date = Column(Date, nullable=True, index=True)
    trigger_price = Column(Numeric(12, 2), nullable=True)
    user_action = Column(String(100), nullable=True, index=True)
    state = Column(
        String(50),
        nullable=False,
        default="shown",
        server_default=text("'shown'"),
    )
    title = Column(String(255), nullable=True)
    message = Column(Text, nullable=True)
    context = Column(JSON, nullable=True)
    trigger_source = Column(
        String(50),
        nullable=False,
        default="extension",
        server_default=text("'extension'"),
    )
    acknowledged_at = Column(DateTime, nullable=True)
    event_at = Column(DateTime, nullable=False, default=utcnow_naive, index=True)
    created_at = Column(DateTime, default=utcnow_naive)

    user = relationship("User", back_populates="trade_guard_events")
    broker_connection = relationship("BrokerConnection", back_populates="trade_guard_events")
    broker_order = relationship("BrokerOrder", back_populates="trade_guard_events")
    behavior_profile = relationship("TraderBehaviorProfile", back_populates="trade_guard_events")
    pnl_saved_events = relationship("PnlSavedEvent", back_populates="trade_guard_event")
