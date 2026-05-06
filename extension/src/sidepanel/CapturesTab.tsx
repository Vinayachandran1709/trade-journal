import { useEffect, useMemo, useState } from "react";

import {
  fetchSetupReportCard,
  fetchSetups,
  fetchTrades,
  type TradeListItem,
  type TradeSetupItem,
} from "../shared/api";
import { getAuthToken } from "../shared/auth";
import type { CaptureState } from "../shared/captures";
import { composePlanNote, extractPlanMetadata, type PlanValue, type ReasonValue } from "./behavioral";

const EMOTIONS = [
  { emoji: "😎", label: "Confident", value: "confident" },
  { emoji: "😰", label: "Fearful", value: "fearful" },
  { emoji: "🤑", label: "Greedy", value: "greedy" },
  { emoji: "😤", label: "Revenge", value: "revenge" },
  { emoji: "😱", label: "FOMO", value: "fomo" },
  { emoji: "😐", label: "Neutral", value: "neutral" },
  { emoji: "🥱", label: "Bored", value: "bored" },
] as const;

const PLAN_OPTIONS: Array<{ label: string; value: PlanValue; className: string }> = [
  { label: "✅ Yes", value: "YES", className: "selected-yes" },
  { label: "⚠️ Partially", value: "PARTIAL", className: "selected-partial" },
  { label: "❌ No", value: "NO", className: "selected-no" },
];

const REASON_OPTIONS: Array<{ label: string; value: Exclude<ReasonValue, null> }> = [
  { label: "Early exit", value: "EARLY_EXIT" },
  { label: "Late entry", value: "LATE_ENTRY" },
  { label: "Revenge", value: "REVENGE" },
  { label: "Oversized", value: "OVERSIZED" },
  { label: "FOMO", value: "FOMO" },
  { label: "Ignored SL", value: "IGNORED_SL" },
];

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
                <em>{setup.linked_trade_id ? "Linked" : "Pending"}</em>
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
  const parsedNote = useMemo(() => extractPlanMetadata(trade.notes), [trade.notes]);
  const [emotionTag, setEmotionTag] = useState(trade.emotion_tag ?? "");
  const [plan, setPlan] = useState<PlanValue>(parsedNote.plan);
  const [reason, setReason] = useState<ReasonValue>(parsedNote.reason);
  const [note, setNote] = useState(parsedNote.text);
  const [noteOpen, setNoteOpen] = useState(false);

  useEffect(() => {
    const nextParsed = extractPlanMetadata(trade.notes);
    setEmotionTag(trade.emotion_tag ?? "");
    setPlan(nextParsed.plan);
    setReason(nextParsed.reason);
    setNote(nextParsed.text);
  }, [trade.emotion_tag, trade.notes]);

  function buildNote(nextPlan = plan, nextReason = reason, nextText = note) {
    return composePlanNote({
      plan: nextPlan,
      reason: nextPlan === "NO" || nextPlan === "PARTIAL" ? nextReason : null,
      text: nextText,
    });
  }

  function handleEmotionTap(value: string) {
    const next = emotionTag === value ? "" : value;
    setEmotionTag(next);
    void onSave(trade.id, next, buildNote());
  }

  function handlePlanTap(value: PlanValue) {
    const nextPlan = plan === value ? null : value;
    const nextReason = nextPlan === "NO" || nextPlan === "PARTIAL" ? reason : null;
    setPlan(nextPlan);
    setReason(nextReason);
    void onSave(trade.id, emotionTag, buildNote(nextPlan, nextReason));
  }

  function handleReasonTap(value: Exclude<ReasonValue, null>) {
    const nextReason = reason === value ? null : value;
    setReason(nextReason);
    void onSave(trade.id, emotionTag, buildNote(plan, nextReason));
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

      <div className="post-trade-question">
        <div className="plan-question-label">Did you follow your plan?</div>
        <div className="plan-pills">
          {PLAN_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`plan-pill${plan === option.value ? ` ${option.className}` : ""}`}
              onClick={() => handlePlanTap(option.value)}
              disabled={saving}
            >
              {option.label}
            </button>
          ))}
        </div>

        {plan === "NO" || plan === "PARTIAL" ? (
          <>
            <div className="plan-question-label">What happened?</div>
            <div className="reason-pills">
              {REASON_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={`reason-pill${reason === option.value ? " selected" : ""}`}
                  onClick={() => handleReasonTap(option.value)}
                  disabled={saving}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {noteOpen ? (
        <textarea
          className="field-input field-textarea"
          value={note}
          autoFocus
          onChange={(event) => setNote(event.target.value)}
          placeholder="What stood out about this trade?"
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
          onClick={() => onSave(trade.id, emotionTag, buildNote(plan, reason, note))}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      ) : null}
    </article>
  );
}
