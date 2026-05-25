from __future__ import annotations

import calendar
import logging
import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from sqlalchemy.orm import Session

from app.models.completed_trade import CompletedTrade
from app.models.trade import Trade

logger = logging.getLogger(__name__)

MONTH_MAP = {
    "JAN": 1,
    "FEB": 2,
    "MAR": 3,
    "APR": 4,
    "MAY": 5,
    "JUN": 6,
    "JUL": 7,
    "AUG": 8,
    "SEP": 9,
    "OCT": 10,
    "NOV": 11,
    "DEC": 12,
}

INDEX_EXPIRY_WEEKDAY = {
    "MIDCPNIFTY": 0,
    "FINNIFTY": 1,
    "BANKNIFTY": 2,
    "NIFTY": 3,
    "SENSEX": 4,
    "BANKEX": 4,
}

LOT_SIZE_MAP = {
    "NIFTY": 50,
    "BANKNIFTY": 25,
    "FINNIFTY": 40,
    "MIDCPNIFTY": 75,
    "SENSEX": 10,
    "BANKEX": 15,
}

KNOWN_UNDERLYINGS = tuple(sorted(LOT_SIZE_MAP, key=len, reverse=True))
KNOWN_UNDERLYING_PATTERN = "|".join(KNOWN_UNDERLYINGS)
MONTHLY_OPTION_RE = re.compile(
    rf"^(?P<underlying>{KNOWN_UNDERLYING_PATTERN})(?P<year>\d{{2}})(?P<month>[A-Z]{{3}})(?P<strike>\d+(?:\.\d+)?)(?P<option_type>CE|PE)$"
)
MONTHLY_FUTURE_RE = re.compile(
    rf"^(?P<underlying>{KNOWN_UNDERLYING_PATTERN})(?P<year>\d{{2}})(?P<month>[A-Z]{{3}})FUT$"
)
WEEKLY_OPTION_RE = re.compile(
    rf"^(?P<underlying>{KNOWN_UNDERLYING_PATTERN})(?P<year>\d{{2}})(?P<body>\d+)(?P<option_type>CE|PE)$"
)
WEEKLY_FUTURE_RE = re.compile(
    rf"^(?P<underlying>{KNOWN_UNDERLYING_PATTERN})(?P<year>\d{{2}})(?P<body>\d+)FUT$"
)

ZERO = Decimal("0.00")
BROKERAGE_PER_LEG = Decimal("20.00")
STT_OPTION_RATE = Decimal("0.000625")
STT_FUTURE_RATE = Decimal("0.000125")
EXCHANGE_RATE_OPTION = Decimal("0.0005")
EXCHANGE_RATE_FUTURE = Decimal("0.0005")
SEBI_TURNOVER_RATE = Decimal("0.000001")
GST_RATE = Decimal("0.18")


@dataclass(frozen=True)
class ParsedInstrument:
    raw_symbol: str
    cleaned_symbol: str
    instrument_type: str
    underlying_asset: str
    strike_price: Decimal | None = None
    option_type: str | None = None
    expiry_date: date | None = None
    lot_size: int = 1
    parse_failure_reason: str | None = None

    @property
    def is_parsed_derivative(self) -> bool:
        return self.instrument_type in {"OPT", "FUT"} and self.expiry_date is not None

    @property
    def position_key(self) -> str:
        if self.instrument_type == "STK":
            return self.cleaned_symbol
        if self.instrument_type == "UNKNOWN":
            return f"UNKNOWN|{self.raw_symbol.strip().upper()}"

        expiry = self.expiry_date.isoformat() if self.expiry_date else ""
        strike = (
            format(self.strike_price, "f").rstrip("0").rstrip(".")
            if self.strike_price is not None
            else ""
        )
        return "|".join(
            [
                self.instrument_type,
                self.underlying_asset,
                expiry,
                strike,
                self.option_type or "",
            ]
        )


