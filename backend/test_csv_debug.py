from app.services.csv_parser import parse_groww_csv

# Read the actual CSV file you created
with open('test_csv.csv', 'rb') as f:
    content = f.read()

print("Testing CSV parser...")
print("="*60)
print("File size:", len(content), "bytes")
print("\nFile content (first 200 chars):")
print(content[:200].decode('utf-8'))
print("="*60)

try:
    result = parse_groww_csv(content)
    
    print(f"\nParsed {len(result)} trades:")
    if len(result) == 0:
        print("❌ NO TRADES FOUND - Parser is not working!")
        print("\nDEBUGGING INFO:")
        print("1. Check if file has correct headers")
        print("2. Check if date format is YYYY-MM-DD")
        print("3. Check for extra spaces or special characters")
    else:
        for i, trade in enumerate(result, 1):
            print(f"\n{i}. {trade['trade_type']} {trade['quantity']} {trade['stock_symbol']}")
            print(f"   Price: ₹{trade['price']}")
            print(f"   Date: {trade['trade_date']}")
except Exception as e:
    print(f"\n❌ ERROR: {e}")
    print(f"Error type: {type(e).__name__}")