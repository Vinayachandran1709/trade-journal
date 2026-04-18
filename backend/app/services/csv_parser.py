from app.services.universal_csv_parser import parse_universal_csv


def parse_groww_csv(file_content: bytes) -> list[dict]:
    """Parse Groww CSV exports while staying compatible with the legacy endpoint."""
    result = parse_universal_csv(file_content, forced_broker="groww")
    return result.trades
