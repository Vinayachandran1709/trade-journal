from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), hashed_password.encode("utf-8")
        )
    except ValueError:
        # Treat malformed or legacy hashes as an auth failure instead of a 500.
        return False


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
    except (jwt.InvalidTokenError, jwt.ExpiredSignatureError):
        return None


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    """Validate credentials and return the user, or None if invalid."""
    user = get_user_by_email(db, email)
    if not user or not verify_password(password, user.hashed_password):
        return None
    return user


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def user_exists_by_email(db: Session, email: str) -> bool:
    return db.query(User.id).filter(User.email == email).first() is not None


def create_user(db: Session, email: str, password: str, name: str | None) -> User:
    user = User(email=email, hashed_password=hash_password(password), name=name)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_user_preferences(
    db: Session,
    user: User,
    *,
    brokers: list[str],
    sectors: list[str],
    style: str | None,
    daily_loss_limit,
) -> User:
    user.preferences = {
        "brokers": brokers,
        "sectors": sectors,
        "style": style,
        "daily_loss_limit": float(daily_loss_limit) if daily_loss_limit is not None else None,
    }
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
