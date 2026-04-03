from app.services.email_parser import parse_zerodha_contract_note

email = """You have bought 10 shares of TCS at ₹3,850 on 10-MAR-2026
You have sold 5 shares of INFY at ₹1,420.50 on 11-MAR-2026"""

print("Testing email parser...")
print("="*60)
print("Input email:")
print(email)
print("="*60)

result = parse_zerodha_contract_note(email)

print(f"\nParsed {len(result)} trades:")
if len(result) == 0:
    print("❌ NO TRADES FOUND - Parser is not working!")
else:
    for i, trade in enumerate(result, 1):
        print(f"\n{i}. {trade['trade_type']} {trade['quantity']} {trade['stock_symbol']}")
        print(f"   Price: ₹{trade['price']}")
        print(f"   Date: {trade['trade_date']}")