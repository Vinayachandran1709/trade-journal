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

function getMatchingRawTrade(
  trade: CompletedTradeListItem,
  rawTrades: TradeListItem[]
): TradeListItem | null {
  const entryKey = parseDateKey(trade.entry_date);
  const symbol = trade.stock_symbol.toUpperCase();
  return (
    rawTrades.find(
      (raw) =>
        raw.stock_symbol.toUpperCase() === symbol &&
        (!entryKey || parseDateKey(raw.trade_date) === entryKey)
    ) ?? null
  );
}

function hasFollowUpNote(value?: string | null): boolean {
  const parsed = extractPlanMetadata(value ?? "");
  return Boolean(parsed.text.trim());
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

function formatSetupPriceLine(label: string, value?: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return `${label} not set`;
  }
  return `${label} ₹${formatMoney(value)}`;
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

function normalizeCompletedTrades(value: unknown): CompletedTradeListItem[] {
  return Array.isArray(value) ? (value as CompletedTradeListItem[]) : [];
}

function normalizeRawTrades(value: unknown): TradeListItem[] {
  return Array.isArray(value) ? (value as TradeListItem[]) : [];
}

function normalizeSetups(value: unknown): TradeSetupItem[] {
  return Array.isArray(value) ? (value as TradeSetupItem[]) : [];
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
  webAppUrl,
  initialCompletedTrades,
  initialRawTrades,
  initialSetups,
}: {
  captureState: CaptureState | null;
  savingTradeId: number | null;
  onSave: (tradeId: number, emotionTag: string, note: string) => Promise<void>;
  isSignedIn: boolean;
  webAppUrl: string;
  initialCompletedTrades?: CompletedTradeListItem[] | null;
  initialRawTrades?: TradeListItem[] | null;
  initialSetups?: TradeSetupItem[] | null;
}) {
  const [completedTrades, setCompletedTrades] = useState<CompletedTradeListItem[]>(() => normalizeCompletedTrades(initialCompletedTrades));
  const [rawTrades, setRawTrades] = useState<TradeListItem[]>(() => normalizeRawTrades(initialRawTrades));
  const [setups, setSetups] = useState<TradeSetupItem[]>(() => normalizeSetups(initialSetups));
  const [completedLoading, setCompletedLoading] = useState(false);
  const [completedError, setCompletedError] = useState<string | null>(null);

  const todaysTrades = Array.isArray(captureState?.trades) ? captureState.trades : [];

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
      const safeCompleted = normalizeCompletedTrades(cachedCompleted);
      const safeSetups = normalizeSetups(cachedSetups);
      setCompletedTrades((current) => (current.length ? current : safeCompleted));
      setSetups((current) => (current.length ? current : safeSetups));
      setCompletedLoading(safeCompleted.length === 0 && normalizeCompletedTrades(initialCompletedTrades).length === 0);

      try {
        const token = await getAuthToken();
        if (!token) throw new Error("Sign in to load your journal.");

        const [nextCompleted, nextRaw, nextSetups] = await Promise.all([
          fetchCompletedTrades(token, { limit: 10 }),
          fetchTrades(token, { limit: 20 }).catch(() => []),
          fetchSetups(token, { limit: 4 }).catch(() => []),
        ]);

        if (!active) return;
        setCompletedTrades(normalizeCompletedTrades(nextCompleted));
        setRawTrades(normalizeRawTrades(nextRaw));
        setSetups(normalizeSetups(nextSetups));
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

  const todayKey = getIstDateKey();
  const sessionSummary = useMemo(() => {
    const todaysRealizedTrades = completedTrades.filter(
      (trade) => parseDateKey(trade.exit_date) === todayKey
    );
    return {
      tradesCapturedToday: todaysTrades.length,
      completedTradesLoaded: completedTrades.length,
      openPlansCount: setups.filter((setup) => !setup.linked_trade_id).length,
      todaysRealizedPnl:
        todaysRealizedTrades.length > 0
          ? todaysRealizedTrades.reduce((sum, trade) => sum + trade.pnl, 0)
          : null,
      hasTodayActivity: todaysTrades.length > 0,
    };
  }, [completedTrades, setups, todayKey, todaysTrades]);

  const visibleSetups = setups.slice(0, 3);
  const needsEmotionTags = rawTrades.filter((trade) => !trade.emotion_tag).length;
  const needsFollowUpNotes = rawTrades.filter((trade) => !hasFollowUpNote(trade.notes)).length;
  const pendingSetupCount = setups.filter((setup) => !setup.linked_trade_id).length;

  function openDashboardPath(path: string) {
    void chrome.tabs.create({ url: `${webAppUrl}${path}` });
  }

  return (
    <section className="journal-root">
      <article className="session-summary">
        <div className="session-summary-grid">
          <div>
            <h3>{sessionSummary.hasTodayActivity ? "Today's Journal" : "Ready for today's trading journal"}</h3>
            <div className="session-stats">
              {sessionSummary.hasTodayActivity
                ? "What you did today, what is still open, and whether the plan held."
                : "Open your broker order page. Captured trades will appear here automatically after execution."}
            </div>
          </div>
          <div className="session-summary-metrics">
            <span>Captured today: <strong>{sessionSummary.tradesCapturedToday}</strong></span>
            <span>Completed loaded: <strong>{sessionSummary.completedTradesLoaded}</strong></span>
            <span>Open plans: <strong>{sessionSummary.openPlansCount}</strong></span>
            <span>
              Realized today:{" "}
              <strong>
                {sessionSummary.todaysRealizedPnl != null
                  ? formatPnl(sessionSummary.todaysRealizedPnl)
                  : "--"}
              </strong>
            </span>
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

      {(needsEmotionTags > 0 || needsFollowUpNotes > 0 || pendingSetupCount > 0) ? (
        <article className="placeholder-card journal-section">
          <h2>Needs journaling</h2>
          <div className="journal-list">
            {needsEmotionTags > 0 ? (
              <div className="journal-trade-card">
                <div className="journal-trade-header">
                  <span className="journal-symbol">Missing emotion tags</span>
                  <span className="journal-emotion-pill emotion-neutral">{needsEmotionTags} trades</span>
                </div>
                <div className="journal-trade-meta">
                  Recent trades still need an emotional tag before the lesson is usable.
                </div>
                <button
                  type="button"
                  className="journal-view-all"
                  onClick={() => openDashboardPath("/dashboard/trades?emotion=missing")}
                >
                  Fix tags on dashboard →
                </button>
              </div>
            ) : null}

            {needsFollowUpNotes > 0 ? (
              <div className="journal-trade-card">
                <div className="journal-trade-header">
                  <span className="journal-symbol">Missing follow-up notes</span>
                  <span className="journal-emotion-pill emotion-neutral">{needsFollowUpNotes} trades</span>
                </div>
                <div className="journal-trade-meta">
                  Add a short note so imported trades stay useful even without live capture context.
                </div>
                <button
                  type="button"
                  className="journal-view-all"
                  onClick={() => openDashboardPath("/dashboard/trades?review=notes-missing")}
                >
                  Review notes on dashboard →
                </button>
              </div>
            ) : null}

            {pendingSetupCount > 0 ? (
              <div className="journal-trade-card">
                <div className="journal-trade-header">
                  <span className="journal-symbol">Pending setup review</span>
                  <span className="journal-emotion-pill emotion-neutral">{pendingSetupCount} open</span>
                </div>
                <div className="journal-trade-meta">
                  Some setups are still waiting for trade capture or dashboard follow-through.
                </div>
                <button
                  type="button"
                  className="journal-view-all"
                  onClick={() => openDashboardPath("/dashboard#pre-trade-setups")}
                >
                  Review pending setups →
                </button>
              </div>
            ) : null}
          </div>
        </article>
      ) : null}

      <article className="placeholder-card journal-section">
        <h2>Completed Trades</h2>
        <div className="journal-list">
          {completedLoading ? <JournalSkeleton /> : null}
          {!completedLoading && completedTrades.length
              ? completedTrades.map((trade) => (
                <CompletedTradeCard
                  key={trade.id}
                  trade={trade}
                  rawTrade={getMatchingRawTrade(trade, rawTrades)}
                />
              ))
            : null}
          {!completedLoading && !completedTrades.length ? (
            <p>
              {completedError ??
                "No completed round-trips yet. Once a BUY and SELL are matched, your P&L will appear here."}
            </p>
          ) : null}
        </div>
      </article>

      <article className="placeholder-card journal-section">
        <h2>Open Plans</h2>
        {visibleSetups.length ? (
          <div className="setup-list">
            {visibleSetups.map((setup) => (
              <SetupCard
                key={setup.id}
                setup={setup}
                rawTrades={rawTrades}
                webAppUrl={webAppUrl}
              />
            ))}
            {setups.length > 3 ? <button className="journal-view-all" onClick={() => openDashboardPath("/dashboard#pre-trade-setups")}>View all plans →</button> : null}
          </div>
        ) : (
          <p>No pre-trade setups logged yet. Plans created from the checklist will appear here.</p>
        )}
      </article>
    </section>
  );
}

function CompletedTradeCard({
  trade,
  rawTrade,
}: {
  trade: CompletedTradeListItem;
  rawTrade: TradeListItem | null;
}) {
  const emotionTag = rawTrade?.emotion_tag ?? null;
  const isWin = trade.pnl >= 0;
  const emotion = getEmotionMeta(emotionTag);
  const hasNote = hasFollowUpNote(rawTrade?.notes);

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
      ) : (
        <span className="journal-emotion-pill emotion-neutral">Not tagged</span>
      )}
      {!hasNote ? <span className="setup-created">Follow-up note missing</span> : null}
    </article>
  );
}

