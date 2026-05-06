import { useEffect, useMemo, useState } from "react";

import {
  fetchCompletedTrades,
  fetchSetups,
  fetchTrades,
  type CompletedTradeListItem,
  type TradeListItem,
  type TradeSetupItem,
} from "../shared/api";
import { getAuthToken } from "../shared/auth";
import type { CaptureState } from "../shared/captures";
import { storageGet, storageSet } from "../shared/chrome";
import {
  composePlanNote,
  extractPlanMetadata,
  getIstDateKey,
  type PlanValue,
  type ReasonValue,
} from "./behavioral";
import SkeletonLine from "./SkeletonLine";

const CACHED_COMPLETED_TRADES_KEY = "cachedCompletedTrades";
const CACHED_JOURNAL_SETUPS_KEY = "cachedJournalSetups";

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

const MONEY_FORMATTER = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "--";
  }
  return MONEY_FORMATTER.format(value);
}

function formatPnl(value: number): string {
  return `${value < 0 ? "-₹" : "₹"}${formatMoney(Math.abs(value))}`;
}

function parseDateKey(value?: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function formatJournalDate(value: string): string {
  const dateKey = parseDateKey(value);
  const todayKey = getIstDateKey();
  const yesterday = new Date(`${todayKey}T00:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  if (dateKey === todayKey) return "Today";
  if (dateKey === yesterdayKey) return "Yesterday";

  const parsed = new Date(`${dateKey ?? value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : DATE_FORMATTER.format(parsed);
}

function getEmotionMeta(value?: string | null) {
  return EMOTIONS.find((emotion) => emotion.value === value);
}

function findEmotionForCompletedTrade(
  trade: CompletedTradeListItem,
  rawTrades: TradeListItem[]
): string | null {
  const entryKey = parseDateKey(trade.entry_date);
  const symbol = trade.stock_symbol.toUpperCase();
  const match = rawTrades.find(
    (raw) =>
      raw.stock_symbol.toUpperCase() === symbol &&
      raw.emotion_tag &&
      (!entryKey || parseDateKey(raw.trade_date) === entryKey)
  );
  return match?.emotion_tag ?? null;
}

function hoursSince(value: string): string {
  const created = new Date(value);
  if (Number.isNaN(created.getTime())) {
    return `Created ${formatJournalDate(value)}`;
  }
  const hours = Math.floor((Date.now() - created.getTime()) / 3_600_000);
  if (hours < 24) {
    return `Created ${Math.max(hours, 1)} hours ago`;
  }
  return `Created ${DATE_FORMATTER.format(created)}`;
}

function getRiskClass(score: number): string {
  if (score <= 3) return "risk-low";
  if (score <= 6) return "risk-moderate";
  return "risk-high";
}

function getRrMeta(setup: TradeSetupItem): { value: number; className: string } | null {
  const entry = setup.entry_price;
  const stop = setup.stop_loss_price;
  const target = setup.target_price;
  if (entry == null || stop == null || target == null || entry === stop) {
    return null;
  }
  const value = Math.abs(target - entry) / Math.abs(entry - stop);
  if (!Number.isFinite(value)) return null;
  return {
    value,
    className: value >= 2 ? "rr-good" : value >= 1 ? "rr-ok" : "rr-bad",
  };
}

function JournalSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, index) => (
        <article key={index} className="journal-trade-card">
          <div className="journal-trade-header">
            <SkeletonLine width="32%" height="15px" />
            <SkeletonLine width="28%" height="16px" />
          </div>
          <SkeletonLine width="86%" height="12px" />
          <SkeletonLine width="38%" height="11px" />
        </article>
      ))}
    </>
  );
}

