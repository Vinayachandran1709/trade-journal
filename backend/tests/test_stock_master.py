import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ["DATABASE_URL"] = "sqlite:///./test_stock_master.sqlite3"
os.environ["SECRET_KEY"] = "test-secret-key"

from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.stock import Stock  # noqa: E402
from app.services.stock_master_service import (  # noqa: E402
    NormalizedStockRecord,
    StockMasterSyncError,
    _extract_direct_bse_download_links,
    _fetch_bse_records_from_url,
    _looks_like_html,
    build_stock_dictionary,
    generate_aliases,
    merge_stock_records,
    resolve_stock_lookup,
    seed_top_200_stocks,
    sync_stock_master,
    upsert_stock_master,
)


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture()
def db_session():
  Base.metadata.create_all(bind=engine, tables=[Stock.__table__])
  db = TestingSessionLocal()
  try:
      yield db
  finally:
      db.close()
      Base.metadata.drop_all(bind=engine, tables=[Stock.__table__])


@pytest.fixture()
def client(db_session):
  def override_get_db():
      try:
          yield db_session
      finally:
          pass

  app.dependency_overrides[get_db] = override_get_db

  with TestClient(app) as test_client:
      yield test_client

  app.dependency_overrides.clear()


def test_merge_stock_records_dedupes_nse_and_bse_by_isin():
    merged = merge_stock_records(
        [
            NormalizedStockRecord(
                isin="INE467B01029",
                company_name="Tata Consultancy Services Ltd",
                display_name="Tata Consultancy Services Ltd",
                normalized_company_name="tata consultancy services",
                nse_symbol="TCS",
                exchanges={"NSE"},
                aliases={"TCS", "Tata Consultancy Services"},
            ),
            NormalizedStockRecord(
                isin="INE467B01029",
                company_name="Tata Consultancy Services Limited",
                display_name="TCS Ltd",
                normalized_company_name="tata consultancy services",
                bse_code="532540",
                exchanges={"BSE"},
                aliases={"532540", "Tata Consultancy Services"},
            ),
        ]
    )

    assert len(merged) == 1
    assert merged[0].nse_symbol == "TCS"
    assert merged[0].bse_code == "532540"
    assert merged[0].exchanges == {"NSE", "BSE"}


def test_generate_aliases_includes_cleaned_variants_and_symbol():
    aliases = generate_aliases(
        "Tata Consultancy Services Limited",
        "Tata Consultancy Services Limited",
        nse_symbol="TCS",
        bse_code="532540",
    )

    assert "TCS" in aliases
    assert "532540" in aliases
    assert any(alias.lower() == "tata consultancy services" for alias in aliases)


def test_bse_html_payload_is_rejected(monkeypatch):
    monkeypatch.setattr(
        "app.services.stock_master_service._download_bytes",
        lambda _url: b"<!DOCTYPE html><html><body>blocked</body></html>",
    )

    with pytest.raises(StockMasterSyncError, match="HTML"):
        _fetch_bse_records_from_url("https://www.bseindia.com/download/BhavCopy/Equity/EQ_ISINCODE_290426.zip")

    assert _looks_like_html(b"<html><body>blocked</body></html>")


def test_bse_udiff_rows_are_parsed():
    csv_bytes = (
        "TradDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,FinInstrmNm\n"
        "2026-04-29,CM,BSE,STK,532540,INE467B01029,TCS,TATA CONSULTANCY SERVICES LTD\n"
        "2026-04-29,CM,BSE,STK,500209,INE009A01021,INFY,INFOSYS LTD\n"
    ).encode("utf-8")

    from app.services import stock_master_service

    original_downloader = stock_master_service._download_bytes
    stock_master_service._download_bytes = lambda _url: csv_bytes
    try:
        records = _fetch_bse_records_from_url(
            "https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_20260429_F_0000.csv"
        )
    finally:
        stock_master_service._download_bytes = original_downloader

    assert len(records) == 2
    assert records[0].bse_code == "532540"
    assert records[0].isin == "INE467B01029"
    assert records[0].company_name == "TATA CONSULTANCY SERVICES LTD"


def test_bse_page_link_extraction_finds_equity_downloads():
    page_html = """
    <html>
      <body>
        <a href="/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_20260429_F_0000.csv">Equity (UDiFF)</a>
        <a href="/download/BhavCopy/Equity/EQ_ISINCODE_290426.zip">Equity with ISIN</a>
      </body>
    </html>
    """

    links = _extract_direct_bse_download_links(page_html)

    assert "https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_20260429_F_0000.csv" in links
    assert "https://www.bseindia.com/download/BhavCopy/Equity/EQ_ISINCODE_290426.zip" in links


def test_upsert_stock_master_is_idempotent(db_session):
    records = [
        NormalizedStockRecord(
            isin="INE009A01021",
            company_name="Infosys Ltd",
            display_name="Infosys Ltd",
            normalized_company_name="infosys",
            nse_symbol="INFY",
            bse_code="500209",
            exchanges={"NSE", "BSE"},
            aliases={"Infosys", "INFY", "500209"},
        )
    ]

    upsert_stock_master(db_session, records)
    upsert_stock_master(db_session, records)

    stocks = db_session.query(Stock).all()
    assert len(stocks) == 1
    assert stocks[0].nse_symbol == "INFY"