def clean_stock_symbol(symbol: str) -> str:
    """Remove exchange suffixes and normalize stock symbol."""
    cleaned = symbol.strip().upper()
    return re.sub(r"\.(NS|BO|NSE|BSE)$", "", cleaned)


def _quantize_money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _normalize_instrument_type(instrument_type: str | None) -> str | None:
    normalized = (instrument_type or "").strip().upper()
    if normalized in {"", "EQ", "EQUITY", "STK"}:
        return "STK" if normalized else None
    if normalized in {"OPT", "OPTION", "OPTIONS"}:
        return "OPT"
    if normalized in {"FUT", "FUTURE", "FUTURES"}:
        return "FUT"
    return normalized or None


def _lot_size_for_underlying(underlying: str | None) -> int:
    if not underlying:
        return 1
    return LOT_SIZE_MAP.get(underlying, 1)


def _match_underlying(symbol: str) -> str | None:
    for underlying in KNOWN_UNDERLYINGS:
        if symbol.startswith(underlying):
            return underlying
    return None


def _looks_like_derivative_symbol(cleaned_symbol: str, normalized_type: str | None) -> bool:
    if normalized_type in {"OPT", "FUT"}:
        return True
    underlying = _match_underlying(cleaned_symbol)
    if underlying is None:
        return False
    if cleaned_symbol.endswith(("CE", "PE", "FUT")):
        return True
    return True


def _last_weekday_of_month(year: int, month: int, weekday: int) -> date:
    last_day = calendar.monthrange(year, month)[1]
    current = date(year, month, last_day)
    while current.weekday() != weekday:
        current = date.fromordinal(current.toordinal() - 1)
    return current


def _century_year(two_digit_year: str) -> int:
    return 2000 + int(two_digit_year)


def infer_weekly_expiry(year_token: str, body: str) -> tuple[date, str] | None:
    if len(body) < 7:
        return None

    year = _century_year(year_token)
    for month_len in (1, 2):
        if len(body) <= month_len + 2:
            continue
        month_token = body[:month_len]
        day_token = body[month_len : month_len + 2]
        strike_token = body[month_len + 2 :]
        if len(strike_token) < 4:
            continue
        try:
            expiry_date = date(year, int(month_token), int(day_token))
        except ValueError:
            continue
        return expiry_date, strike_token

    return None


def parse_monthly_option(cleaned_symbol: str) -> ParsedInstrument | None:
    match = MONTHLY_OPTION_RE.fullmatch(cleaned_symbol)
    if match is None:
        return None

    month = MONTH_MAP.get(match.group("month"))
    underlying = match.group("underlying")
    expiry_weekday = INDEX_EXPIRY_WEEKDAY.get(underlying)
    if month is None or expiry_weekday is None:
        return None

    strike_price = Decimal(match.group("strike"))
    expiry_date = _last_weekday_of_month(
        _century_year(match.group("year")),
        month,
        expiry_weekday,
    )
    return ParsedInstrument(
        raw_symbol=cleaned_symbol,
        cleaned_symbol=cleaned_symbol,
        instrument_type="OPT",
        underlying_asset=underlying,
        strike_price=strike_price,
        option_type=match.group("option_type"),
        expiry_date=expiry_date,
        lot_size=_lot_size_for_underlying(underlying),
    )


def parse_weekly_option(cleaned_symbol: str) -> ParsedInstrument | None:
    match = WEEKLY_OPTION_RE.fullmatch(cleaned_symbol)
    if match is None:
        return None

    inferred = infer_weekly_expiry(match.group("year"), match.group("body"))
    if inferred is None:
        return None

    expiry_date, strike_token = inferred
    return ParsedInstrument(
        raw_symbol=cleaned_symbol,
        cleaned_symbol=cleaned_symbol,
        instrument_type="OPT",
        underlying_asset=match.group("underlying"),
        strike_price=Decimal(strike_token),
        option_type=match.group("option_type"),
        expiry_date=expiry_date,
        lot_size=_lot_size_for_underlying(match.group("underlying")),
    )


