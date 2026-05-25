import calendar
import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from sqlalchemy.orm import Session

from app.models.completed_trade import CompletedTrade
from app.models.trade import Trade

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
    "FINNIFTY": 1,
    "MIDCPNIFTY": 1,
    "BANKNIFTY": 2,
    "NIFTY": 3,
    "SENSEX": 3,
}

KNOWN_UNDERLYINGS = tuple(
    sorted(INDEX_EXPIRY_WEEKDAY.keys(), key=len, reverse=True)
)

ZERO = Decimal("0.00")
BROKERAGE_PER_LEG = Decimal("20.00")


@dataclass(frozen=True)
class ParsedInstrument:
    original_symbol: str
    cleaned_symbol: str
    instrument_type: str
    underlying_asset: str
    expiry_date: date | None = None
    strike_price: Decimal | None = None
    option_type: str | None = None

    @property
    def position_key(self) -> str:
        if self.instrument_type == "STK":
            return self.cleaned_symbol

        expiry = self.expiry_date.isoformat() if self.expiry_date else ""
        strike = (
            str(self.strike_price.quantize(Decimal("0.01")))
            if self.strike_price is not None
            else ""
        )
        option_type = self.option_type or ""
        return "|".join(
            [self.instrument_type, self.underlying_asset, expiry, strike, option_type]
        )


def clean_stock_symbol(symbol: str) -> str:
    """Remove exchange suffixes and normalize stock symbol."""
    symbol = symbol.strip().upper()
    symbol = re.sub(r"\.(NS|BO|NSE|BSE)$", "", symbol)
    return symbol


def _parse_underlying(symbol: str) -> str | None:
    for underlying in KNOWN_UNDERLYINGS:
        if symbol.startswith(underlying):
            return underlying
    return None


def _last_weekday_of_month(year: int, month: int, weekday: int) -> date:
    last_day = calendar.monthrange(year, month)[1]
    current = date(year, month, last_day)
    while current.weekday() != weekday:
        current = date.fromordinal(current.toordinal() - 1)
    return current


def _parse_monthly_expiry(token: str, underlying: str) -> date | None:
    match = re.fullmatch(r"(?P<year>\d{2})(?P<month>[A-Z]{3})", token)
    if not match:
        return None

    month = MONTH_MAP.get(match.group("month"))
    weekday = INDEX_EXPIRY_WEEKDAY.get(underlying)
    if month is None or weekday is None:
        return None

    year = 2000 + int(match.group("year"))
    return _last_weekday_of_month(year, month, weekday)


def _parse_weekly_expiry(token: str) -> date | None:
    match = re.fullmatch(r"(?P<month>\d{1,2})/(?P<day>\d{1,2})(?:/(?P<year>\d{2,4}))?", token)
    if not match:
        return None

    month = int(match.group("month"))
    day = int(match.group("day"))
    year_token = match.group("year")
    if year_token is None:
        year = date.today().year
    elif len(year_token) == 2:
        year = 2000 + int(year_token)
    else:
        year = int(year_token)

    try:
        return date(year, month, day)
    except ValueError:
        return None


def parse_trade_instrument(symbol: str, instrument_type: str | None = None) -> ParsedInstrument:
    cleaned_symbol = clean_stock_symbol(symbol)
    normalized_type = (instrument_type or "").strip().upper()

    if normalized_type in {"OPT", "OPTION", "OPTIONS"}:
        normalized_type = "OPT"
    elif normalized_type in {"FUT", "FUTURE", "FUTURES"}:
        normalized_type = "FUT"
    elif normalized_type in {"STK", "EQUITY", "EQ"}:
        normalized_type = "STK"

    option_match = re.fullmatch(
        r"(?P<underlying>[A-Z]+)(?P<expiry>\d{2}[A-Z]{3}|\d{1,2}/\d{1,2}(?:/\d{2,4})?)(?P<strike>\d+(?:\.\d+)?)(?P<option_type>CE|PE)",
        cleaned_symbol,
    )
    if option_match:
        underlying = _parse_underlying(option_match.group("underlying")) or option_match.group(
            "underlying"
        )
        expiry_token = option_match.group("expiry")
        expiry_date = _parse_monthly_expiry(expiry_token, underlying) or _parse_weekly_expiry(
            expiry_token
        )
        return ParsedInstrument(
            original_symbol=symbol,
            cleaned_symbol=cleaned_symbol,
            instrument_type="OPT",
            underlying_asset=underlying,
            expiry_date=expiry_date,
            strike_price=Decimal(option_match.group("strike")),
            option_type=option_match.group("option_type"),
        )

    future_match = re.fullmatch(
        r"(?P<underlying>[A-Z]+)(?P<expiry>\d{2}[A-Z]{3}|\d{1,2}/\d{1,2}(?:/\d{2,4})?)FUT",
        cleaned_symbol,
    )
    if future_match:
        underlying = _parse_underlying(future_match.group("underlying")) or future_match.group(
            "underlying"
        )
        expiry_token = future_match.group("expiry")
        expiry_date = _parse_monthly_expiry(expiry_token, underlying) or _parse_weekly_expiry(
            expiry_token
        )
        return ParsedInstrument(
            original_symbol=symbol,
            cleaned_symbol=cleaned_symbol,
            instrument_type="FUT",
            underlying_asset=underlying,
            expiry_date=expiry_date,
        )

    underlying = _parse_underlying(cleaned_symbol)
    if cleaned_symbol.endswith(("CE", "PE")) and underlying:
        return ParsedInstrument(
            original_symbol=symbol,
            cleaned_symbol=cleaned_symbol,
            instrument_type="OPT",
            underlying_asset=underlying,
            option_type=cleaned_symbol[-2:],
        )

    if normalized_type in {"OPT", "FUT"} and underlying:
        return ParsedInstrument(
            original_symbol=symbol,
            cleaned_symbol=cleaned_symbol,
            instrument_type=normalized_type,
            underlying_asset=underlying,
        )

    return ParsedInstrument(
        original_symbol=symbol,
        cleaned_symbol=cleaned_symbol,
        instrument_type="STK",
        underlying_asset=cleaned_symbol,
    )


