from app.services.csv_parser import parse_groww_csv

with open('test_csv.csv', 'rb') as f:
    content = f.read()

result = parse_groww_csv(content)

print(f"Parsed {len(result)} trades:")
for trade in result:
    print(f"  {trade['trade_type']} {trade['quantity']} {trade['stock_symbol']} @ ₹{trade['price']} on {trade['trade_date']}")