function SetupCard({
  setup,
  rawTrades,
  webAppUrl,
}: {
  setup: TradeSetupItem;
  rawTrades: TradeListItem[];
  webAppUrl: string;
}) {
  const linked = Boolean(setup.linked_trade_id);
  const rr = getRrMeta(setup);
  const riskScore = setup.risk_score;
  const conviction = Math.max(0, Math.min(10, setup.conviction_score ?? 0));
  const linkedTrade =
    linked && setup.linked_trade_id
      ? rawTrades.find((trade) => trade.id === setup.linked_trade_id) ?? null
      : null;
  const hasPlannedValues =
    setup.entry_price != null || setup.stop_loss_price != null || setup.target_price != null;
  const planVsActual =
    linkedTrade && hasPlannedValues
      ? `Plan vs Actual: Executed at ₹${formatMoney(linkedTrade.price)} on ${formatJournalDate(
          linkedTrade.trade_date
        )}`
      : null;

  return (
    <article className="setup-card-v2">
      <div className="setup-header-v2">
        <span className="setup-symbol-v2">{(setup.symbol ?? "SETUP").toUpperCase()}</span>
        <span className={linked ? "setup-badge-linked" : "setup-badge-pending"}>
          {linked ? "Executed" : "Awaiting trade"}
        </span>
      </div>
      <div className="setup-plan-line">
        {formatSetupPriceLine("Entry", setup.entry_price)} · {formatSetupPriceLine("SL", setup.stop_loss_price)} ·{" "}
        {formatSetupPriceLine("Target", setup.target_price)}
      </div>
      <div className="setup-plan-meta-row">
        {rr ? <span className={`setup-rr ${rr.className}`}>R:R 1:{rr.value.toFixed(1)}</span> : null}
        {setup.conviction_score != null ? (
          <span className="setup-created">Conviction {setup.conviction_score}/10</span>
        ) : null}
        {riskScore != null ? (
          <span className={`risk-badge ${getRiskClass(riskScore)}`}>Risk {riskScore}/10</span>
        ) : null}
        <span className="setup-created">{hoursSince(setup.created_at)}</span>
      </div>
      {setup.conviction_score != null && !linked ? (
        <div className="setup-conviction">
          <span>Conviction {setup.conviction_score}/10</span>
          <div className="conviction-bar">
            <div className="conviction-fill" style={{ width: `${conviction * 10}%` }} />
          </div>
        </div>
      ) : null}
      {planVsActual ? <div className="setup-thesis">{planVsActual}</div> : null}
      {setup.thesis ? <div className="setup-thesis">{setup.thesis.slice(0, 60)}</div> : null}
      <button
        type="button"
        className="journal-view-all"
        onClick={() =>
          void chrome.tabs.create({
            url: `${webAppUrl}${linked ? "/dashboard#recent-trades" : "/dashboard#pre-trade-setups"}`,
          })
        }
      >
        {linked ? "Review on dashboard →" : "Review pending setups →"}
      </button>
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
