import type { CapturedTradeDraft } from "./types";

type RowRecord = Record<string, string>;

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function isVisible(element: Element): boolean {
  const htmlElement = element as HTMLElement;
  const rect = htmlElement.getBoundingClientRect();
  const style = window.getComputedStyle(htmlElement);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== "hidden" &&
    style.display !== "none"
  );
}

function getVisibleTables(documentRef: Document): HTMLTableElement[] {
  return Array.from(documentRef.querySelectorAll("table")).filter(isVisible);
}

function extractHeaders(table: HTMLTableElement): string[] {
  const headerCells = Array.from(
    table.querySelectorAll("thead th, thead td, tr:first-child th")
  );
  if (headerCells.length > 0) {
    return headerCells.map((cell) => normalizeText(cell.textContent));
  }

  const firstRow = table.querySelector("tr");
  if (!firstRow) {
    return [];
  }

  return Array.from(firstRow.querySelectorAll("th, td")).map((cell) =>
    normalizeText(cell.textContent)
  );
}

function extractRows(table: HTMLTableElement): RowRecord[] {
  const headers = extractHeaders(table);
  if (!headers.length) {
    return [];
  }

  const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
  const rows = bodyRows.length > 0 ? bodyRows : Array.from(table.querySelectorAll("tr")).slice(1);

  return rows
    .map((row) => {
      const cells = Array.from(row.querySelectorAll("td, th")).map((cell) =>
        normalizeText(cell.textContent)
      );
      if (!cells.length || cells.every((cell) => !cell)) {
        return null;
      }

      const record: RowRecord = {};
      headers.forEach((header, index) => {
        record[header] = cells[index] ?? "";
      });
      return record;
    })
    .filter((row): row is RowRecord => row !== null);
}

function getValue(row: RowRecord, aliases: string[]): string {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    const match = entries.find(([header]) => normalizeHeader(header) === normalizedAlias);
    if (match && match[1]) {
      return match[1];
    }
  }
  return "";
}

function parseTradeType(value: string): "BUY" | "SELL" | null {
  const normalized = normalizeText(value).toUpperCase();
  if (["BUY", "B", "BOUGHT"].includes(normalized)) {
    return "BUY";
  }
  if (["SELL", "S", "SOLD"].includes(normalized)) {
    return "SELL";
  }
  return null;
}

function parseNumber(value: string): number | null {
  const normalized = value.replace(/[^0-9.\-]/g, "");
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: string): string | null {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  const direct = new Date(normalized);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString().slice(0, 10);
  }

  const match = normalized.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!match) {
    return null;
  }

  const [, first, second, year] = match;
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${second.padStart(2, "0")}-${first.padStart(2, "0")}`;
}

function parseTime(value: string): string | null {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!match) {
    return null;
  }

  let hours = Number(match[1]);
  const minutes = match[2];
  const seconds = match[3] ?? "00";
  const meridiem = match[4]?.toUpperCase();

  if (meridiem === "PM" && hours < 12) {
    hours += 12;
  } else if (meridiem === "AM" && hours === 12) {
    hours = 0;
  }

  return `${String(hours).padStart(2, "0")}:${minutes}:${seconds}`;
}

function inferInstrumentType(row: RowRecord, explicitValue: string): string | null {
  const normalized = normalizeText(explicitValue);
  if (normalized) {
    return normalized.toUpperCase();
  }

  const symbol = getValue(row, ["symbol", "stock symbol", "trading symbol", "instrument"]);
  if (/\b(CE|PE|FUT)\b/i.test(symbol)) {
    return "DERIVATIVE";
  }

  return "EQUITY";
}

export function captureTradesFromVisibleTables(
  documentRef: Document,
  aliases: {
    symbol: string[];
    tradeType: string[];
    quantity: string[];
    price: string[];
    date: string[];
    time: string[];
    instrumentType: string[];
  }
): CapturedTradeDraft[] {
  const seen = new Set<string>();

  return getVisibleTables(documentRef)
    .flatMap(extractRows)
    .map((row) => {
      const stockSymbol = getValue(row, aliases.symbol).toUpperCase();
      const tradeType = parseTradeType(getValue(row, aliases.tradeType));
      const quantity = parseNumber(getValue(row, aliases.quantity));
      const price = parseNumber(getValue(row, aliases.price));
      const tradeDate = parseDate(getValue(row, aliases.date));
      const tradeTime = parseTime(getValue(row, aliases.time));
      const instrumentType = inferInstrumentType(
        row,
        getValue(row, aliases.instrumentType)
      );

      if (!stockSymbol || !tradeType || !quantity || !price || !tradeDate) {
        return null;
      }

      const draft: CapturedTradeDraft = {
        stock_symbol: stockSymbol,
        trade_type: tradeType,
        quantity,
        price,
        trade_date: tradeDate,
        trade_time: tradeTime,
        instrument_type: instrumentType,
        entry_method: "dom",
      };

      const signature = JSON.stringify(draft);
      if (seen.has(signature)) {
        return null;
      }

      seen.add(signature);
      return draft;
    })
    .filter((trade): trade is CapturedTradeDraft => trade !== null);
}
