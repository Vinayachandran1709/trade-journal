from __future__ import annotations

import base64

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


class TokenEncryptionError(RuntimeError):
    pass


def _normalized_fernet_key() -> bytes:
    raw_key = (settings.BROKER_TOKEN_ENCRYPTION_KEY or "").strip()
    if not raw_key:
        raise TokenEncryptionError(
            "BROKER_TOKEN_ENCRYPTION_KEY is not configured"
        )

    try:
        decoded = base64.urlsafe_b64decode(raw_key.encode("utf-8"))
    except Exception as exc:  # pragma: no cover - defensive error path
        raise TokenEncryptionError(
            "BROKER_TOKEN_ENCRYPTION_KEY must be a valid urlsafe-base64 Fernet key"
        ) from exc

    if len(decoded) != 32:
        raise TokenEncryptionError(
            "BROKER_TOKEN_ENCRYPTION_KEY must decode to 32 bytes"
        )

    return raw_key.encode("utf-8")


def _get_fernet() -> Fernet:
    return Fernet(_normalized_fernet_key())


def encrypt_token(value: str) -> str:
    if not value or not value.strip():
        raise TokenEncryptionError("Token value is required for encryption")
    return _get_fernet().encrypt(value.strip().encode("utf-8")).decode("utf-8")


def decrypt_token(value: str | None) -> str:
    if not value:
        raise TokenEncryptionError("Encrypted token is missing")
    try:
        return _get_fernet().decrypt(value.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise TokenEncryptionError("Encrypted token could not be decrypted") from exc
