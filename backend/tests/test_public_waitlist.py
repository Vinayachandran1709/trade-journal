import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ["DATABASE_URL"] = "sqlite:///./test_public_waitlist.sqlite3"
os.environ["SECRET_KEY"] = "test-secret-key"

from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.waitlist_entry import WaitlistEntry  # noqa: E402


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture()
def client():
    Base.metadata.create_all(bind=engine, tables=[WaitlistEntry.__table__])

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine, tables=[WaitlistEntry.__table__])


def test_create_waitlist_entry(client: TestClient):
    response = client.post(
        "/api/public/waitlist",
        json={
            "name": "Vinay",
            "email": "vinay@example.com",
            "broker": "Dhan",
            "early_access": True,
            "source": "homepage",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["email"] == "vinay@example.com"
    assert payload["broker"] == "Dhan"
    assert payload["early_access"] is True
    assert payload["id"] > 0
    assert payload["created_at"]


def test_email_normalization_is_lowercase(client: TestClient):
    client.post(
        "/api/public/waitlist",
        json={
            "name": "Trader",
            "email": "Trader@Example.COM",
            "broker": "Groww",
            "early_access": False,
            "source": "homepage",
        },
    )

    db = TestingSessionLocal()
    try:
        saved = db.query(WaitlistEntry).filter_by(normalized_email="trader@example.com").first()
        assert saved is not None
        assert saved.email == "Trader@example.com"
        assert saved.normalized_email == "trader@example.com"
    finally:
        db.close()


def test_duplicate_email_updates_existing_row(client: TestClient):
    first = client.post(
        "/api/public/waitlist",
        json={
            "name": "First Name",
            "email": "repeat@example.com",
            "broker": "Groww",
            "early_access": False,
            "source": "homepage",
        },
    )
    second = client.post(
        "/api/public/waitlist",
        json={
            "name": "Updated Name",
            "email": "Repeat@Example.com",
            "broker": "Dhan",
            "early_access": True,
            "source": "demo",
        },
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["id"] == second.json()["id"]

    db = TestingSessionLocal()
    try:
        rows = db.query(WaitlistEntry).all()
        assert len(rows) == 1
        assert rows[0].name == "Updated Name"
        assert rows[0].email == "Repeat@example.com"
        assert rows[0].normalized_email == "repeat@example.com"
        assert rows[0].broker == "Dhan"
        assert rows[0].early_access is True
        assert rows[0].source == "demo"
    finally:
        db.close()


def test_waitlist_endpoint_is_public(client: TestClient):
    response = client.post(
        "/api/public/waitlist",
        json={
            "name": "Public User",
            "email": "public@example.com",
            "broker": "Other",
            "early_access": False,
            "source": "homepage",
        },
    )

    assert response.status_code == 200


def test_invalid_email_returns_validation_error(client: TestClient):
    response = client.post(
        "/api/public/waitlist",
        json={
            "name": "Trader",
            "email": "not-an-email",
            "broker": "Zerodha",
            "early_access": False,
            "source": "homepage",
        },
    )

    assert response.status_code == 422
