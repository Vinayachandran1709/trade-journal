"""Backend setup verification script. Run with: python test_setup.py"""

import sys
from pathlib import Path

# Ensure the backend directory is on the Python path
sys.path.insert(0, str(Path(__file__).resolve().parent))

passed = 0
failed = 0


def check(label, fn):
    global passed, failed
    try:
        fn()
        passed += 1
    except Exception as e:
        failed += 1
        print(f"   Error: {e}\n")


print("Testing backend setup...\n")

# ── 1. Config ────────────────────────────────────────────────
print("1. Config Import:", end=" ")
def test_config():
    from app.config import settings
    print("\u2705 Success")
    url_preview = settings.DATABASE_URL[:30] + "..." if len(settings.DATABASE_URL) > 30 else settings.DATABASE_URL
    print(f"   Database URL: {url_preview}")
    print(f"   Algorithm: {settings.ALGORITHM}")
    print(f"   Token Expiry: {settings.ACCESS_TOKEN_EXPIRE_MINUTES} minutes\n")
check("Config Import", test_config)

# ── 2. Database ──────────────────────────────────────────────
print("2. Database Import:", end=" ")
def test_database():
    from app.database import Base, engine, SessionLocal, get_db
    print("\u2705 Success")
    print(f"   Base class exists: {Base is not None}")
    print(f"   Engine created: {engine is not None}")
    print(f"   SessionLocal ready: {SessionLocal is not None}\n")
check("Database Import", test_database)

# ── 3. Models ────────────────────────────────────────────────
print("3. Models Import:", end=" ")
models_ok = True
def test_models():
    global models_ok
    errors = []

    try:
        from app.models.user import User
        user_status = "\u2705"
        user_table = User.__tablename__
    except Exception as e:
        user_status = f"\u274c ({e})"
        user_table = None
        models_ok = False

    try:
        from app.models.trade import Trade
        trade_status = "\u2705"
        trade_table = Trade.__tablename__
    except Exception as e:
        trade_status = f"\u274c ({e})"
        trade_table = None
        models_ok = False

    try:
        from app.models.pattern_analysis import PatternAnalysis
        pattern_status = "\u2705"
        pattern_table = PatternAnalysis.__tablename__
    except Exception as e:
        pattern_status = f"\u274c ({e})"
        pattern_table = None
        models_ok = False

    try:
        from app.models.behavioral_pattern import BehavioralPattern
        behavioral_status = "\u2705"
        behavioral_table = BehavioralPattern.__tablename__
    except Exception as e:
        behavioral_status = f"\u274c ({e})"
        behavioral_table = None
        models_ok = False

    if models_ok:
        print("\u2705 Success")
    else:
        print("\u274c Partial failure")

    print(f"   - User model: {user_status}  (table: {user_table})")
    print(f"   - Trade model: {trade_status}  (table: {trade_table})")
    print(f"   - PatternAnalysis model: {pattern_status}  (table: {pattern_table})\n")
    print(
        f"   - BehavioralPattern model: {behavioral_status}  "
        f"(table: {behavioral_table})\n"
    )
check("Models Import", test_models)

# ── 4. Auth Service ──────────────────────────────────────────
print("4. Auth Service:", end=" ")
def test_auth_service():
    from app.services.auth_service import hash_password, verify_password, create_access_token, decode_access_token
    hashed = hash_password("testpass123")
    assert verify_password("testpass123", hashed), "Password verification failed"
    token = create_access_token({"sub": "test@example.com"})
    payload = decode_access_token(token)
    assert payload is not None and payload["sub"] == "test@example.com", "Token decode failed"
    print("\u2705 Success")
    print("   Password hashing: \u2705")
    print("   JWT create/decode: \u2705\n")
check("Auth Service", test_auth_service)

# ── 5. Database Connection ───────────────────────────────────
print("5. Database Connection:", end=" ")
def test_connection():
    from app.database import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1"))
        value = result.scalar()
        assert value == 1
    print("\u2705 Success")
    print("   Connection test passed\n")
check("Database Connection", test_connection)

# ── Summary ──────────────────────────────────────────────────
print("=" * 45)
if failed == 0:
    print(f"\u2705 All {passed} checks passed! Backend is ready.")
else:
    print(f"\u274c {failed} check(s) failed, {passed} passed.")
    print("   Fix the errors above before running the server.")
