from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, Numeric, String, UniqueConstraint, text
from sqlalchemy.orm import relationship

from app.database import Base
from app.utils.datetime import utcnow_naive


class BrokerOrder(Base):
    __tablename__ = "broker_orders"
    __table_args__ = (
        UniqueConstraint(
            "broker_connection_id",
            "broker_order_id",
            name="uq_broker_orders_connection_order_id",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    broker_connection_id = Column(Integer, ForeignKey("broker_connections.id"), nullable=True, index=True)
    broker_name = Column(String(50), nullable=False)
    broker_order_id = Column(String(255), nullable=False)
    broker_parent_order_id = Column(String(255), nullable=True)
    exchange = Column(String(50), nullable=True)
    segment = Column(String(50), nullable=True)
    product_type = Column(String(50), nullable=True)
    order_type = Column(String(50), nullable=True)
    side = Column(String(20), nullable=True)
    symbol = Column(String(50), nullable=False, index=True)
    instrument_token = Column(String(255), nullable=True)
    instrument_type = Column(String(50), nullable=True)
    quantity = Column(Integer, nullable=True)
    filled_quantity = Column(Integer, nullable=True)
    remaining_quantity = Column(Integer, nullable=True)
    price = Column(Numeric(12, 2), nullable=True)
    average_price = Column(Numeric(12, 2), nullable=True)
    trigger_price = Column(Numeric(12, 2), nullable=True)
    status = Column(String(50), nullable=True, index=True)
    ordered_at = Column(DateTime, nullable=True)
    executed_at = Column(DateTime, nullable=True, index=True)
    capture_source = Column(
        String(50),
        nullable=False,
        default="api",
        server_default=text("'api'"),
    )
    raw_payload = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utcnow_naive)
    updated_at = Column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)

    user = relationship("User", back_populates="broker_orders")
    broker_connection = relationship("BrokerConnection", back_populates="broker_orders")
    trade_guard_events = relationship("TradeGuardEvent", back_populates="broker_order")
    pnl_saved_events = relationship("PnlSavedEvent", back_populates="broker_order")
