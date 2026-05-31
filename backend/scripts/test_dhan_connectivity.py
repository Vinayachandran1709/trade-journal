"""
Local Dhan API connectivity test.

Windows CMD:
  set DHAN_ACCESS_TOKEN=your_access_token_here
  set DHAN_CLIENT_ID=your_client_id_here
  python scripts\\test_dhan_connectivity.py

Windows PowerShell:
  $env:DHAN_ACCESS_TOKEN="your_access_token_here"
  $env:DHAN_CLIENT_ID="your_client_id_here"
  python .\\scripts\\test_dhan_connectivity.py

Notes:
  - `DHAN_CLIENT_ID` is optional.
  - This script is for local diagnostics only.
  - It prints safe, truncated response details and never prints your token.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any

import httpx


ENDPOINTS = [
    "https://api.dhan.co/v2/orders",
    "https://api.dhan.co/v2/trades",
    "https://api.dhan.co/v2/positions",
    "https://api.dhan.co/v2/holdings",
]

BODY_PREVIEW_LIMIT = 500
REQUEST_TIMEOUT_SECONDS = 20.0


def classify_response(content_type: str, body_text: str, parsed_json: Any) -> str:
    if isinstance(parsed_json, dict):
        return "json object"
    if isinstance(parsed_json, list):
        return "json array"

    content_type_lower = content_type.lower()
    trimmed = body_text.lstrip().lower()

    if "html" in content_type_lower or trimmed.startswith("<!doctype html") or trimmed.startswith("<html"):
        return "html"
    if "json" in content_type_lower:
        return "json"
    return "text"


def truncate_text(text: str, limit: int = BODY_PREVIEW_LIMIT) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + "... [truncated]"


def print_response_summary(endpoint: str, response: httpx.Response) -> None:
    content_type = response.headers.get("content-type", "unknown")
    body_text = response.text
    parsed_json: Any = None

    try:
        parsed_json = response.json()
    except (ValueError, json.JSONDecodeError):
        parsed_json = None

    response_shape = classify_response(content_type, body_text, parsed_json)

    print(f"Endpoint: {endpoint}")
    print(f"Status code: {response.status_code}")
    print(f"Content-Type: {content_type}")
    print(f"Response shape: {response_shape}")
    print(f"Body preview (first {BODY_PREVIEW_LIMIT} chars):")
    print(truncate_text(body_text))

    if isinstance(parsed_json, dict):
        print(f"Top-level keys: {list(parsed_json.keys())}")
    elif isinstance(parsed_json, list):
        if parsed_json and isinstance(parsed_json[0], dict):
            print(f"First item keys: {list(parsed_json[0].keys())}")
        elif parsed_json:
            print(f"First item type: {type(parsed_json[0]).__name__}")
        else:
            print("First item keys: [] (empty array)")

    print("-" * 80)


def main() -> int:
    access_token = os.getenv("DHAN_ACCESS_TOKEN")
    client_id = os.getenv("DHAN_CLIENT_ID")

    if not access_token:
        print("Error: Missing required environment variable `DHAN_ACCESS_TOKEN`.", file=sys.stderr)
        print("Set it before running this script.", file=sys.stderr)
        print("CMD: set DHAN_ACCESS_TOKEN=your_access_token_here", file=sys.stderr)
        print('PowerShell: $env:DHAN_ACCESS_TOKEN="your_access_token_here"', file=sys.stderr)
        return 1

    headers = {
        "access-token": access_token,
        "Content-Type": "application/json",
    }
    if client_id:
        headers["dhanClientId"] = client_id

    print("Running local Dhan connectivity checks...")
    print(f"Client ID header included: {'yes' if client_id else 'no'}")
    print("-" * 80)

    with httpx.Client(timeout=REQUEST_TIMEOUT_SECONDS, follow_redirects=True) as client:
        for endpoint in ENDPOINTS:
            try:
                response = client.get(endpoint, headers=headers)
                print_response_summary(endpoint, response)
            except httpx.TimeoutException:
                print(f"Endpoint: {endpoint}")
                print("Error: Request timed out.")
                print("-" * 80)
            except httpx.HTTPError as exc:
                print(f"Endpoint: {endpoint}")
                print(f"Error: HTTP request failed: {exc}")
                print("-" * 80)
            except Exception as exc:  # pragma: no cover - defensive diagnostic path
                print(f"Endpoint: {endpoint}")
                print(f"Error: Unexpected failure: {exc}")
                print("-" * 80)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
