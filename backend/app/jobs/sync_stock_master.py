import json
import logging

from app.database import SessionLocal
from app.services.stock_master_service import StockMasterSyncError, sync_stock_master

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main() -> int:
    db = SessionLocal()
    try:
        summary = sync_stock_master(db)
        logger.info("Stock master sync complete")
        logger.info(json.dumps(summary, indent=2))
        return 0
    except StockMasterSyncError as exc:
        logger.error("Stock master sync failed: %s", exc)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
