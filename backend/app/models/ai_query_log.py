from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base
from app.utils.datetime import utcnow_naive


class AIQueryLog(Base):
    __tablename__ = "ai_query_logs"
    __table_args__ = (
        Index(
            "ix_ai_query_logs_user_type_created_at",
            "user_id",
            "query_type",
            "created_at",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    query_type = Column(String(50), nullable=False)
    symbol = Column(String(50), nullable=False)
    created_at = Column(DateTime, default=utcnow_naive, nullable=False, index=True)

    user = relationship("User", back_populates="ai_query_logs")
