import assert from "node:assert/strict";

import {
  buildStockDictionaryIndex,
  findDictionaryMatchesInText,
  shouldRefreshStockDictionaryCache,
  type StockDictionaryCacheEntry,
  type StockDictionaryResponse,
} from "../src/shared/stockDictionary.ts";

const dictionary: StockDictionaryResponse = {
  version: "2026-04-29",
  updated_at: "2026-04-29T00:00:00Z",
  stocks: {
    TCS: {
      isin: "INE467B01029",
      name: "Tata Consultancy Services Ltd",
      display_name: "Tata Consultancy Services Ltd",
      nse: "TCS",
      bse: "532540",
      exchanges: ["NSE", "BSE"],
      aliases: ["Tata Consultancy Services", "TCS"],
    },
    CANBK: {
      isin: "INE476A01022",
      name: "Canara Bank",
      display_name: "Canara Bank",
      nse: "CANBK",
      bse: "532483",
      exchanges: ["NSE", "BSE"],
      aliases: ["Canara Bank", "CANBK"],
    },
  },
};

function runTests(): void {
  const index = buildStockDictionaryIndex(dictionary);

  const fullNameMatches = findDictionaryMatchesInText(
    "Tata Consultancy Services rallied today.",
    index
  );
  assert.equal(fullNameMatches.length, 1);
  assert.equal(fullNameMatches[0]?.symbol, "TCS");
  assert.equal(fullNameMatches[0]?.confidence, "high");

  const prefixedMatches = findDictionaryMatchesInText(
    "Analysts are watching NSE:TCS closely.",
    index
  );
  assert.equal(prefixedMatches[0]?.symbol, "TCS");
  assert.equal(prefixedMatches[0]?.confidence, "high");

  const contextualSymbolMatches = findDictionaryMatchesInText(
    "TCS stock jumped after earnings.",
    index
  );
  assert.equal(contextualSymbolMatches[0]?.symbol, "TCS");

  const commonWordMatches = findDictionaryMatchesInText(
    "IT services are improving this quarter.",
    index
  );
  assert.equal(commonWordMatches.length, 0);

  const bseMatches = findDictionaryMatchesInText(
    "BSE:532540 is in focus today.",
    index
  );
  assert.equal(bseMatches[0]?.symbol, "TCS");
  assert.equal(bseMatches[0]?.confidence, "high");

  const cacheEntry: StockDictionaryCacheEntry = {
    data: dictionary,
    etag: 'W/"stocks-2-1"',
    fetchedAt: Date.UTC(2026, 3, 29, 8, 0, 0),
  };
  assert.equal(
    shouldRefreshStockDictionaryCache(cacheEntry, Date.UTC(2026, 3, 29, 20, 0, 0)),
    false
  );
  assert.equal(
    shouldRefreshStockDictionaryCache(cacheEntry, Date.UTC(2026, 3, 30, 9, 0, 0)),
    true
  );

  console.log("stockDictionary tests passed");
}

runTests();