def test_resolve_stock_lookup_matches_symbol_code_and_name(db_session):
    upsert_stock_master(
        db_session,
        [
            NormalizedStockRecord(
                isin="INE467B01029",
                company_name="Tata Consultancy Services Ltd",
                display_name="Tata Consultancy Services Ltd",
                normalized_company_name="tata consultancy services",
                nse_symbol="TCS",
                bse_code="532540",
                exchanges={"NSE", "BSE"},
                aliases={"Tata Consultancy Services", "TCS", "532540"},
            )
        ],
    )

    assert resolve_stock_lookup("TCS", db_session).nse_symbol == "TCS"
    assert resolve_stock_lookup("532540", db_session).bse_code == "532540"
    assert resolve_stock_lookup("Tata Consultancy Services", db_session).nse_symbol == "TCS"


def test_dictionary_endpoint_shape(client, db_session):
    upsert_stock_master(
        db_session,
        [
            NormalizedStockRecord(
                isin="INE467B01029",
                company_name="Tata Consultancy Services Ltd",
                display_name="Tata Consultancy Services Ltd",
                normalized_company_name="tata consultancy services",
                nse_symbol="TCS",
                bse_code="532540",
                exchanges={"NSE", "BSE"},
                aliases={"Tata Consultancy Services", "TCS", "532540"},
            )
        ],
    )

    response = client.get("/api/stocks/dictionary")

    assert response.status_code == 200
    payload = response.json()
    assert "version" in payload
    assert "updated_at" in payload
    assert "TCS" in payload["stocks"]
    assert payload["stocks"]["TCS"]["bse"] == "532540"


def test_new_listing_appears_after_second_upsert(db_session):
    first_batch = [
        NormalizedStockRecord(
            isin="INE467B01029",
            company_name="Tata Consultancy Services Ltd",
            display_name="Tata Consultancy Services Ltd",
            normalized_company_name="tata consultancy services",
            nse_symbol="TCS",
            exchanges={"NSE"},
            aliases={"Tata Consultancy Services", "TCS"},
        )
    ]
    second_batch = [
        *first_batch,
        NormalizedStockRecord(
            isin="INE0NEW01010",
            company_name="New Listing Industries Ltd",
            display_name="New Listing Industries Ltd",
            normalized_company_name="new listing industries",
            nse_symbol="NEWLIST",
            exchanges={"NSE"},
            aliases={"New Listing Industries", "NEWLIST"},
        ),
    ]

    upsert_stock_master(db_session, first_batch)
    first_dictionary, _ = build_stock_dictionary(db_session)
    upsert_stock_master(db_session, second_batch)
    second_dictionary, _ = build_stock_dictionary(db_session)

    assert "NEWLIST" not in first_dictionary["stocks"]
    assert "NEWLIST" in second_dictionary["stocks"]


def test_sync_failure_keeps_existing_dictionary(db_session, monkeypatch):
    upsert_stock_master(
        db_session,
        [
            NormalizedStockRecord(
                isin="INE009A01021",
                company_name="Infosys Ltd",
                display_name="Infosys Ltd",
                normalized_company_name="infosys",
                nse_symbol="INFY",
                exchanges={"NSE"},
                aliases={"Infosys", "INFY"},
            )
        ],
    )

    monkeypatch.setattr(
        "app.services.stock_master_service.fetch_nse_stock_master",
        lambda: (_ for _ in ()).throw(StockMasterSyncError("nse failed")),
    )
    monkeypatch.setattr(
        "app.services.stock_master_service.fetch_bse_stock_master",
        lambda: (_ for _ in ()).throw(StockMasterSyncError("bse failed")),
    )

    result = sync_stock_master(db_session)

    assert db_session.query(Stock).count() > 1
    assert db_session.query(Stock).filter(Stock.nse_symbol == "INFY").count() == 1
    assert result["fallback_seeded"] > 0


def test_sync_uses_fallback_seed_when_both_sources_fail(db_session, monkeypatch):
    monkeypatch.setattr(
        "app.services.stock_master_service.fetch_nse_stock_master",
        lambda: (_ for _ in ()).throw(StockMasterSyncError("nse failed")),
    )
    monkeypatch.setattr(
        "app.services.stock_master_service.fetch_bse_stock_master",
        lambda: (_ for _ in ()).throw(StockMasterSyncError("bse failed")),
    )

    result = sync_stock_master(db_session)

    assert result["nse_records_seen"] == 0
    assert result["bse_records_seen"] == 0
    assert result["fallback_seeded"] > 0
    assert db_session.query(Stock).count() >= result["fallback_seeded"]


def test_seed_top_200_stocks_is_idempotent(db_session):
    first_seed = seed_top_200_stocks(db_session)
    second_seed = seed_top_200_stocks(db_session)

    assert first_seed > 0
    assert second_seed == 0
