from pydantic import BaseModel


class StockDictionaryEntryResponse(BaseModel):
    isin: str | None = None
    name: str
    display_name: str
    nse: str | None = None
    bse: str | None = None
    exchanges: list[str]
    aliases: list[str]


class StockDictionaryResponse(BaseModel):
    version: str
    updated_at: str
    stocks: dict[str, StockDictionaryEntryResponse]


class StockDebugSampleResponse(BaseModel):
    isin: str | None = None
    company_name: str
    display_name: str
    nse_symbol: str | None = None
    bse_code: str | None = None
    exchanges: list[str]
    alias_count: int


class StockDebugResponse(BaseModel):
    nse_records_seen: int
    bse_records_seen: int
    total_unique_isins: int
    total_stocks: int
    total_aliases: int
    last_sync_time: str | None = None
    dictionary_version: str | None = None
    samples: dict[str, StockDebugSampleResponse]
    source_failures: list[str]
