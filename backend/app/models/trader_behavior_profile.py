from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, text
from sqlalchemy.orm import relationship

from app.database import Base
from app.utils.datetime import utcnow_naive


class TraderBehaviorProfile(Base):
    __tablename__ = "trader_behavior_profiles"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "profile_version",
            name="uq_trader_behavior_profiles_user_profile_version",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    profile_version = Column(Integer, nullable=False, default=1, server_default=text("1"))
    is_active = Column(Boolean, nullable=False, default=True, server_default=text("true"), index=True)
    trader_type = Column(String(100), nullable=True)
    biggest_leak = Column(Text, nullable=True)
    strongest_edge = Column(Text, nullable=True)
    best_time_window = Column(String(100), nullable=True)
    worst_time_window = Column(String(100), nullable=True)
    sample_completed_trade_count = Column(Integer, nullable=False, default=0, server_default=text("0"))
    sample_broker_order_count = Column(Integer, nullable=False, default=0, server_default=text("0"))
    revenge_score = Column(Integer, nullable=False, default=0, server_default=text("0"))
    overtrading_score = Column(Integer, nullable=False, default=0, server_default=text("0"))
    sizing_risk_score = Column(Integer, nullable=False, default=0, server_default=text("0"))
    expiry_risk_score = Column(Integer, nullable=False, default=0, server_default=text("0"))
    tilt_score = Column(Integer, nullable=False, default=0, server_default=text("0"))
    discipline_score = Column(Integer, nullable=False, default=0, server_default=text("0"))
    graveyard_setups = Column(JSON, nullable=True)
    best_time_buckets = Column(JSON, nullable=True)
    worst_time_buckets = Column(JSON, nullable=True)
    profile_summary = Column(JSON, nullable=True)
    generated_at = Column(DateTime, nullable=False, default=utcnow_naive, index=True)
    created_at = Column(DateTime, default=utcnow_naive)
    updated_at = Column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)

    user = relationship("User", back_populates="trader_behavior_profiles")
    trade_guard_events = relationship("TradeGuardEvent", back_populates="behavior_profile")
