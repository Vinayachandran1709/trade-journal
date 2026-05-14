from datetime import datetime, timezone


def utcnow_naive() -> datetime:
    """Return a naive UTC datetime for legacy DB columns storing UTC without tzinfo."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
