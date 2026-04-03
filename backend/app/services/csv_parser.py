import io
import csv
from datetime import datetime


def parse_groww_csv(file_content: bytes) -> list[dict]:
    """Parse Groww CSV export files to extract trade details.

    Expected CSV format with headers:
        Trade Date,Stock Symbol,Transaction Type,Quantity,Price

    Example rows:
        2026-03-10,TCS,BUY,10,3850.00
        2026-03-11,INFY,SELL,5,1420.50

    Args:
        file_content: Raw bytes of the CSV file.

    Returns:
        List of dicts with keys: stock_symbol, trade_type, quantity, price, trade_date.
        Returns empty list if file is empty.

    Raises:
        ValueError: If required columns are missing from the CSV.
    """
    if not file_content or not file_content.strip():
        return []

    text = file_content.decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))

    required_columns = {"Trade Date", "Stock Symbol", "Transaction Type", "Quantity", "Price"}
    if reader.fieldnames is None or not required_columns.issubset(set(reader.fieldnames)):
        raise ValueError(
            f"Missing required columns. Expected: {required_columns}, "
            f"Found: {set(reader.fieldnames) if reader.fieldnames else 'none'}"
        )

    trades: list[dict] = []

    for row in reader:
        try:
            trade_date = datetime.strptime(row["Trade Date"].strip(), "%Y-%m-%d").date()
            quantity = int(row["Quantity"].strip())
            price = float(row["Price"].strip())
            trade_type = row["Transaction Type"].strip().upper()
            stock_symbol = row["Stock Symbol"].strip()

            trades.append({
                "stock_symbol": stock_symbol,
                "trade_type": trade_type,
                "quantity": quantity,
                "price": price,
                "trade_date": trade_date,
            })
        except (ValueError, KeyError):
            continue

    return trades
