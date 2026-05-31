from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, text
from sqlalchemy.orm import relationship

from app.database import Base
from app.utils.datetime import utcnow_naive


class BrokerConnection(Base):
    __tablename__ = "broker_connections"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "broker_name",
            "client_id",
            name="uq_broker_connections_user_broker_client",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    broker_name = Column(String(50), nullable=False, index=True)
    broker_user_id = Column(String(255), nullable=True)
    client_id = Column(String(255), nullable=True)
    account_label = Column(String(255), nullable=True)
    access_token_encrypted = Column(Text, nullable=True)
    refresh_token_encrypted = Column(Text, nullable=True)
    token_expires_at = Column(DateTime, nullable=True, index=True)
    auth_status = Column(
        String(50),
        nullable=False,
        default="disconnected",
        server_default=text("'disconnected'"),
        index=True,
    )
    sync_status = Column(
        String(50),
        nullable=False,
        default="never_synced",
        server_default=text("'never_synced'"),
    )
    last_synced_at = Column(DateTime, nullable=True)
    last_error_code = Column(String(100), nullable=True)
    last_error_message = Column(Text, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    created_at = Column(DateTime, default=utcnow_naive)
    updated_at = Column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)

    user = relationship("User", back_populates="broker_connections")
    broker_orders = relationship("BrokerOrder", back_populates="broker_connection")
    trade_guard_events = relationship("TradeGuardEvent", back_populates="broker_connection")
    pnl_saved_events = relationship("PnlSavedEvent", back_populates="broker_connection")