def _quantize_money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _calculate_total_charges(
    *,
    instrument_type: str,
    entry_price: Decimal,
    exit_price: Decimal,
    matched_qty: int,
) -> Decimal:
    if instrument_type == "STK":
        return ZERO

    quantity = Decimal(matched_qty)
    sell_value = exit_price * quantity
    turnover = (entry_price * quantity) + sell_value
    exchange_rate = Decimal("0.0005") if instrument_type == "OPT" else Decimal("0.0005")

    if instrument_type == "OPT":
        stt = Decimal("0.000625") * sell_value
    elif instrument_type == "FUT":
        stt = Decimal("0.000125") * sell_value
    else:
        stt = ZERO

    exchange_fee = exchange_rate * sell_value
    sebi_fee = Decimal("0.000001") * turnover
    gst = Decimal("0.18") * (BROKERAGE_PER_LEG + BROKERAGE_PER_LEG + exchange_fee)

    total_charges = (
        BROKERAGE_PER_LEG
        + BROKERAGE_PER_LEG
        + stt
        + exchange_fee
        + sebi_fee
        + gst
    )
    return _quantize_money(total_charges)


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

    # Track open positions keyed by stock symbol or derivatives contract attributes.
    positions: dict[str, list[list]] = {}
    completed_trades: list[CompletedTrade] = []

    for trade in trades:
        parsed = parse_trade_instrument(trade.stock_symbol, trade.instrument_type)
        symbol = parsed.cleaned_symbol
        position_key = parsed.position_key
        qty = int(trade.quantity)
        price = Decimal(str(trade.price))
        trade_date = trade.trade_date

        if trade.trade_type == "BUY":
            if position_key not in positions:
                positions[position_key] = []
            positions[position_key].append([qty, price, trade_date, parsed])

        elif trade.trade_type == "SELL":
            if position_key not in positions or not positions[position_key]:
                continue

            remaining_sell_qty = qty

            while remaining_sell_qty > 0 and positions[position_key]:
                buy_entry = positions[position_key][0]
                buy_qty, buy_price, buy_date = buy_entry[0], buy_entry[1], buy_entry[2]

                matched_qty = min(buy_qty, remaining_sell_qty)

                pnl = _quantize_money((price - buy_price) * matched_qty)
                total_charges = _calculate_total_charges(
                    instrument_type=parsed.instrument_type,
                    entry_price=buy_price,
                    exit_price=price,
                    matched_qty=matched_qty,
                )
                net_pnl = _quantize_money(pnl - total_charges)
                return_pct = _quantize_money(((price - buy_price) / buy_price) * 100)
                holding_days = (trade_date - buy_date).days

                completed = CompletedTrade(
                    user_id=user_id,
                    stock_symbol=symbol,
                    entry_date=buy_date,
                    exit_date=trade_date,
                    entry_price=buy_price,
                    exit_price=price,
                    quantity=matched_qty,
                    pnl=pnl,
                    total_charges=total_charges,
                    net_pnl=net_pnl,
                    return_pct=return_pct,
                    holding_days=holding_days,
                )
                completed_trades.append(completed)

                buy_entry[0] -= matched_qty
                remaining_sell_qty -= matched_qty

                if buy_entry[0] <= 0:
                    positions[position_key].pop(0)

    return completed_trades
