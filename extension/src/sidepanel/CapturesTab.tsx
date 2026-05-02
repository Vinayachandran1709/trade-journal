import { useEffect, useState } from "react";

import {
  fetchSetupReportCard,
  fetchSetups,
  fetchTrades,
  type TradeListItem,
  type TradeSetupItem,
} from "../shared/api";
import { getAuthToken } from "../shared/auth";
import type { CaptureState } from "../shared/captures";

const EMOTIONS = [
  { emoji: "😎", label: "Confident", value: "confident" },
  { emoji: "😰", label: "Fearful", value: "fearful" },
  { emoji: "🤑", label: "Greedy", value: "greedy" },
  { emoji: "😤", label: "Revenge", value: "revenge" },
  { emoji: "😱", label: "FOMO", value: "fomo" },
  { emoji: "😐", label: "Neutral", value: "neutral" },
  { emoji: "🥱", label: "Bored", value: "bored" },
] as const;

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatTradeTimestamp(trade: {
  trade_date: string;
  trade_time?: string | null;
}): string {
  const raw = trade.trade_time
    ? `${trade.trade_date}T${trade.trade_time}`
    : `${trade.trade_date}T00:00:00`;
  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    return trade.trade_time
      ? `${trade.trade_date} ${trade.trade_time}`
      : trade.trade_date;
  }

  return DATE_TIME_FORMATTER.format(parsed);
}

function RecentCaptureRow({ trade }: { trade: TradeListItem }) {
  return (
    <div className="recent-capture-row">
      <div>
        <strong>
          {trade.trade_type} {trade.stock_symbol}
        </strong>
        <p>
          Qty {trade.quantity} at ₹{trade.price} · {formatTradeTimestamp(trade)}
        </p>
      </div>
      <span className="broker-pill">{trade.broker ?? "capture"}</span>
    </div>
  );
}

export default function CapturesTab({
  captureState,
  savingTradeId,
  onSave,
  isSignedIn,
}: {
  captureState: CaptureState | null;
  savingTradeId: number | null;
  onSave: (tradeId: number, emotionTag: string, note: string) => Promise<void>;
  isSignedIn: boolean;
}) {
  const [recentTrades, setRecentTrades] = useState<TradeListItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [setups, setSetups] = useState<TradeSetupItem[]>([]);
  const [reportCard, setReportCard] = useState<Record<string, unknown> | null>(null);

  const todaysTrades = captureState?.trades ?? [];
  const showRecentCaptures = todaysTrades.length === 0;

  useEffect(() => {
    let active = true;

    async function loadRecentTrades() {
      if (!isSignedIn || !showRecentCaptures) {
        if (active) {
          setRecentTrades([]);
          setRecentError(null);
          setRecentLoading(false);
        }
        return;
      }

      setRecentLoading(true);

      try {
        const token = await getAuthToken();
        if (!token) {
          throw new Error("Sign in to load recent captures.");
        }

        const trades = await fetchTrades(token, { limit: 5 });
        if (active) {
          setRecentTrades(trades);
          setRecentError(null);
        }
      } catch (error) {
        if (active) {
          setRecentTrades([]);
          setRecentError(
            error instanceof Error ? error.message : "Unable to load recent captures."
          );
        }
      } finally {
        if (active) {
          setRecentLoading(false);
        }
      }
    }

    void loadRecentTrades();

    return () => {
      active = false;
    };
  }, [isSignedIn, showRecentCaptures]);

  useEffect(() => {
    let active = true;

    async function loadSetups() {
      if (!isSignedIn) {
        if (active) setSetups([]);
        return;
      }
      const token = await getAuthToken();
      if (!token) return;
      const result = await fetchSetups(token, { limit: 5 }).catch(() => []);
      if (active) setSetups(result);
    }

    void loadSetups();
    return () => {
      active = false;
    };
  }, [isSignedIn, captureState?.lastSyncAt]);

  async function openReportCard(setupId: number) {
    const token = await getAuthToken();
    if (!token) return;
    const result = await fetchSetupReportCard(token, setupId);
    setReportCard(result);
  }

  return (
    <section className="placeholder-grid">
      <article className="placeholder-card">
        <h2>Today's Captures</h2>
        {todaysTrades.length ? (
          <p>
            Captured {todaysTrades.length} new trade
            {todaysTrades.length === 1 ? "" : "s"} today.
          </p>
        ) : (
          <div className="capture-empty-state">
            <span className="capture-empty-icon" aria-hidden="true" />
            <p>
              No trades captured today. Visit your broker&apos;s order page to
              auto-capture.
            </p>
          </div>
        )}
        {captureState?.lastError ? (
          <p className="error-copy">{captureState.lastError}</p>
        ) : null}
      </article>

      {todaysTrades.map((trade) => (
        <CaptureCard
          key={trade.id}
          trade={trade}
          saving={savingTradeId === trade.id}
          onSave={onSave}
        />
      ))}

      {showRecentCaptures ? (
        <article className="placeholder-card">
          <h2>Recent captures</h2>
          {recentLoading ? (
            <p>Loading your last trades...</p>
          ) : recentTrades.length ? (
            <div className="recent-capture-list">
              {recentTrades.map((trade) => (
                <RecentCaptureRow key={trade.id} trade={trade} />
              ))}
            </div>
          ) : (
            <p>{recentError ?? "No recent captures yet."}</p>
          )}
        </article>
      ) : null}

      <article className="placeholder-card">
        <h2>Pre-trade setups</h2>
        {setups.length ? (
          <div className="setup-list">
            {setups.map((setup) => (
              <button
                key={setup.id}
                className="setup-row"
                onClick={() => setup.linked_trade_id && void openReportCard(setup.id)}
              >
                <span>
                  <strong>{setup.symbol}</strong>
                  <small>
                    Conviction {setup.conviction_score ?? "—"} ·{" "}
                    {setup.risk_score ? `Risk ${setup.risk_score}` : "Risk pending"}
                  </small>
                </span>
                <em>
                  {setup.linked_trade_id
                    ? "Linked"
                    : "Pending"}
                </em>
              </button>
            ))}
          </div>
        ) : (
          <p>No pre-trade setups logged yet.</p>
        )}
        {reportCard ? (
          <div className="setup-report">
            <strong>Report card</strong>
            <p>{String(reportCard.plan_deviation ?? "")}</p>
            <p>{String(reportCard.lesson ?? "")}</p>
          </div>
        ) : null}
      </article>
    </section>
  );
}

