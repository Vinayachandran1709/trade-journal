export interface StockDictionaryEntry {
  isin: string | null;
  name: string;
  display_name: string;
  nse: string | null;
  bse: string | null;
  exchanges: string[];
  aliases: string[];
}

export interface StockDictionaryResponse {
  version: string;
  updated_at: string;
  stocks: Record<string, StockDictionaryEntry>;
}

export interface StockDictionaryCacheEntry {
  data: StockDictionaryResponse;
  etag: string | null;
  fetchedAt: number;
}

export interface StockDictionaryResolvedEntry extends StockDictionaryEntry {
  canonical: string;
}

interface PhraseAliasEntry {
  aliasNormalized: string;
  tokenCount: number;
  entry: StockDictionaryResolvedEntry;
}

export interface StockDictionaryIndex {
  stocksByCanonical: Map<string, StockDictionaryResolvedEntry>;
  symbolMap: Map<string, StockDictionaryResolvedEntry>;
  bseMap: Map<string, StockDictionaryResolvedEntry>;
  phraseAliasesByFirstToken: Map<string, PhraseAliasEntry[]>;
}

export interface DictionaryMatch {
  start: number;
  end: number;
  symbol: string;
  displayText: string;
  confidence: "high" | "medium";
}

const AMBIGUOUS_SYMBOLS = new Set([
  "IT",
  "CAN",
  "ON",
  "IN",
  "ARE",
  "OR",
  "AM",
  "PM",
  "IS",
  "AS",
  "AT",
  "BE",
  "DO",
  "GO",
  "IF",
  "NO",
  "OF",
  "SO",
  "TO",
  "UP",
  "US",
  "WE",
]);

const STOCK_CONTEXT_WORDS = new Set([
  "stock",
  "stocks",
  "share",
  "shares",
  "company",
  "listed",
  "equity",
  "nse",
  "bse",
]);

const MATCH_TOKEN_REGEX = /[A-Za-z0-9&.-]+/g;
const EXPLICIT_NSE_REGEX = /\bNSE\s*[:\-]\s*([A-Z][A-Z0-9&-]{1,20})\b/g;
const EXPLICIT_BSE_REGEX = /\bBSE\s*[:\-]\s*(\d{5,6})\b/g;

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeMatchToken(token: string): string {
  return token.toLowerCase().replace(/^[^a-z0-9&]+|[^a-z0-9&.]+$/g, "");
}

function tokenize(text: string): Array<{ raw: string; normalized: string; start: number; end: number }> {
  const tokens: Array<{ raw: string; normalized: string; start: number; end: number }> = [];
  MATCH_TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = MATCH_TOKEN_REGEX.exec(text)) !== null) {
    const raw = match[0];
    const normalized = normalizeMatchToken(raw);
    if (!normalized) {
      continue;
    }

    tokens.push({
      raw,
      normalized,
      start: match.index,
      end: match.index + raw.length,
    });
  }

  return tokens;
}

function normalizeAliasForMatch(alias: string): string {
  return tokenize(normalizeWhitespace(alias))
    .map((token) => token.normalized)
    .filter(Boolean)
    .join(" ");
}

function isAliasUseful(aliasNormalized: string): boolean {
  if (!aliasNormalized || aliasNormalized.length < 2) {
    return false;
  }

  if (aliasNormalized.includes(" ")) {
    return true;
  }

  return aliasNormalized.length >= 4 && !AMBIGUOUS_SYMBOLS.has(aliasNormalized.toUpperCase());
}

function getHoverSymbol(entry: StockDictionaryResolvedEntry): string {
  if (entry.nse) {
    return entry.nse;
  }

  if (entry.bse) {
    return `BSE:${entry.bse}`;
  }

  return entry.canonical;
}

function hasNearbyStockContext(
  tokens: Array<{ raw: string; normalized: string; start: number; end: number }>,
  index: number
): boolean {
  for (let offset = -2; offset <= 2; offset += 1) {
    if (offset === 0) {
      continue;
    }

    const nearby = tokens[index + offset];
    if (!nearby) {
      continue;
    }

    if (STOCK_CONTEXT_WORDS.has(nearby.normalized)) {
      return true;
    }
  }

  return false;
}

function overlaps(used: Set<number>, start: number, end: number): boolean {
  for (let index = start; index < end; index += 1) {
    if (used.has(index)) {
      return true;
    }
  }

  return false;
}

function markUsed(used: Set<number>, start: number, end: number): void {
  for (let index = start; index < end; index += 1) {
    used.add(index);
  }
}

function addPhraseAliases(
  phraseAliasesByFirstToken: Map<string, PhraseAliasEntry[]>,
  entry: StockDictionaryResolvedEntry
): void {
  const allAliases = new Set([entry.name, entry.display_name, ...(entry.aliases || [])]);

  for (const alias of allAliases) {
    const aliasNormalized = normalizeAliasForMatch(alias);
    if (!isAliasUseful(aliasNormalized)) {
      continue;
    }

    const tokens = aliasNormalized.split(" ");
    if (tokens.length === 1) {
      const single = tokens[0];
      if (entry.nse && single.toUpperCase() === entry.nse.toUpperCase()) {
        continue;
      }
      if (entry.bse && single === entry.bse) {
        continue;
      }
    }

    const firstToken = tokens[0];
    const list = phraseAliasesByFirstToken.get(firstToken) ?? [];
    list.push({
      aliasNormalized,
      tokenCount: tokens.length,
      entry,
    });
    phraseAliasesByFirstToken.set(firstToken, list);
  }
}

