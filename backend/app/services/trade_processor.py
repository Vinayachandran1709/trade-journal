import re
from datetime import date
from decimal import Decimal, InvalidOperation

from sqlalchemy.orm import Session

from app.models.completed_trade import CompletedTrade
from app.models.trade import Trade


def clean_stock_symbol(symbol: str) -> str:
    """Remove exchange suffixes and normalize stock symbol."""
    symbol = symbol.strip().upper()
    symbol = re.sub(r"\.(NS|BO|NSE|BSE)$", "", symbol)
    return symbol


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

    # Track open positions: {symbol: [(remaining_qty, price, date), ...]}
    positions: dict[str, list[list]] = {}
    completed_trades: list[CompletedTrade] = []

    for trade in trades:
        symbol = clean_stock_symbol(trade.stock_symbol)
        qty = int(trade.quantity)
        price = Decimal(str(trade.price))
        trade_date = trade.trade_date

        if trade.trade_type == "BUY":
            if symbol not in positions:
                positions[symbol] = []
            positions[symbol].append([qty, price, trade_date])

        elif trade.trade_type == "SELL":
            if symbol not in positions or not positions[symbol]:
                continue

            remaining_sell_qty = qty

            while remaining_sell_qty > 0 and positions[symbol]:
                buy_entry = positions[symbol][0]
                buy_qty, buy_price, buy_date = buy_entry[0], buy_entry[1], buy_entry[2]

                matched_qty = min(buy_qty, remaining_sell_qty)

                pnl = (price - buy_price) * matched_qty
                return_pct = ((price - buy_price) / buy_price) * 100
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
                    return_pct=return_pct,
                    holding_days=holding_days,
                )
                completed_trades.append(completed)

                buy_entry[0] -= matched_qty
                remaining_sell_qty -= matched_qty

                if buy_entry[0] <= 0:
                    positions[symbol].pop(0)

    return completed_trades