function CaptureCard({
  trade,
  saving,
  onSave,
}: {
  trade: NonNullable<CaptureState>["trades"][number];
  saving: boolean;
  onSave: (tradeId: number, emotionTag: string, note: string) => Promise<void>;
}) {
  const [emotionTag, setEmotionTag] = useState(trade.emotion_tag ?? "");
  const [note, setNote] = useState(trade.notes ?? "");
  const [noteOpen, setNoteOpen] = useState(false);

  function handleEmotionTap(value: string) {
    const next = emotionTag === value ? "" : value;
    setEmotionTag(next);
    void onSave(trade.id, next, note);
  }

  return (
    <article className="placeholder-card capture-card">
      <div className="capture-header">
        <div>
          <h2>
            {trade.trade_type} {trade.stock_symbol}
          </h2>
          <p>
            Qty {trade.quantity} at {trade.price} on {trade.trade_date}
            {trade.trade_time ? ` ${trade.trade_time}` : ""}
          </p>
        </div>
        <span className="broker-pill">{trade.broker ?? "capture"}</span>
      </div>

      <div className="emotion-row">
        {EMOTIONS.map(({ emoji, label, value }) => (
          <button
            key={value}
            className={`emotion-pill${emotionTag === value ? " emotion-pill--selected" : ""}`}
            onClick={() => handleEmotionTap(value)}
            disabled={saving}
          >
            {emoji} {label}
          </button>
        ))}
      </div>

      {noteOpen ? (
        <textarea
          className="field-input field-textarea"
          value={note}
          autoFocus
          onChange={(event) => setNote(event.target.value)}
          placeholder="Why this trade was taken..."
        />
      ) : (
        <button className="add-note-link" onClick={() => setNoteOpen(true)}>
          + Add note
        </button>
      )}

      {noteOpen ? (
        <button
          className="save-button"
          disabled={saving}
          onClick={() => onSave(trade.id, emotionTag, note)}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      ) : null}
    </article>
  );
}
