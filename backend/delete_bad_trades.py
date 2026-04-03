from app.database import SessionLocal
from app.models.trade import Trade

db = SessionLocal()

# Delete trades with 0.00 price
bad_trades = db.query(Trade).filter(Trade.price == 0).all()

print(f"Found {len(bad_trades)} bad trades with price = 0.00:")
for trade in bad_trades:
    print(f"  ID {trade.id}: {trade.trade_type} {trade.quantity} {trade.stock_symbol} @ ₹{trade.price}")

confirm = input("\nDelete these trades? (yes/no): ")

if confirm.lower() == 'yes':
    for trade in bad_trades:
        db.delete(trade)
    db.commit()
    print(f"\n✅ Deleted {len(bad_trades)} bad trades")
else:
    print("\n❌ Cancelled")

db.close()