def parse_future_contract(cleaned_symbol: str) -> ParsedInstrument | None:
    monthly_match = MONTHLY_FUTURE_RE.fullmatch(cleaned_symbol)
    if monthly_match is not None:
        month = MONTH_MAP.get(monthly_match.group("month"))
        underlying = monthly_match.group("underlying")
        expiry_weekday = INDEX_EXPIRY_WEEKDAY.get(underlying)
        if month is None or expiry_weekday is None:
            return None

        expiry_date = _last_weekday_of_month(
            _century_year(monthly_match.group("year")),
            month,
            expiry_weekday,
        )
        return ParsedInstrument(
            raw_symbol=cleaned_symbol,
            cleaned_symbol=cleaned_symbol,
            instrument_type="FUT",
            underlying_asset=underlying,
            expiry_date=expiry_date,
            lot_size=_lot_size_for_underlying(underlying),
        )

    weekly_match = WEEKLY_FUTURE_RE.fullmatch(cleaned_symbol)
    if weekly_match is None:
        return None

    inferred = infer_weekly_expiry(weekly_match.group("year"), weekly_match.group("body"))
    if inferred is None:
        return None

    expiry_date, _strike_token = inferred
    return ParsedInstrument(
        raw_symbol=cleaned_symbol,
        cleaned_symbol=cleaned_symbol,
        instrument_type="FUT",
        underlying_asset=weekly_match.group("underlying"),
        expiry_date=expiry_date,
        lot_size=_lot_size_for_underlying(weekly_match.group("underlying")),
    )


def _build_unknown_instrument(
    *,
    symbol: str,
    cleaned_symbol: str,
    reason: str,
    underlying: str | None = None,
) -> ParsedInstrument:
    logger.warning("Failed to parse derivative symbol '%s': %s", cleaned_symbol, reason)
    return ParsedInstrument(
        raw_symbol=symbol,
        cleaned_symbol=cleaned_symbol,
        instrument_type="UNKNOWN",
        underlying_asset=underlying or cleaned_symbol,
        lot_size=1,
        parse_failure_reason=reason,
    )


def parse_trade_instrument(symbol: str, instrument_type: str | None = None) -> ParsedInstrument:
    cleaned_symbol = clean_stock_symbol(symbol)
    normalized_type = _normalize_instrument_type(instrument_type)

    for parser in (parse_monthly_option, parse_weekly_option, parse_future_contract):
        parsed = parser(cleaned_symbol)
        if parsed is not None:
            return ParsedInstrument(
                raw_symbol=symbol,
                cleaned_symbol=parsed.cleaned_symbol,
                instrument_type=parsed.instrument_type,
                underlying_asset=parsed.underlying_asset,
                strike_price=parsed.strike_price,
                option_type=parsed.option_type,
                expiry_date=parsed.expiry_date,
                lot_size=parsed.lot_size,
            )

    derivative_underlying = _match_underlying(cleaned_symbol)
    if _looks_like_derivative_symbol(cleaned_symbol, normalized_type):
        return _build_unknown_instrument(
            symbol=symbol,
            cleaned_symbol=cleaned_symbol,
            reason="Unsupported or malformed derivative symbol",
            underlying=derivative_underlying,
        )

    return ParsedInstrument(
        raw_symbol=symbol,
        cleaned_symbol=cleaned_symbol,
        instrument_type="STK",
        underlying_asset=cleaned_symbol,
        lot_size=1,
    )


