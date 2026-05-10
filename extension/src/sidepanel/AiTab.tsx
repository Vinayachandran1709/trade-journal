import { useEffect, useMemo, useState } from "react";

import {
  APIError,
  askResearch,
  fetchCompletedTrades,
  fetchTickerIntel,
  fetchWhyMoving,
  type CompletedTradeListItem,
  type MarketDashboardData,
  type ResearchAskResponse,
  type TickerIntelResponse,
  type WhyMovingResponse,
} from "../shared/api";
import { getAuthToken } from "../shared/auth";
import { storageGet, storageSet } from "../shared/chrome";
import { getIstDateKey } from "./behavioral";
import SkeletonLine from "./SkeletonLine";

const RECENT_AI_QUERIES_KEY = "recentAiQueries";
const CACHED_AI_COMPLETED_TRADES_KEY = "cachedAiCompletedTrades";
const MAX_RECENT_QUERIES = 5;
const MAX_VISIBLE_SOURCES = 3;

interface AiQueryItem {
  symbol: string;
  date: string;
}

type AiResult =
  | { kind: "stock"; data: WhyMovingResponse }
  | { kind: "research"; data: ResearchAskResponse };

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatSignedPercent(value: unknown): string {
  const numericValue = toFiniteNumber(value);
  if (numericValue == null) {
    return "--";
  }

  return `${numericValue >= 0 ? "+" : ""}${numericValue.toFixed(2)}%`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "--";
  }
  return `${(value * 100).toFixed(0)}%`;
}

function formatIndianNumber(num: number | null): string {
  if (num == null) return "--";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(num);
}

function formatPnl(value: number): string {
  return `${value < 0 ? "-₹" : "₹"}${formatIndianNumber(Math.abs(value))}`;
}

function formatPrice(value: unknown): string {
  return formatIndianNumber(toFiniteNumber(value));
}

function formatNullablePercent(value: unknown): string {
  return formatSignedPercent(value);
}

function getExplanationBody(result: WhyMovingResponse): string {
  if (!result.disclaimer) {
    return result.explanation.trim();
  }

  return result.explanation.replace(result.disclaimer, "").trim();
}

function classifyMoveType(
  result: WhyMovingResponse,
  intel: TickerIntelResponse | null
): { type: string; className: string } {
  const changePct = Math.abs(result.change_pct ?? 0);
  const explanation = (result.explanation ?? "").toLowerCase();
  const volRatio = parseVolumeAboveAvg(intel?.volume_vs_avg);
  const volAboveAvg = volRatio > 0;

  if (/earnings|results|q[1-4]|quarter|revenue|profit|loss narrow|pat/i.test(explanation)) {
    return { type: "📊 Earnings Reaction", className: "move-type-earnings" };
  }
  if (/demerger|merger|buyback|split|bonus|rights|acquisition/i.test(explanation)) {
    return { type: "🏢 Corporate Action", className: "move-type-corporate" };
  }
  if (/sector|industry|peer|sympathy|broad|across/i.test(explanation)) {
    return { type: "🔗 Sector Sympathy", className: "move-type-sector" };
  }
  if (changePct > 3 && volRatio > 40) {
    return { type: "🔥 Volume Breakout", className: "move-type-breakout" };
  }
  if ((result.change_pct ?? 0) < -3 && volAboveAvg) {
    return { type: "📉 Heavy Selling", className: "move-type-selling" };
  }
  if (/short cover|profit book|booking/i.test(explanation)) {
    return { type: "🔄 Technical Move", className: "move-type-technical" };
  }
  if (/rbi|fed|policy|rate|macro|global|crude|dollar|inflation/i.test(explanation)) {
    return { type: "🌍 Macro Driven", className: "move-type-macro" };
  }
  if (changePct > 2) {
    return { type: "📈 Momentum Move", className: "move-type-momentum" };
  }
  return { type: "📋 Market Activity", className: "move-type-general" };
}

