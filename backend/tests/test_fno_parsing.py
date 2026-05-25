import os
import sys
from datetime import date
from pathlib import Path

from decimal import Decimal


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ["DATABASE_URL"] = "sqlite:///./test_fno_parsing.sqlite3"
os.environ["SECRET_KEY"] = "test-secret-key"

from app.services.trade_processor import (  # noqa: E402
    infer_weekly_expiry,
    parse_monthly_option,
    parse_trade_instrument,
    parse_weekly_option,
)


def test_parse_monthly_option_extracts_contract_fields():
    parsed = parse_monthly_option("BANKNIFTY26MAY48000CE")

    assert parsed is not None
    assert parsed.instrument_type == "OPT"
    assert parsed.underlying_asset == "BANKNIFTY"
    assert parsed.strike_price == Decimal("48000")
    assert parsed.option_type == "CE"
    assert parsed.expiry_date == date(2026, 5, 27)
    assert parsed.lot_size == 25


def test_parse_weekly_option_supports_compressed_nifty_symbol():
    parsed = parse_weekly_option("NIFTY2652823100CE")

    assert parsed is not None
    assert parsed.underlying_asset == "NIFTY"
    assert parsed.strike_price == Decimal("23100")
    assert parsed.option_type == "CE"
    assert parsed.expiry_date == date(2026, 5, 28)
    assert parsed.lot_size == 50


def test_parse_weekly_option_supports_compressed_banknifty_symbol():
    parsed = parse_weekly_option("BANKNIFTY2651452000PE")

    assert parsed is not None
    assert parsed.underlying_asset == "BANKNIFTY"
    assert parsed.strike_price == Decimal("52000")
    assert parsed.option_type == "PE"
    assert parsed.expiry_date == date(2026, 5, 14)


def test_infer_weekly_expiry_returns_none_for_malformed_body():
    assert infer_weekly_expiry("26", "999") is None


def test_parse_trade_instrument_marks_bad_derivative_as_unknown():
    parsed = parse_trade_instrument("NIFTY26XYZ23100CE", "OPT")

    assert parsed.instrument_type == "UNKNOWN"
    assert parsed.raw_symbol == "NIFTY26XYZ23100CE"
    assert parsed.parse_failure_reason is not None
    assert parsed.position_key == "UNKNOWN|NIFTY26XYZ23100CE"


def test_parse_trade_instrument_keeps_stock_as_stk():
    parsed = parse_trade_instrument("RELIANCE.NS")

    assert parsed.instrument_type == "STK"
    assert parsed.cleaned_symbol == "RELIANCE"
    assert parsed.lot_size == 1
