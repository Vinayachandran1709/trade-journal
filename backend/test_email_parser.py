from app.services.email_parser import parse_zerodha_contract_note

email = """
You have bought 10 shares of TCS at ₹3,850 on 10-MAR-2026
You have sold 5 shares of INFY at ₹1,420.50 on 11-MAR-2026
You have bought 25 shares of RELIANCE at ₹2,450 on 12-MAR-2026
"""

result = parse_zerodha_contract_note(email)

print(f"Parsed {len(result)} trades:")
for trade in result:
    print(f"  {trade['trade_type']} {trade['quantity']} {trade['stock_symbol']} @ ₹{trade['price']} on {trade['trade_date']}")