export function buildStockDictionaryIndex(
  dictionary: StockDictionaryResponse
): StockDictionaryIndex {
  const stocksByCanonical = new Map<string, StockDictionaryResolvedEntry>();
  const symbolMap = new Map<string, StockDictionaryResolvedEntry>();
  const bseMap = new Map<string, StockDictionaryResolvedEntry>();
  const phraseAliasesByFirstToken = new Map<string, PhraseAliasEntry[]>();

  for (const [canonical, value] of Object.entries(dictionary.stocks || {})) {
    const entry: StockDictionaryResolvedEntry = {
      ...value,
      canonical,
    };
    stocksByCanonical.set(canonical, entry);

    if (entry.nse) {
      symbolMap.set(entry.nse.toUpperCase(), entry);
    }
    if (entry.bse) {
      bseMap.set(entry.bse, entry);
    }

    addPhraseAliases(phraseAliasesByFirstToken, entry);
  }

  for (const list of phraseAliasesByFirstToken.values()) {
    list.sort((left, right) => {
      if (right.tokenCount !== left.tokenCount) {
        return right.tokenCount - left.tokenCount;
      }

      return right.aliasNormalized.length - left.aliasNormalized.length;
    });
  }

  return {
    stocksByCanonical,
    symbolMap,
    bseMap,
    phraseAliasesByFirstToken,
  };
}

export function shouldRefreshStockDictionaryCache(
  entry: StockDictionaryCacheEntry | null,
  nowMs = Date.now()
): boolean {
  if (!entry?.data) {
    return true;
  }

  return nowMs - entry.fetchedAt >= 24 * 60 * 60 * 1000;
}

export function findDictionaryMatchesInText(
  text: string,
  index: StockDictionaryIndex,
  maxMatches = 30
): DictionaryMatch[] {
  const matches: DictionaryMatch[] = [];
  const used = new Set<number>();

  const addMatch = (
    start: number,
    end: number,
    entry: StockDictionaryResolvedEntry,
    confidence: "high" | "medium"
  ) => {
    if (matches.length >= maxMatches || overlaps(used, start, end)) {
      return;
    }

    matches.push({
      start,
      end,
      symbol: getHoverSymbol(entry),
      displayText: text.slice(start, end),
      confidence,
    });
    markUsed(used, start, end);
  };

  EXPLICIT_NSE_REGEX.lastIndex = 0;
  let explicitNseMatch: RegExpExecArray | null;
  while ((explicitNseMatch = EXPLICIT_NSE_REGEX.exec(text)) !== null && matches.length < maxMatches) {
    const symbol = explicitNseMatch[1].toUpperCase();
    const entry = index.symbolMap.get(symbol);
    if (!entry) {
      continue;
    }

    const start = explicitNseMatch.index + explicitNseMatch[0].lastIndexOf(explicitNseMatch[1]);
    addMatch(start, start + explicitNseMatch[1].length, entry, "high");
  }

  EXPLICIT_BSE_REGEX.lastIndex = 0;
  let explicitBseMatch: RegExpExecArray | null;
  while ((explicitBseMatch = EXPLICIT_BSE_REGEX.exec(text)) !== null && matches.length < maxMatches) {
    const code = explicitBseMatch[1];
    const entry = index.bseMap.get(code);
    if (!entry) {
      continue;
    }

    const start = explicitBseMatch.index + explicitBseMatch[0].lastIndexOf(code);
    addMatch(start, start + code.length, entry, "high");
  }

  const tokens = tokenize(text);

  for (let tokenIndex = 0; tokenIndex < tokens.length && matches.length < maxMatches; tokenIndex += 1) {
    const token = tokens[tokenIndex];

    const phraseCandidates = index.phraseAliasesByFirstToken.get(token.normalized) ?? [];
    for (const candidate of phraseCandidates) {
      if (tokenIndex + candidate.tokenCount > tokens.length) {
        continue;
      }

      const normalizedSlice = tokens
        .slice(tokenIndex, tokenIndex + candidate.tokenCount)
        .map((sliceToken) => sliceToken.normalized)
        .join(" ");

      if (normalizedSlice !== candidate.aliasNormalized) {
        continue;
      }

      const start = tokens[tokenIndex].start;
      const end = tokens[tokenIndex + candidate.tokenCount - 1].end;
      const confidence =
        candidate.tokenCount > 1 || hasNearbyStockContext(tokens, tokenIndex)
          ? "high"
          : "medium";
      addMatch(start, end, candidate.entry, confidence);
      break;
    }

    const symbol = token.raw.toUpperCase();
    const symbolEntry = index.symbolMap.get(symbol);
    if (
      symbolEntry &&
      !AMBIGUOUS_SYMBOLS.has(symbol) &&
      (symbol.length >= 3 || hasNearbyStockContext(tokens, tokenIndex))
    ) {
      const confidence = hasNearbyStockContext(tokens, tokenIndex) ? "high" : "medium";
      addMatch(token.start, token.end, symbolEntry, confidence);
    }

    const bseEntry = index.bseMap.get(token.raw);
    if (bseEntry && hasNearbyStockContext(tokens, tokenIndex)) {
      addMatch(token.start, token.end, bseEntry, "medium");
    }
  }

  return matches.sort((left, right) => left.start - right.start);
}
