from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from app.services.brokers.base import (
    BrokerAPIError,
    BrokerAuthError,
    BrokerValidationResult,
)


DHAN_BASE_URL = "https://api.dhan.co/v2"
REQUEST_TIMEOUT_SECONDS = 20.0


@dataclass
class DhanSyncPayload:
    orders: list[dict[str, Any]]
    trades: list[dict[str, Any]]
    positions: list[dict[str, Any]]
    holdings: list[dict[str, Any]]


def _normalize_list_payload(payload: Any) -> list[dict[str, Any]]:
    if payload is None:
        return []
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("data", "results", "items"):
            nested = payload.get(key)
            if isinstance(nested, list):
                return [item for item in nested if isinstance(item, dict)]
    raise BrokerAPIError("Unexpected Dhan response format", payload=payload)


class DhanBrokerClient:
    def __init__(
        self,
        *,
        access_token: str,
        client_id: str,
        timeout_seconds: float = REQUEST_TIMEOUT_SECONDS,
    ) -> None:
        self.access_token = access_token.strip()
        self.client_id = client_id.strip()
        self.timeout_seconds = timeout_seconds

    def _headers(self) -> dict[str, str]:
        return {
            "access-token": self.access_token,
            "dhanClientId": self.client_id,
            "Content-Type": "application/json",
        }

    def _request(self, path: str) -> Any:
        url = f"{DHAN_BASE_URL}{path}"
        try:
            response = httpx.get(
                url,
                headers=self._headers(),
                timeout=self.timeout_seconds,
            )
        except httpx.TimeoutException as exc:
            raise BrokerAPIError("Dhan request timed out") from exc
        except httpx.HTTPError as exc:
            raise BrokerAPIError(f"Dhan request failed: {exc}") from exc

        try:
            payload = response.json()
        except ValueError:
            payload = None

        if response.status_code == 401:
            error_code = payload.get("errorCode") if isinstance(payload, dict) else None
            error_type = payload.get("errorType") if isinstance(payload, dict) else None
            detail = payload.get("errorMessage") if isinstance(payload, dict) else None
            raise BrokerAuthError(
                detail or "Dhan authentication failed",
                status_code=response.status_code,
                error_code=error_code,
                error_type=error_type,
                payload=payload,
            )

        if response.status_code >= 400:
            detail = payload.get("errorMessage") if isinstance(payload, dict) else None
            raise BrokerAPIError(
                detail or f"Dhan request failed with status {response.status_code}",
                status_code=response.status_code,
                payload=payload,
            )

        return payload

    def validate_credentials(self) -> BrokerValidationResult:
        orders_payload = self._request("/orders")
        orders = _normalize_list_payload(orders_payload)
        broker_user_id = self.client_id
        if orders:
            broker_user_id = str(
                orders[0].get("dhanClientId") or self.client_id
            )

        return BrokerValidationResult(
            broker_user_id=broker_user_id,
            metadata={"validated_with": "orders"},
        )

    def fetch_sync_payload(self) -> DhanSyncPayload:
        return DhanSyncPayload(
            orders=_normalize_list_payload(self._request("/orders")),
            trades=_normalize_list_payload(self._request("/trades")),
            positions=_normalize_list_payload(self._request("/positions")),
            holdings=_normalize_list_payload(self._request("/holdings")),
        )