def _calculate_total_charges(
    *,
    parsed: ParsedInstrument,
    entry_price: Decimal,
    exit_price: Decimal,
    matched_qty: int,
) -> Decimal:
    if parsed.instrument_type not in {"OPT", "FUT"}:
        return ZERO

    quantity = Decimal(matched_qty)
    lot_size = Decimal(parsed.lot_size)
    entry_turnover = entry_price * quantity * lot_size
    exit_turnover = exit_price * quantity * lot_size
    total_turnover = entry_turnover + exit_turnover

    if parsed.instrument_type == "OPT":
        stt = STT_OPTION_RATE * exit_turnover
        exchange_charges = EXCHANGE_RATE_OPTION * total_turnover
    else:
        stt = STT_FUTURE_RATE * exit_turnover
        exchange_charges = EXCHANGE_RATE_FUTURE * total_turnover

    brokerage = BROKERAGE_PER_LEG * Decimal("2")
    sebi_fee = SEBI_TURNOVER_RATE * total_turnover
    gst = GST_RATE * (brokerage + exchange_charges)

    return _quantize_money(brokerage + stt + exchange_charges + sebi_fee + gst)


def validate_trade_data(trade_dict: dict) -> bool:
    """Validate that a trade dictionary has all required fields with valid values."""
    required_fields = ["stock_symbol", "trade_type", "quantity", "price", "trade_date"]

    for field in required_fields:
        if field not in trade_dict or trade_dict[field] is None:
            return False

    if trade_dict["trade_type"] not in ["BUY", "SELL"]:
        return False

    try:
        if int(trade_dict["quantity"]) <= 0:
            return False
    except (ValueError, TypeError):
        return False

    try:
        if Decimal(str(trade_dict["price"])) <= 0:
            return False
    except (InvalidOperation, ValueError, TypeError):
        return False

    if not isinstance(trade_dict["trade_date"], date):
        try:
            date.fromisoformat(str(trade_dict["trade_date"]))
        except (ValueError, TypeError):
            return False

    return True


def calculate_completed_trades(db: Session, user_id: int) -> list[CompletedTrade]:
    """Match BUY/SELL pairs using FIFO and calculate P&L for each completed trade."""
    trades = (
        db.query(Trade)
        .filter(Trade.user_id == user_id)
        .order_by(Trade.trade_date.asc(), Trade.id.asc())
        .all()
    )

    positions: dict[str, list[list]] = {}
    completed_trades: list[CompletedTrade] = []

    for trade in trades:
        parsed = parse_trade_instrument(trade.stock_symbol, trade.instrument_type)
        position_key = parsed.position_key
        quantity = int(trade.quantity)
        price = Decimal(str(trade.price))
        trade_date = trade.trade_date

        if trade.trade_type == "BUY":
            positions.setdefault(position_key, []).append([quantity, price, trade_date, parsed])
            continue

        if position_key not in positions or not positions[position_key]:
            continue

        remaining_sell_qty = quantity
        while remaining_sell_qty > 0 and positions[position_key]:
            buy_entry = positions[position_key][0]
            buy_qty, buy_price, buy_date, buy_parsed = buy_entry
            matched_qty = min(buy_qty, remaining_sell_qty)

            gross_pnl = _quantize_money(
                (price - buy_price) * Decimal(matched_qty) * Decimal(buy_parsed.lot_size)
            )
            total_charges = _calculate_total_charges(
                parsed=buy_parsed,
                entry_price=buy_price,
                exit_price=price,
                matched_qty=matched_qty,
            )
            net_pnl = _quantize_money(gross_pnl - total_charges)
            return_pct = _quantize_money(((price - buy_price) / buy_price) * Decimal("100"))
            holding_days = (trade_date - buy_date).days

            completed_trades.append(
                CompletedTrade(
                    user_id=user_id,
                    stock_symbol=buy_parsed.cleaned_symbol,
                    entry_date=buy_date,
                    exit_date=trade_date,
                    entry_price=buy_price,
                    exit_price=price,
                    quantity=matched_qty,
                    pnl=gross_pnl,
                    gross_pnl=gross_pnl,
                    total_charges=total_charges,
                    net_pnl=net_pnl,
                    return_pct=return_pct,
                    holding_days=holding_days,
                )
            )

            buy_entry[0] -= matched_qty
            remaining_sell_qty -= matched_qty
            if buy_entry[0] <= 0:
                positions[position_key].pop(0)

    return completed_trades