export default function JournalTab({
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
  const [completedTrades, setCompletedTrades] = useState<CompletedTradeListItem[]>([]);
  const [rawTrades, setRawTrades] = useState<TradeListItem[]>([]);
  const [setups, setSetups] = useState<TradeSetupItem[]>([]);
  const [completedLoading, setCompletedLoading] = useState(false);
  const [completedError, setCompletedError] = useState<string | null>(null);

  const todaysTrades = captureState?.trades ?? [];

  useEffect(() => {
    let active = true;

    async function loadJournalData() {
      if (!isSignedIn) {
        if (active) {
          setCompletedTrades([]);
          setRawTrades([]);
          setSetups([]);
          setCompletedLoading(false);
          setCompletedError(null);
        }
        return;
      }

      const [cachedCompleted, cachedSetups] = await Promise.all([
        storageGet<CompletedTradeListItem[]>(CACHED_COMPLETED_TRADES_KEY).catch(() => null),
        storageGet<TradeSetupItem[]>(CACHED_JOURNAL_SETUPS_KEY).catch(() => null),
      ]);
      if (!active) return;
      if (cachedCompleted) setCompletedTrades(cachedCompleted);
      if (cachedSetups) setSetups(cachedSetups);
      setCompletedLoading(!cachedCompleted);

      try {
        const token = await getAuthToken();
        if (!token) throw new Error("Sign in to load your journal.");

        const [nextCompleted, nextRaw, nextSetups] = await Promise.all([
          fetchCompletedTrades(token, { limit: 10 }),
          fetchTrades(token, { limit: 20 }).catch(() => []),
          fetchSetups(token, { limit: 4 }).catch(() => []),
        ]);

        if (!active) return;
        setCompletedTrades(nextCompleted);
        setRawTrades(nextRaw);
        setSetups(nextSetups);
        setCompletedError(null);
        void storageSet(CACHED_COMPLETED_TRADES_KEY, nextCompleted).catch(() => undefined);
        void storageSet(CACHED_JOURNAL_SETUPS_KEY, nextSetups).catch(() => undefined);
      } catch (error) {
        if (active) {
          setCompletedError(error instanceof Error ? error.message : "Unable to load journal.");
        }
      } finally {
        if (active) {
          setCompletedLoading(false);
        }
      }
    }

    void loadJournalData();
    return () => {
      active = false;
    };
  }, [isSignedIn, captureState?.lastSyncAt]);

  const sessionSummary = useMemo(() => {
    if (!todaysTrades.length) return null;
    return `${todaysTrades.length} trade${todaysTrades.length === 1 ? "" : "s"}`;
  }, [todaysTrades]);

  const visibleSetups = setups.slice(0, 3);

  return (
    <section className="journal-root">
      <article className="session-summary">
        <div>
          <h3>{todaysTrades.length ? "Today's Session" : "No trades today"}</h3>
          <div className="session-stats">
            {sessionSummary ??
              "Open your broker's order page — trades are captured automatically."}
          </div>
        </div>
      </article>

      {captureState?.lastError ? <p className="error-copy">{captureState.lastError}</p> : null}

      {todaysTrades.map((trade) => (
        <CaptureCard
          key={trade.id}
          trade={trade}
          saving={savingTradeId === trade.id}
          onSave={onSave}
        />
      ))}

      <article className="placeholder-card journal-section">
        <h2>Completed Trades</h2>
        <div className="journal-list">
          {completedLoading ? <JournalSkeleton /> : null}
          {!completedLoading && completedTrades.length
            ? completedTrades.map((trade) => (
                <CompletedTradeCard
                  key={trade.id}
                  trade={trade}
                  emotionTag={findEmotionForCompletedTrade(trade, rawTrades)}
                />
              ))
            : null}
          {!completedLoading && !completedTrades.length ? (
            <p>{completedError ?? "No completed round-trips yet."}</p>
          ) : null}
        </div>
      </article>

      <article className="placeholder-card journal-section">
        <h2>Open Plans</h2>
        {visibleSetups.length ? (
          <div className="setup-list">
            {visibleSetups.map((setup) => (
              <SetupCard key={setup.id} setup={setup} />
            ))}
            {setups.length > 3 ? <button className="journal-view-all">View all plans →</button> : null}
          </div>
        ) : (
          <p>No pre-trade setups logged yet.</p>
        )}
      </article>
    </section>
  );
}

function CompletedTradeCard({
  trade,
  emotionTag,
}: {
  trade: CompletedTradeListItem;
  emotionTag: string | null;
}) {
  const isWin = trade.pnl >= 0;
  const emotion = getEmotionMeta(emotionTag);

  return (
    <article className={`journal-trade-card ${isWin ? "trade-win" : "trade-loss"}`}>
      <div className="journal-trade-header">
        <span className="journal-symbol">{trade.stock_symbol}</span>
        <span className={`journal-pnl ${isWin ? "positive" : "negative"}`}>
          {formatPnl(trade.pnl)}
        </span>
      </div>
      <div className="journal-trade-meta">
        <span>₹{formatMoney(trade.entry_price)}</span>
        <span className="arrow">→</span>
        <span>₹{formatMoney(trade.exit_price)}</span>
        <span>· {formatMoney(trade.quantity)} shares</span>
        <span>· {trade.holding_days}d hold</span>
        <span>· {formatJournalDate(trade.entry_date)}</span>
      </div>
      {emotion ? (
        <span className={`journal-emotion-pill emotion-${emotion.value}`}>
          {emotion.emoji} {emotion.label}
        </span>
      ) : null}
    </article>
  );
}

function SetupCard({ setup }: { setup: TradeSetupItem }) {
  const linked = Boolean(setup.linked_trade_id);
  const rr = getRrMeta(setup);
  const riskScore = setup.risk_score;
  const conviction = Math.max(0, Math.min(10, setup.conviction_score ?? 0));

  return (
    <article className="setup-card-v2">
      <div className="setup-header-v2">
        <span className="setup-symbol-v2">
          {linked ? "✓" : "⏳"} {setup.symbol ?? "SETUP"}
        </span>
        <span className={linked ? "setup-badge-linked" : "setup-badge-pending"}>
          {linked ? "Executed" : "Awaiting trade"}
        </span>
      </div>
      <div className="setup-plan-line">
        Entry ₹{formatMoney(setup.entry_price)} · SL ₹{formatMoney(setup.stop_loss_price)} ·
        Target ₹{formatMoney(setup.target_price)}
      </div>
      <div className="setup-plan-meta-row">
        {rr ? <span className={`setup-rr ${rr.className}`}>R:R 1:{rr.value.toFixed(1)}</span> : null}
        {riskScore != null ? (
          <span className={`risk-badge ${getRiskClass(riskScore)}`}>Risk {riskScore}/10</span>
        ) : null}
        {!linked ? <span className="setup-created">{hoursSince(setup.created_at)}</span> : null}
      </div>
      {setup.conviction_score != null ? (
        <div className="setup-conviction">
          <span>Conviction {setup.conviction_score}/10</span>
          <div className="conviction-bar">
            <div className="conviction-fill" style={{ width: `${conviction * 10}%` }} />
          </div>
        </div>
      ) : null}
      {setup.thesis ? <div className="setup-thesis">{setup.thesis.slice(0, 60)}</div> : null}
    </article>
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
            Qty {trade.quantity} at ₹{formatMoney(trade.price)} · {formatJournalDate(trade.trade_date)}
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