function parseVolumeAboveAvg(volText: string | undefined): number {
  if (!volText) return 0;

  const pctMatch = volText.match(/(\d+(?:\.\d+)?)\s*%\s*above/i);
  if (pctMatch) return parseFloat(pctMatch[1]);

  const multMatch = volText.match(/(\d+(?:\.\d+)?)\s*x/i);
  if (multMatch) {
    const mult = parseFloat(multMatch[1]);
    return (mult - 1) * 100;
  }

  const belowMatch = volText.match(/(\d+(?:\.\d+)?)\s*%\s*below/i);
  if (belowMatch) return -parseFloat(belowMatch[1]);

  return 0;
}

function getMoveConviction(
  result: WhyMovingResponse,
  intel: TickerIntelResponse | null
): { level: string; score: number; reasons: string[] } {
  let score = 50;
  const reasons: string[] = [];

  const volText = intel?.volume_vs_avg ?? "";
  const volPct = parseInt(volText.match(/(\d+)/)?.[1] ?? "0", 10);
  if (volText.toLowerCase().includes("above") && volPct > 50) {
    score += 20;
    reasons.push(`Volume ${volPct}% above average`);
  } else if (volText.toLowerCase().includes("below")) {
    score -= 15;
    reasons.push("Below-average volume — weak participation");
  }

  const sourceCount = result.sources?.length ?? 0;
  if (sourceCount >= 3) {
    score += 15;
    reasons.push(`${sourceCount} news sources confirm`);
  } else if (sourceCount <= 1) {
    score -= 10;
    reasons.push("Limited news coverage");
  }

  const absChange = Math.abs(result.change_pct ?? 0);
  if (absChange > 5) {
    score += 15;
    reasons.push("Significant price movement");
  } else if (absChange < 1) {
    score -= 10;
    reasons.push("Minor price change");
  }

  score = Math.max(10, Math.min(95, score));
  const level = score >= 70 ? "High" : score >= 45 ? "Moderate" : "Low";
  return { level, score, reasons };
}

