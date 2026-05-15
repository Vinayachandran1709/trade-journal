from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings

if settings.DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        settings.DATABASE_URL,
        connect_args={"check_same_thread": False},
        echo=False,
    )
else:
    # Create engine with connection pool settings optimized for Neon.
    # Avoid per-request pre-ping latency; recycle idle connections instead.
    engine = create_engine(
        settings.DATABASE_URL,
        pool_pre_ping=False,
        pool_recycle=300,
        pool_size=5,
        max_overflow=10,
        pool_use_lifo=True,
        echo=False,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
