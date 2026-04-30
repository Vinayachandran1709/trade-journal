import { useEffect, useState } from "react";

import { APIError, fetchWhyMoving, type WhyMovingResponse } from "../shared/api";
import { getAuthToken } from "../shared/auth";
import { storageGet, storageSet } from "../shared/chrome";

const RECENT_AI_QUERIES_KEY = "recentAiQueries";
const MAX_RECENT_QUERIES = 5;

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

function formatPublishedAt(value?: string | null): string {
  if (!value) {
    return "Latest";
  }

  const parts = value.split(" ");
  if (parts.length >= 2) {
    return `${parts[0]} • ${parts[1]} IST`;
  }

  return value;
}

function formatRecencyBucket(value?: string | null): string {
  if (value === "today") {
    return "Today";
  }
  if (value === "yesterday") {
    return "Yesterday";
  }
  return "Recent";
}

function formatConfidence(value?: string | null): string {
  if (value === "high") {
    return "High confidence";
  }
  if (value === "medium") {
    return "Medium confidence";
  }
  return "Low confidence";
}

function formatSourceQuality(value?: string | null): string {
  if (value === "official_filing") {
    return "Official filing";
  }
  if (value === "trusted_news") {
    return "Trusted news";
  }
  if (value === "social_chatter") {
    return "Social chatter";
  }
  return "Fallback web";
}

function getExplanationBody(result: WhyMovingResponse): string {
  if (!result.disclaimer) {
    return result.explanation.trim();
  }

  return result.explanation.replace(result.disclaimer, "").trim();
}

export default function AiTab({ isSignedIn }: { isSignedIn: boolean }) {
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WhyMovingResponse | null>(null);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);

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

    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error("Sign in to use AI market explanations.");
      }

      const response = await fetchWhyMoving(token, normalizedSymbol);
      setResult(response);
      await saveRecentQuery(normalizedSymbol);
    } catch (queryError) {
      setResult(null);
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

          <div className="ai-signal-row">
            <span className={`ai-signal-pill confidence-${result.confidence ?? "low"}`}>
              {formatConfidence(result.confidence)}
            </span>
            <span className="ai-signal-pill quality">
              {formatSourceQuality(result.source_quality)}
            </span>
          </div>

          <div className="ai-source-panel">
            <div className="ai-source-panel-header">
              <div>
                <div className="ai-source-title">Latest coverage</div>
                <p className="ai-source-subcopy">
                  Showing up to {result.source_count || 0} relevant articles from today first,
                  then yesterday only if needed.
                </p>
              </div>
              {result.cached ? <span className="ai-source-state">Cached</span> : null}
            </div>

            <div className="ai-source-grid">
              {(Array.isArray(result.sources) ? result.sources : []).map((source) => (
                <a
                  key={`${source.url}-${source.title}`}
                  className="ai-source-card"
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="ai-source-card-top">
                    <span className="ai-source-publisher">{source.publisher}</span>
                    <span className={`ai-source-badge ${source.recency_bucket ?? "recent"}`}>
                      {formatRecencyBucket(source.recency_bucket)}
                    </span>
                  </div>
                  <strong className="ai-source-card-title">{source.title}</strong>
                  <div className="ai-source-card-footer">
                    <span>{formatPublishedAt(source.published_at)}</span>
                    <span>
                      Score {Math.round(source.final_score || 0)} • Open article
                    </span>
                  </div>
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