function getCleanExplanation(result: WhyMovingResponse): string {
  return getExplanationBody(result)
    .replace(/trading volume is \d+% (above|below) average/gi, "")
    .replace(/volume is \d+% (above|below) average/gi, "")
    .replace(/volume is \d+% (above|below)/gi, "")
    .replace(/\s+\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function splitExplanationText(text: string): { headline: string; detail: string | null } {
  const normalized = text.trim();
  if (!normalized) {
    return { headline: "No explanation available right now.", detail: null };
  }

  const match = normalized.match(/^.*?[.!?](?:\s|$)/);
  if (!match) {
    return { headline: normalized, detail: null };
  }

  const headline = match[0].trim();
  const detail = normalized.slice(match[0].length).trim();
  return { headline, detail: detail || null };
}

function normalizePublisherName(publisher: string | undefined): string {
  const cleaned = (publisher ?? "").trim();
  if (!cleaned) {
    return "News";
  }
  if (/^(the )?economic times$/i.test(cleaned) || /^et now$/i.test(cleaned)) {
    return "Economic Times";
  }
  if (/^livemint$/i.test(cleaned) || /^mint$/i.test(cleaned)) {
    return "Livemint";
  }
  return cleaned;
}

function getPublisherPriority(publisher: string | undefined): number {
  const normalized = normalizePublisherName(publisher).toLowerCase();
  if (normalized === "moneycontrol") return 0;
  if (normalized === "economic times") return 1;
  if (normalized === "business standard") return 2;
  if (normalized === "financial express") return 3;
  if (normalized === "livemint") return 4;
  if (normalized === "ndtv profit") return 5;
  return 6;
}

function truncateTitle(title: string, maxLength = 80): string {
  if (title.length <= maxLength) {
    return title;
  }
  return `${title.slice(0, maxLength - 3).trimEnd()}...`;
}

function parsePublishedAt(value?: string | null): Date | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(" IST", "+05:30").replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatRelativeDate(value?: string | null): string {
  const publishedAt = parsePublishedAt(value);
  if (!publishedAt) {
    return "Recent";
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfPublishedDay = new Date(
    publishedAt.getFullYear(),
    publishedAt.getMonth(),
    publishedAt.getDate()
  );
  const diffMs = startOfToday.getTime() - startOfPublishedDay.getTime();
  const diffDays = Math.round(diffMs / 86_400_000);

  if (diffDays <= 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  return `${diffDays} days ago`;
}

function isStockSymbolQuery(value: string): boolean {
  return /^[A-Z0-9&-]{2,15}$/i.test(value.trim().toUpperCase());
}

function shouldUseStockAnalysis(value: string): boolean {
  const normalized = value.trim();
  const lower = normalized.toLowerCase();
  if (/[?]/.test(normalized) || /\b(how|what|why|am i|should)\b/i.test(lower)) {
    return false;
  }
  return isStockSymbolQuery(normalized.toUpperCase());
}

function getCategoryLabel(category: string): string {
  return category
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getMostTradedSymbol(trades: CompletedTradeListItem[]): string | null {
  const counts = new Map<string, number>();
  for (const trade of trades) {
    const symbol = trade.stock_symbol.toUpperCase();
    counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

export default function AiTab({
  isSignedIn,
  marketData,
}: {
  isSignedIn: boolean;
  marketData: MarketDashboardData | null;
}) {
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiResult | null>(null);
  const [recentQueries, setRecentQueries] = useState<AiQueryItem[]>([]);
  const [resultIntel, setResultIntel] = useState<TickerIntelResponse | null>(null);
  const [personalTrades, setPersonalTrades] = useState<CompletedTradeListItem[]>([]);
  const [completedTradeCache, setCompletedTradeCache] = useState<CompletedTradeListItem[]>([]);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  useEffect(() => {
    let active = true;

    void storageGet<Array<string | AiQueryItem>>(RECENT_AI_QUERIES_KEY)
      .then((stored) => {
        if (active) {
          setRecentQueries(
            (stored ?? []).map((item) =>
              typeof item === "string" ? { symbol: item, date: getIstDateKey() } : item
            )
          );
        }
      })
      .catch(() => undefined);

    void storageGet<CompletedTradeListItem[]>(CACHED_AI_COMPLETED_TRADES_KEY)
      .then((stored) => {
        if (active && stored) {
          setCompletedTradeCache(stored);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isSignedIn) return;
    if (completedTradeCache.length > 0) return;

    let cancelled = false;
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token || cancelled) return;
        const trades = await fetchCompletedTrades(token, { limit: 200, offset: 0 });
        if (!cancelled && trades.length > 0) {
          setCompletedTradeCache(trades);
          void storageSet(CACHED_AI_COMPLETED_TRADES_KEY, trades).catch(() => undefined);
        }
      } catch {
        // Suggestions can fall back to defaults when history is unavailable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, completedTradeCache.length]);

  const todaysQueries = useMemo(
    () => recentQueries.filter((item) => item.date === getIstDateKey()).slice(0, MAX_RECENT_QUERIES),
    [recentQueries]
  );

  const visibleSources = useMemo(() => {
    const sources = result?.kind === "stock" && Array.isArray(result.data.sources) ? result.data.sources : [];
    return [...sources]
      .sort((left, right) => {
        const priorityGap =
          getPublisherPriority(left.publisher) - getPublisherPriority(right.publisher);
        if (priorityGap !== 0) {
          return priorityGap;
        }

        const leftTime = parsePublishedAt(left.published_at)?.getTime() ?? 0;
        const rightTime = parsePublishedAt(right.published_at)?.getTime() ?? 0;
        if (leftTime !== rightTime) {
          return rightTime - leftTime;
        }

        return (right.final_score ?? 0) - (left.final_score ?? 0);
      })
      .slice(0, MAX_VISIBLE_SOURCES);
  }, [result]);

  const personalHistory = useMemo(() => {
    if (!personalTrades.length) {
      return null;
    }
    const wins = personalTrades.filter((trade) => trade.pnl > 0).length;
    return {
      count: personalTrades.length,
      winRate: wins / personalTrades.length,
      lastTrade: personalTrades[0],
    };
  }, [personalTrades]);

  const quickSuggestions = useMemo(() => {
    const lastSymbol = todaysQueries[0]?.symbol || recentQueries[0]?.symbol || getMostTradedSymbol(completedTradeCache) || "TCS";
    return [
      "How am I doing this week?",
      "What sectors are strong?",
      "Am I overtrading?",
      `${lastSymbol} outlook`,
    ];
  }, [completedTradeCache, recentQueries, todaysQueries]);

  async function saveRecentQuery(nextSymbol: string) {
    const today = getIstDateKey();
    const normalized = nextSymbol.toUpperCase();
    const nextQueries = [
      { symbol: normalized, date: today },
      ...recentQueries.filter((item) => !(item.symbol === normalized && item.date === today)),
    ].slice(0, MAX_RECENT_QUERIES);
    setRecentQueries(nextQueries);
    await storageSet(RECENT_AI_QUERIES_KEY, nextQueries);
  }

  async function runQuery(nextSymbol?: string) {
    const query = (nextSymbol ?? symbol).trim();
    if (!query) {
      setError("Enter a question or stock symbol first.");
      return;
    }

    if (!isSignedIn) {
      setError("Sign in to use IndiaCircle research.");
      return;
    }

    setSymbol(query);
    setLoading(true);
    setError(null);
    setResult(null);
    setResultIntel(null);
    setPersonalTrades([]);
    setSourcesOpen(false);

    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error("Sign in to use IndiaCircle research.");
      }

      if (shouldUseStockAnalysis(query)) {
        const normalizedSymbol = query.toUpperCase();
        const [response, tickerIntel] = await Promise.all([
          fetchWhyMoving(token, normalizedSymbol),
          fetchTickerIntel(normalizedSymbol).catch(() => null),
        ]);
        if (tickerIntel) {
          setResultIntel(tickerIntel);
        }
        setResult({ kind: "stock", data: response });

        const completedTrades = completedTradeCache.length
          ? completedTradeCache
          : await fetchCompletedTrades(token, { limit: 200, offset: 0 }).catch(() => []);
        if (!completedTradeCache.length && completedTrades.length) {
          setCompletedTradeCache(completedTrades);
          void storageSet(CACHED_AI_COMPLETED_TRADES_KEY, completedTrades).catch(() => undefined);
        }
        setPersonalTrades(
          completedTrades
            .filter(
              (trade) => trade.stock_symbol.toUpperCase() === normalizedSymbol
            )
            .sort(
              (left, right) =>
                new Date(right.exit_date).getTime() - new Date(left.exit_date).getTime()
            )
        );

        await saveRecentQuery(normalizedSymbol);
      } else {
        const response = await askResearch(token, query);
        setResult({ kind: "research", data: response });
      }
    } catch (queryError) {
      setResult(null);
      setResultIntel(null);
      setPersonalTrades([]);
      if (queryError instanceof APIError && queryError.status === 429) {
        setError(queryError.message);
      } else {
        setError(
          queryError instanceof Error
            ? queryError.message
            : "Unable to run this research query right now."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  const stockResult = result?.kind === "stock" ? result.data : null;
  const moveType = stockResult ? classifyMoveType(stockResult, resultIntel) : null;
  const conviction = stockResult ? getMoveConviction(stockResult, resultIntel) : null;
  const convictionClass = conviction ? `conviction-${conviction.level.toLowerCase()}` : null;
  const niftyChange = marketData?.indices?.nifty_50?.change_pct;
  const stockChange = result?.kind === "stock" ? result.data.change_pct : null;
  const relativePerf =
    niftyChange != null &&
    stockChange != null &&
    Number.isFinite(niftyChange) &&
    Number.isFinite(stockChange)
      ? stockChange - niftyChange
      : null;
  const cleanExplanation = stockResult ? getCleanExplanation(stockResult) : "";
  const splitExplanation = stockResult ? splitExplanationText(cleanExplanation) : null;

  return (
    <section className="ai-root">
      <div className="ai-card">
        <div className="ai-search-row">
          <input
            id="ai-symbol-input"
            className="ai-input"
            placeholder="Ask research or type TCS..."
            value={symbol}
            onChange={(event) => setSymbol(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void runQuery();
              }
            }}
          />

          <button
            className="ai-submit"
            disabled={loading || !symbol.trim()}
            onClick={() => void runQuery(symbol)}
          >
            {loading ? "Analyzing..." : shouldUseStockAnalysis(symbol) ? "Why moving?" : "Ask"}
          </button>
        </div>

        {!result ? (
          <div className="ai-quick-block">
            <div className="ai-recent-title">Quick research</div>
            <div className="ai-today-queries">
              {quickSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  className="ai-recent-pill"
                  disabled={loading}
                  onClick={() => void runQuery(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="ai-recent-block">
          <div className="ai-recent-title">Today's queries</div>
          {todaysQueries.length ? (
            <div className="ai-today-queries">
              {todaysQueries.map((recentQuery) => (
                <button
                  key={`${recentQuery.symbol}-${recentQuery.date}`}
                  className="ai-recent-pill"
                  disabled={loading}
                  onClick={() => void runQuery(recentQuery.symbol)}
                >
                  {recentQuery.symbol}
                </button>
              ))}
            </div>
          ) : (
            <p className="ai-recent-empty">Symbols you check today will show here.</p>
          )}
        </div>
      </div>

      {error ? <div className="connection-error-banner">{error}</div> : null}

      {loading ? (
        <article className="ai-result-card ai-loading-card">
          <div className="ai-loading-pulse" />
          <div className="ai-result-header">
            <div>
              <h2>Researching...</h2>
              <SkeletonLine width="70%" height="12px" />
              <SkeletonLine width="48%" height="16px" />
            </div>
            <SkeletonLine width="54px" height="28px" />
          </div>
          <SkeletonLine width="100%" height="12px" />
          <SkeletonLine width="94%" height="12px" />
          <SkeletonLine width="76%" height="12px" />
        </article>
      ) : null}

      {result?.kind === "stock" && stockResult ? (
        <article className="ai-result-card">
          <div className="ai-result-header">
            <div>
              <h2>{stockResult.symbol}</h2>
              {stockResult.company_name ? (
                <p className="ai-result-company">{stockResult.company_name}</p>
              ) : null}
              <p className="ai-result-price">₹{formatPrice(stockResult.price)}</p>
            </div>
            <span
              className={`ai-result-change${
                (toFiniteNumber(stockResult.change_pct) ?? 0) >= 0 ? " positive" : " negative"
              }`}
            >
              {formatNullablePercent(stockResult.change_pct)}
            </span>
          </div>

          {moveType ? (
            <div className={`move-type-badge ${moveType.className}`}>{moveType.type}</div>
          ) : null}

          {(resultIntel || relativePerf != null) ? (
            <div className="ai-context-lines">
              {resultIntel ? (
                <p className="ai-momentum-line">
                  Vol:{" "}
                  {/above/i.test(resultIntel.volume_vs_avg) ? (
                    <strong>{resultIntel.volume_vs_avg}</strong>
                  ) : (
                    <span>{resultIntel.volume_vs_avg}</span>
                  )}{" "}
                  · {resultIntel.sentiment_line}
                </p>
              ) : null}
              {relativePerf != null ? (
                <p className="relative-perf">
                  vs Nifty:{" "}
                  <span className={relativePerf >= 0 ? "outperform" : "underperform"}>
                    {relativePerf >= 0 ? "outperforming" : "underperforming"}
                  </span>{" "}
                  by {Math.abs(relativePerf).toFixed(1)}%
                </p>
              ) : null}
            </div>
          ) : null}

          {splitExplanation ? (
            <div className="ai-result-explanation">
            <p className="ai-explanation-headline">{splitExplanation.headline}</p>
            {splitExplanation.detail ? (
              <p className="ai-explanation-detail">{splitExplanation.detail}</p>
            ) : null}
            </div>
          ) : null}

          {conviction && convictionClass ? (
            <div className={`conviction-meter ${convictionClass}`}>
              <div className="conviction-header">
                <span className="conviction-label">
                  Move Conviction: {conviction.level} ({conviction.score}%)
                </span>
              </div>
              <div className="conviction-bar-track" aria-hidden="true">
                <div className="conviction-bar-fill" style={{ width: `${conviction.score}%` }} />
              </div>
              {conviction.reasons.length ? (
                <div className="conviction-reasons">
                  {conviction.reasons.map((reason, index) => (
                    <span key={`${reason}-${index}`} className="conviction-reason-pill">
                      {reason}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {personalHistory ? (
            <section className="ai-history-card">
              <div className="ai-history-title">Your history with {stockResult.symbol}</div>
              <div className="ai-history-stats">
                {personalHistory.count} trades · Win rate:{" "}
                <strong>{formatPercent(personalHistory.winRate)}</strong> · Last:{" "}
                {new Date(personalHistory.lastTrade.exit_date).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                })}
              </div>
              <div
                className={`ai-history-stats ${
                  personalHistory.lastTrade.pnl >= 0 ? "journal-pnl positive" : "journal-pnl negative"
                }`}
              >
                Last P&amp;L: {formatPnl(personalHistory.lastTrade.pnl)}
              </div>
            </section>
          ) : null}

          {visibleSources.length ? (
            <div className="ai-source-panel">
              <button
                type="button"
                className="sources-toggle"
                onClick={() => setSourcesOpen((current) => !current)}
              >
                <span className={`chevron${sourcesOpen ? " open" : ""}`}>▶</span>
                <span>Sources ({visibleSources.length})</span>
              </button>
              {sourcesOpen ? (
                <div className="ai-source-grid">
                  {visibleSources.map((source) => (
                    <a
                      key={`${source.url}-${source.title}`}
                      className="ai-source-card"
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <div className="ai-source-card-top">
                        <span className="ai-source-publisher">
                          {normalizePublisherName(source.publisher)}
                        </span>
                        <span className="ai-source-date">
                          {formatRelativeDate(source.published_at)}
                        </span>
                      </div>
                      <strong className="ai-source-card-title">{truncateTitle(source.title)}</strong>
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="ai-quota-copy">
            Queries remaining: {result.data.queries_remaining}/{result.data.queries_limit} today
          </div>
        </article>
      ) : null}

      {result?.kind === "research" ? (
        <article className="ai-result-card">
          <div className="ai-result-header">
            <div>
              <h2>IndiaCircle Research</h2>
              <p className="ai-result-company">{result.data.query}</p>
            </div>
            <span className="research-category-badge">{getCategoryLabel(result.data.category)}</span>
          </div>

          <div className="ai-result-explanation research-response">
            {result.data.response.split("\n").map((line, index) => {
              const boldProcessed = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
              const isBullet = /^\s*[-•]\s/.test(line);
              const cleanLine = isBullet ? line.replace(/^\s*[-•]\s*/, "") : line;
              const processedLine = isBullet
                ? cleanLine.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
                : boldProcessed;

              if (!line.trim()) return <br key={index} />;

              if (isBullet) {
                return (
                  <div key={index} className="research-bullet">
                    <span className="bullet-dot">•</span>
                    <span dangerouslySetInnerHTML={{ __html: processedLine }} />
                  </div>
                );
              }

              return (
                <p
                  key={index}
                  dangerouslySetInnerHTML={{ __html: processedLine }}
                  style={{ margin: "4px 0" }}
                />
              );
            })}
          </div>

          <div className="ai-quota-copy">
            Queries remaining: {result.data.queries_remaining}/{result.data.queries_limit} today
          </div>
        </article>
      ) : null}
    </section>
  );
}
