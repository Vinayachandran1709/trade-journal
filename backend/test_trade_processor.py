from app.database import SessionLocal
from app.models.trade import Trade
from app.services.trade_processor import calculate_completed_trades

db = SessionLocal()

# Debug: Show all trades for user_id=1
all_trades = db.query(Trade).filter(Trade.user_id == 1).order_by(Trade.trade_date.asc()).all()
print(f"\n--- DEBUG: All trades for user_id=1 ---")
print(f"Total trades in DB: {len(all_trades)}")
for t in all_trades:
    print(f"  {t.stock_symbol} | {t.trade_type} | qty={t.quantity} | price={t.price} | date={t.trade_date}")
print("--- END DEBUG ---\n")

# Assuming user_id = 1
completed = calculate_completed_trades(db, user_id=1)

print(f"Found {len(completed)} completed trades:")
for trade in completed:
    print(f"  {trade.stock_symbol}: {trade.quantity} shares")
    print(f"    Entry: ₹{trade.entry_price} on {trade.entry_date}")
    print(f"    Exit: ₹{trade.exit_price} on {trade.exit_date}")
    print(f"    P&L: ₹{trade.pnl} ({trade.return_pct}%)")
    print(f"    Holding: {trade.holding_days} days\n")

db.close()