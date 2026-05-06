import { useEffect, useMemo, useState } from "react";

import {
  APIError,
  fetchCompletedTrades,
  fetchWhyMoving,
  type CompletedTradeListItem,
  type TickerIntelResponse,
  type WhyMovingResponse,
} from "../shared/api";
import { getAuthToken } from "../shared/auth";
import { storageGet, storageSet } from "../shared/chrome";

const RECENT_AI_QUERIES_KEY = "recentAiQueries";
const MAX_RECENT_QUERIES = 5;
const MAX_VISIBLE_SOURCES = 3;

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

export default function AiTab({ isSignedIn }: { isSignedIn: boolean }) {
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WhyMovingResponse | null>(null);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const [previewIntel, setPreviewIntel] = useState<TickerIntelResponse | null>(null);
  const [personalTrades, setPersonalTrades] = useState<CompletedTradeListItem[]>([]);

  useEffect(() => {
    let active = true;

    void storageGet<string[]>(RECENT_AI_QUERIES_KEY)
      .then((stored) => {
        if (active) {
          setRecentQueries(stored ?? []);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const visibleSources = useMemo(() => {
    const sources = Array.isArray(result?.sources) ? result.sources : [];
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

  async function saveRecentQuery(nextSymbol: string) {
    const nextQueries = [nextSymbol, ...recentQueries.filter((item) => item !== nextSymbol)]
      .slice(0, MAX_RECENT_QUERIES);
    setRecentQueries(nextQueries);
    await storageSet(RECENT_AI_QUERIES_KEY, nextQueries);
  }

  async function runQuery(nextSymbol?: string) {
    const normalizedSymbol = (nextSymbol ?? symbol).trim();
    if (!normalizedSymbol) {
      setError("Enter a stock symbol first.");
      return;
    }

    if (!isSignedIn) {
      setError("Sign in to use AI market explanations.");
      return;
    }

    setSymbol(normalizedSymbol);
    setLoading(true);
    setError(null);
    setResult(null);
    setPersonalTrades([]);

    void chrome.runtime
      .sendMessage({
        type: "ticker:fetch-intel",
        payload: { symbol: normalizedSymbol.toUpperCase() },
      })
      .then((response) => {
        if (response?.ok && response.tickerIntel) {
          setPreviewIntel(response.tickerIntel as TickerIntelResponse);
          return;
        }
        setPreviewIntel(null);
      })
      .catch(() => {
        setPreviewIntel(null);
      });

    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error("Sign in to use AI market explanations.");
      }

      const response = await fetchWhyMoving(token, normalizedSymbol);
      setResult(response);

      const completedTrades = await fetchCompletedTrades(token, { limit: 200, offset: 0 }).catch(
        () => []
      );
      setPersonalTrades(
        completedTrades
          .filter(
            (trade) => trade.stock_symbol.toUpperCase() === normalizedSymbol.toUpperCase()
          )
          .sort(
            (left, right) =>
              new Date(right.exit_date).getTime() - new Date(left.exit_date).getTime()
          )
      );

      await saveRecentQuery(normalizedSymbol);
    } catch (queryError) {
      setResult(null);
      setPersonalTrades([]);
      if (queryError instanceof APIError && queryError.status === 429) {
        setError(queryError.message);
      } else {
        setError(
          queryError instanceof Error
            ? queryError.message
            : "Unable to analyze this symbol right now."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="ai-root">
      <div className="ai-card">
        <label className="ai-label" htmlFor="ai-symbol-input">
          Stock Symbol
        </label>
        <input
          id="ai-symbol-input"
          className="ai-input"
          placeholder="Enter stock symbol (e.g., TCS, ETERNAL)"
          value={symbol}
          onChange={(event) => setSymbol(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void runQuery();
            }
          }}
        />

        <button className="ai-search-button" disabled={loading} onClick={() => void runQuery()}>
          {loading ? "Loading..." : "Why is it moving? \uD83D\uDD0D"}
        </button>

        <div className="ai-recent-block">
          <div className="ai-recent-title">Recent queries</div>
          {recentQueries.length ? (
            <div className="ai-recent-list">
              {recentQueries.map((recentSymbol) => (
                <button
                  key={recentSymbol}
                  className="ai-recent-pill"
                  disabled={loading}
                  onClick={() => void runQuery(recentSymbol)}
                >
                  {recentSymbol}
                </button>
              ))}
            </div>
          ) : (
            <p className="ai-recent-empty">Your last 5 symbols will show here.</p>
          )}
        </div>
      </div>

      {error ? <div className="connection-error-banner">{error}</div> : null}

      {loading ? (
        <article className="ai-result-card ai-loading-card">
          <div className="ai-loading-pulse" />
          <div className="ai-result-header">
            <div>
              <h2>Analyzing {symbol.toUpperCase()}...</h2>
              {previewIntel?.company_name ? (
                <p className="ai-result-company">{previewIntel.company_name}</p>
              ) : null}
              {previewIntel ? (
                <p className="ai-result-price">₹{formatPrice(previewIntel.price)}</p>
              ) : null}
            </div>
            {previewIntel ? (
              <span
                className={`ai-result-change${
                  (toFiniteNumber(previewIntel.change_pct) ?? 0) >= 0 ? " positive" : " negative"
                }`}
              >
                {formatNullablePercent(previewIntel.change_pct)}
              </span>
            ) : null}
          </div>
          <p className="ai-result-explanation">
            Pulling recent coverage and market context for this symbol.
          </p>
        </article>
      ) : null}

      {result ? (
        <article className="ai-result-card">
          <div className="ai-result-header">
            <div>
              <h2>{result.symbol}</h2>
              {result.company_name ? (
                <p className="ai-result-company">{result.company_name}</p>
              ) : null}
              <p className="ai-result-price">₹{formatPrice(result.price)}</p>
            </div>
            <span
              className={`ai-result-change${
                (toFiniteNumber(result.change_pct) ?? 0) >= 0 ? " positive" : " negative"
              }`}
            >
              {formatNullablePercent(result.change_pct)}
            </span>
          </div>

          <p className="ai-result-explanation">{getExplanationBody(result)}</p>

          {personalHistory ? (
            <section className="ai-personal-history">
              <div className="ai-personal-history-title">Your history with {result.symbol}</div>
              <div className="ai-personal-stat">
                <span>Trades</span>
                <strong>{personalHistory.count}</strong>
              </div>
              <div className="ai-personal-stat">
                <span>Win rate</span>
                <strong>{formatPercent(personalHistory.winRate)}</strong>
              </div>
              <div className="ai-personal-stat">
                <span>Last trade</span>
                <strong>
                  {new Date(personalHistory.lastTrade.exit_date).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  · ₹{formatIndianNumber(personalHistory.lastTrade.pnl)}
                </strong>
              </div>
            </section>
          ) : null}

          <div className="ai-source-panel">
            <div className="ai-source-panel-header">
              <div>
                <div className="ai-source-title">Latest coverage</div>
                <p className="ai-source-subcopy">
                  Clean, readable source links for the most relevant recent articles.
                </p>
              </div>
              {result.cached ? <span className="ai-source-state">Cached</span> : null}
            </div>

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
          </div>

          <div className="ai-quota-copy">
            Queries remaining: {result.queries_remaining}/{result.queries_limit} today
          </div>
        </article>
      ) : null}
    </section>
  );
}
