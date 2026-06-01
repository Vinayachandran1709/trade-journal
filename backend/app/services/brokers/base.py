from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


class BrokerAuthError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        error_code: str | None = None,
        error_type: str | None = None,
        payload: Any = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.error_code = error_code
        self.error_type = error_type
        self.payload = payload


class BrokerAPIError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        payload: Any = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload


@dataclass
class BrokerValidationResult:
    broker_user_id: str | None = None
    account_label: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

