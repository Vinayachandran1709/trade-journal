import re
from datetime import datetime, date
from decimal import Decimal


def parse_zerodha_contract_note(email_body: str) -> list[dict]:
    """Parse Zerodha contract note emails to extract trade details.

    Supports formats like:
        "You have bought 10 shares of TCS at ₹3,850 on 10-MAR-2026"
        "You have sold 5 shares of INFY at ₹1,420.50 on 11-MAR-2026"
        "You have bought 25 shares of M&M at ₹1,234.56 on 15-MAR-2026"

    Multiple trades in one email (separated by newlines) are supported.

    Args:
        email_body: Raw email text content.

    Returns:
        List of dicts with keys: stock_symbol, trade_type, quantity, price, trade_date.
        Returns empty list if no trades are found or parsing fails.
    """
    buy_pattern = r"bought (\d+) shares of ([A-Z&]+) at \S*([\d,]+\.?\d*) on ([\dA-Z-]+)"
    sell_pattern = r"sold (\d+) shares of ([A-Z&]+) at \S*([\d,]+\.?\d*) on ([\dA-Z-]+)"

    trades: list[dict] = []

    try:
        for pattern, trade_type in [(buy_pattern, "BUY"), (sell_pattern, "SELL")]:
            matches = re.findall(pattern, email_body)
            for match in matches:
                quantity_str, stock_symbol, price_str, date_str = match
                price = float(price_str.replace(",", ""))
                trade_date = datetime.strptime(date_str, "%d-%b-%Y").date()

                trades.append({
                    "stock_symbol": stock_symbol,
                    "trade_type": trade_type,
                    "quantity": int(quantity_str),
                    "price": price,
                    "trade_date": trade_date,
                })
    except (ValueError, AttributeError):
        return []

    return trades
