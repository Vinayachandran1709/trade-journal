import { useEffect, useMemo, useState } from "react";

const inrFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const numFmt = (digits = 2) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits });

const fmtINR = (value: number) => `₹${inrFmt.format(value)}`;
const fmtNum = (value: number, digits = 2) => numFmt(digits).format(value);
const fmtPct = (value: number, digits = 2) => `${fmtNum(value, digits)}%`;

const RISK_PRESETS = ["0.5", "1", "2", "5"] as const;
const RR_PRESETS = [2, 3, 5] as const;
const DRAWDOWN_LEVELS = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90] as const;

type BrokerKey =
  | "zerodha"
  | "groww"
  | "angel_one"
  | "upstox"
  | "dhan"
  | "icici_direct"
  | "hdfc_securities";
type SegKey = "intraday" | "delivery" | "fno_futures" | "fno_options";
type BrokerSelection = BrokerKey | "";
type SegmentSelection = SegKey | "";

type MarginInstrument =
  | "Nifty Futures"
  | "Bank Nifty Futures"
  | "Stock Futures"
  | "Nifty Options"
  | "Bank Nifty Options"
  | "Stock Options";
type MarginType = "NRML" | "MIS";
type MarginOptionAction = "Buy" | "Sell";

type OptionType = "Call" | "Put";
type OptionAction = "Buy" | "Sell";

const BROKERS: Array<[BrokerKey, string]> = [
  ["zerodha", "Zerodha"],
  ["groww", "Groww"],
  ["angel_one", "Angel One"],
  ["upstox", "Upstox"],
  ["dhan", "Dhan"],
  ["icici_direct", "ICICI Direct"],
  ["hdfc_securities", "HDFC Securities"],
];

const SEGMENTS: Array<[SegKey, string]> = [
  ["intraday", "Intraday"],
  ["delivery", "Delivery"],
  ["fno_futures", "F&O Futures"],
  ["fno_options", "F&O Options"],
];

const MARGIN_INSTRUMENTS: MarginInstrument[] = [
  "Nifty Futures",
  "Bank Nifty Futures",
  "Stock Futures",
  "Nifty Options",
  "Bank Nifty Options",
  "Stock Options",
];

const LOT_SIZE_DEFAULTS: Record<MarginInstrument, number> = {
  "Nifty Futures": 25,
  "Bank Nifty Futures": 15,
  "Stock Futures": 100,
  "Nifty Options": 25,
  "Bank Nifty Options": 15,
  "Stock Options": 100,
};

function n(value: string): number {
  return Number.parseFloat(value) || 0;
}

function valid(...values: string[]): boolean {
  return values.every((value) => value !== "" && Number.isFinite(Number.parseFloat(value)) && n(value) >= 0);
}

function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}

function preventInvalidNumberInput(event: React.KeyboardEvent<HTMLInputElement>) {
  if (["e", "E", "+", "-"].includes(event.key)) {
    event.preventDefault();
  }
}

function CalcSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="calc-section">
      <h3 className="calc-title">{title}</h3>
      {children}
    </div>
  );
}

function AccordionCalc({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="calc-section calc-accordion">
      <button
        type="button"
        className="calc-accordion-header"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span>{title}</span>
        <span className="calc-accordion-chevron" aria-hidden="true">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open ? <div className="calc-accordion-body">{children}</div> : null}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  color,
  large,
}: {
  label: string;
  value: string;
  bold?: boolean;
  color?: string;
  large?: boolean;
}) {
  return (
    <div className={`calc-result-row${large ? " calc-result-row-large" : ""}`}>
      <span className="calc-result-label">{label}</span>
      <span
        className={`calc-result-value${large ? " calc-result-value-large" : ""}`}
        style={{ fontWeight: bold ? 700 : 500, color: color ?? "#0f172a" }}
      >
        {value}
      </span>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: string;
}) {
  return (
    <label className="calc-field">
      <span className="calc-field-label">{label}</span>
      <input
        className="calc-input"
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step ?? "any"}
        value={value}
        placeholder={placeholder ?? "0"}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={preventInvalidNumberInput}
      />
    </label>
  );
}

function QuickButtons({
  options,
  activeValue,
  onClick,
  formatter,
}: {
  options: readonly (string | number)[];
  activeValue?: string | number | null;
  onClick: (value: string) => void;
  formatter?: (value: string | number) => string;
}) {
  return (
    <div className="calc-quick-row">
      {options.map((option) => {
        const raw = String(option);
        const active = activeValue != null && String(activeValue) === raw;
        return (
          <button
            key={raw}
            type="button"
            className={`calc-quick-button${active ? " active" : ""}`}
            onClick={() => onClick(raw)}
          >
            {formatter ? formatter(option) : raw}
          </button>
        );
      })}
    </div>
  );
}

function TradeQuality({ riskPct, rrRatio }: { riskPct: number; rrRatio: number | null }) {
  if (rrRatio == null || !Number.isFinite(rrRatio)) {
    return null;
  }

  let className = "calc-quality-badge moderate";
  let text = "⚠️ Moderate exposure";

  if (riskPct > 5 || rrRatio < 1) {
    className = "calc-quality-badge high";
    text = "🔴 Oversized — consider reducing";
  } else if (riskPct < 2 && rrRatio >= 2) {
    className = "calc-quality-badge good";
    text = "✅ Well-sized setup";
  }

  return (
    <>
      <div className="calc-note-copy">Trade quality is basic math, not advice.</div>
      <div className={className}>{text}</div>
    </>
  );
}

function RRBar({ riskAmount, rewardAmount }: { riskAmount: number; rewardAmount: number }) {
  const safeRisk = Math.max(riskAmount, 0);
  const safeReward = Math.max(rewardAmount, 0);
  const total = safeRisk + safeReward || 1;
  const riskWidth = (safeRisk / total) * 100;
  const rewardWidth = (safeReward / total) * 100;

  return (
    <div className="calc-rr-block">
      <div className="calc-rr-labels">
        <span className="calc-rr-risk-label">Risk ₹{fmtNum(safeRisk)}</span>
        <span className="calc-rr-reward-label">Reward ₹{fmtNum(safeReward)}</span>
      </div>
      <div className="calc-rr-bar-wrap">
        <div className="calc-rr-bar-risk" style={{ width: `${riskWidth}%` }} />
        <div className="calc-rr-bar-reward" style={{ width: `${rewardWidth}%` }} />
      </div>
    </div>
  );
}

function calcBrokerage(broker: BrokerKey, seg: SegKey, buyValue: number, sellValue: number): number {
  const turnoverValue = buyValue + sellValue;

  switch (broker) {
    case "zerodha":
      if (seg === "delivery") return 0;
      if (seg === "intraday") return Math.min(20, buyValue * 0.0003) + Math.min(20, sellValue * 0.0003);
      return 40;
    case "groww":
    case "angel_one":
      if (seg === "delivery") return 0;
      return 40;
    case "upstox":
      if (seg === "delivery") return 0;
      if (seg === "intraday") return Math.min(20, buyValue * 0.0005) + Math.min(20, sellValue * 0.0005);
      return 40;
    case "dhan":
      if (seg === "delivery") return 0;
      if (seg === "intraday") return Math.min(20, buyValue * 0.0003) + Math.min(20, sellValue * 0.0003);
      return 40;
    case "icici_direct":
      if (seg === "intraday") return Math.min(20, buyValue * 0.00275) + Math.min(20, sellValue * 0.00275);
      if (seg === "delivery") return turnoverValue * 0.0055;
      return 40;
    case "hdfc_securities":
      if (seg === "intraday") return Math.min(20, buyValue * 0.0005) + Math.min(20, sellValue * 0.0005);
      if (seg === "delivery") return turnoverValue * 0.005;
      return 40;
    default:
      return 0;
  }
}

interface BrokerageResult {
  brokerage: number;
  stt: number;
  exchange: number;
  sebi: number;
  gst: number;
  stamp: number;
  total: number;
  grossPnl: number;
  netPnl: number;
  breakeven: number;
}

function computeCharges(
  broker: BrokerKey,
  segment: SegKey,
  buyPrice: number,
  sellPrice: number,
  quantity: number
): BrokerageResult {
  const buyValue = buyPrice * quantity;
  const sellValue = sellPrice * quantity;
  const turnoverValue = buyValue + sellValue;
  const brokerage = calcBrokerage(broker, segment, buyValue, sellValue);

  let stt = 0;
  if (segment === "intraday") stt = sellValue * 0.00025;
  else if (segment === "delivery") stt = turnoverValue * 0.001;
  else if (segment === "fno_futures") stt = sellValue * 0.000125;
  else if (segment === "fno_options") stt = sellValue * 0.000625;

  let exchange = 0;
  if (segment === "intraday" || segment === "delivery") exchange = turnoverValue * 0.0000297;
  else if (segment === "fno_futures") exchange = turnoverValue * 0.0000173;
  else if (segment === "fno_options") exchange = turnoverValue * 0.000495;

  const sebi = turnoverValue * 0.000001;
  const gst = (brokerage + exchange) * 0.18;
  const stamp = buyValue * 0.00003;
  const total = brokerage + stt + exchange + sebi + gst + stamp;
  const grossPnl = (sellPrice - buyPrice) * quantity;
  const netPnl = grossPnl - total;
  const breakeven = buyPrice + total / quantity;

  return { brokerage, stt, exchange, sebi, gst, stamp, total, grossPnl, netPnl, breakeven };
}

function estimateBreakEvenPrice(
  entryPrice: number,
  quantity: number,
  broker: BrokerSelection,
  segment: SegmentSelection
): number {
  if (entryPrice <= 0 || quantity <= 0) {
    return entryPrice;
  }

  if (broker && segment) {
    return computeCharges(broker, segment, entryPrice, entryPrice, quantity).breakeven;
  }

  return entryPrice * 1.001;
}

function PositionSizeCalc({
  rrRatio,
  capital,
  onCapitalChange,
  broker,
  segment,
}: {
  rrRatio: number | null;
  capital: string;
  onCapitalChange: (value: string) => void;
  broker: BrokerSelection;
  segment: SegmentSelection;
}) {
  const [riskPct, setRiskPct] = useState("2");
  const [entry, setEntry] = useState("");
  const [stopLoss, setStopLoss] = useState("");

  const hasInputs = capital !== "" && riskPct !== "" && entry !== "" && stopLoss !== "";
  const capitalValue = n(capital);
  const riskPctValue = n(riskPct);
  const entryValue = n(entry);
  const stopLossValue = n(stopLoss);
  const stopDistance = Math.abs(entryValue - stopLossValue);

  let result: React.ReactNode = null;

  if (hasInputs) {
    if (!valid(capital, riskPct, entry, stopLoss) || capitalValue <= 0) {
      result = <p className="calc-error">Enter valid positive values.</p>;
    } else if (stopDistance === 0) {
      result = <p className="calc-error">Stop loss must differ from entry.</p>;
    } else {
      const riskAmount = capitalValue * (riskPctValue / 100);
      const maxShares = Math.floor(riskAmount / stopDistance);
      const positionValue = maxShares * entryValue;
      const maxLoss = maxShares * stopDistance;
      const breakEven = estimateBreakEvenPrice(entryValue, Math.max(maxShares, 1), broker, segment);
      const deployedPct = safeDivide(positionValue, capitalValue);

      result = (
        <div className="calc-results">
          <Row label="Risk Amount" value={fmtINR(riskAmount)} />
          <Row label="SL Distance" value={`₹${fmtNum(stopDistance)}`} />
          <Row label="Max Shares" value={fmtNum(maxShares, 0)} bold />
          <Row label="Position Value" value={fmtINR(positionValue)} bold />
          <Row label="Max Loss" value={fmtINR(maxLoss)} color="#dc2626" />
          <Row label="Break-even Price" value={`₹${fmtNum(breakEven)}`} />
          <Row
            label="% of Capital Deployed"
            value={deployedPct == null ? "—" : fmtPct(deployedPct * 100)}
          />
          <TradeQuality riskPct={riskPctValue} rrRatio={rrRatio} />
        </div>
      );
    }
  }

  return (
    <CalcSection title="Position Size">
      <Field
        label="Total Capital (₹)"
        value={capital}
        onChange={onCapitalChange}
        placeholder="e.g. 500000"
        min={0}
      />
      <Field
        label="Risk per Trade (%)"
        value={riskPct}
        onChange={setRiskPct}
        placeholder="2"
        min={0}
      />
      <QuickButtons
        options={RISK_PRESETS}
        activeValue={riskPct}
        onClick={setRiskPct}
        formatter={(value) => `${value}%`}
      />
      <Field label="Entry Price (₹)" value={entry} onChange={setEntry} min={0} />
      <Field label="Stop Loss Price (₹)" value={stopLoss} onChange={setStopLoss} min={0} />
      {result}
    </CalcSection>
  );
}

function RRCalc({ onPrimaryRatioChange }: { onPrimaryRatioChange: (value: number | null) => void }) {
  const [entry, setEntry] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [target1, setTarget1] = useState("");
  const [target2, setTarget2] = useState("");
  const [bookPct1, setBookPct1] = useState("50");
  const [bookPct2, setBookPct2] = useState("50");

  const entryValue = n(entry);
  const stopLossValue = n(stopLoss);
  const target1Value = n(target1);
  const target2Value = n(target2);
  const bookPct1Value = n(bookPct1);
  const bookPct2Value = n(bookPct2);
  const hasBase = entry !== "" && stopLoss !== "" && target1 !== "";

  useEffect(() => {
    const riskPerShare = Math.abs(entryValue - stopLossValue);
    if (!hasBase || riskPerShare === 0 || target1Value <= 0) {
      onPrimaryRatioChange(null);
      return;
    }

    onPrimaryRatioChange(Math.abs(target1Value - entryValue) / riskPerShare);
  }, [entryValue, stopLossValue, target1Value, hasBase, onPrimaryRatioChange]);

  function applyPreset(rawRatio: string) {
    const presetRatio = Number(rawRatio);
    const riskPerShare = Math.abs(entryValue - stopLossValue);

    if (riskPerShare <= 0 || !Number.isFinite(presetRatio)) {
      return;
    }

    const isLong = entryValue >= stopLossValue;
    const targetValue = isLong
      ? entryValue + riskPerShare * presetRatio
      : entryValue - riskPerShare * presetRatio;
    setTarget1(String(Number(targetValue.toFixed(2))));
  }

  let result: React.ReactNode = null;

  if (hasBase) {
    const riskPerShare = Math.abs(entryValue - stopLossValue);
    if (riskPerShare === 0) {
      result = <p className="calc-error">Stop loss must differ from entry.</p>;
    } else if (target1Value <= 0) {
      result = <p className="calc-error">Enter a valid target price.</p>;
    } else {
      const reward1 = Math.abs(target1Value - entryValue);
      const rr1 = reward1 / riskPerShare;
      const reward2 = target2 !== "" && target2Value > 0 ? Math.abs(target2Value - entryValue) : null;
      const rr2 = reward2 == null ? null : reward2 / riskPerShare;
      const effectiveRr = rr2 == null ? null : (bookPct1Value * rr1 + bookPct2Value * rr2) / 100;
      const requiredWinRate = safeDivide(1, 1 + rr1);
      const bookingTotal = bookPct1Value + bookPct2Value;

      result = (
        <div className="calc-results">
          <Row label="Risk" value={`₹${fmtNum(riskPerShare)}`} color="#dc2626" />
          <Row label="Reward T1" value={`₹${fmtNum(reward1)}`} color="#16a34a" />
          <Row label="R:R Ratio T1" value={`1 : ${fmtNum(rr1)}`} bold />
          <RRBar riskAmount={riskPerShare} rewardAmount={reward1} />
          <Row
            label="Required Win Rate"
            value={requiredWinRate == null ? "—" : fmtPct(requiredWinRate * 100)}
          />
          <div className="calc-insight-copy">
            You need to win {requiredWinRate == null ? "—" : fmtPct(requiredWinRate * 100)} of
            trades with this R:R to be profitable.
          </div>

          {rr2 != null ? (
            <>
              <div className="calc-divider" />
              <Row label="Reward T2" value={`₹${fmtNum(reward2 ?? 0)}`} color="#16a34a" />
              <Row label="R:R Ratio T2" value={`1 : ${fmtNum(rr2)}`} bold />
            </>
          ) : null}

          <div className="calc-divider" />
          <div className="calc-row-2">
            <Field
              label="Book % at T1"
              value={bookPct1}
              onChange={setBookPct1}
              placeholder="50"
              min={0}
              max={100}
            />
            <Field
              label="Book % at T2"
              value={bookPct2}
              onChange={setBookPct2}
              placeholder="50"
              min={0}
              max={100}
            />
          </div>
          {bookingTotal !== 100 ? (
            <div className="calc-note-copy">Partial booking percentages work best when they total 100%.</div>
          ) : null}
          <Row
            label="Effective R:R after Partial Booking"
            value={effectiveRr == null ? "—" : `1 : ${fmtNum(effectiveRr)}`}
            bold
          />
        </div>
      );
    }
  }

  return (
    <CalcSection title="Risk : Reward">
      <Field label="Entry Price (₹)" value={entry} onChange={setEntry} min={0} />
      <Field label="Stop Loss Price (₹)" value={stopLoss} onChange={setStopLoss} min={0} />
      <QuickButtons
        options={RR_PRESETS}
        onClick={applyPreset}
        formatter={(value) => `1:${value}`}
      />
      <Field label="Target 1 (₹)" value={target1} onChange={setTarget1} min={0} />
      <Field
        label="Target 2 (₹) — optional"
        value={target2}
        onChange={setTarget2}
        placeholder="optional"
        min={0}
      />
      {result}
    </CalcSection>
  );
}

function BrokerageCalc({
  broker,
  segment,
  onBrokerChange,
  onSegmentChange,
}: {
  broker: BrokerSelection;
  segment: SegmentSelection;
  onBrokerChange: (value: BrokerSelection) => void;
  onSegmentChange: (value: SegmentSelection) => void;
}) {
  const [buyPrice, setBuyPrice] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [quantity, setQuantity] = useState("");

  const hasSelections = broker !== "" && segment !== "";
  const canCalculate =
    hasSelections &&
    valid(buyPrice, sellPrice, quantity) &&
    buyPrice !== "" &&
    sellPrice !== "" &&
    quantity !== "" &&
    n(buyPrice) > 0 &&
    n(sellPrice) > 0 &&
    n(quantity) > 0;

  let result: React.ReactNode = null;

  if (canCalculate) {
    const charges = computeCharges(broker, segment, n(buyPrice), n(sellPrice), n(quantity));
    const netColor = charges.netPnl >= 0 ? "#16a34a" : "#dc2626";
    const chargesPctOfProfit = charges.grossPnl > 0 ? safeDivide(charges.total, charges.grossPnl) : null;

    result = (
      <div className="calc-results">
        <div className="calc-highlight-card">
          <div className="calc-highlight-label">Net P&amp;L after Charges</div>
          <div className="calc-highlight-value" style={{ color: netColor }}>
            {fmtINR(charges.netPnl)}
          </div>
        </div>
        <Row label="Brokerage" value={fmtINR(charges.brokerage)} />
        <Row label="STT" value={fmtINR(charges.stt)} />
        <Row label="Exch. Charges" value={fmtINR(charges.exchange)} />
        <Row label="SEBI Charges" value={fmtINR(charges.sebi)} />
        <Row label="GST (18%)" value={fmtINR(charges.gst)} />
        <Row label="Stamp Duty" value={fmtINR(charges.stamp)} />
        <div className="calc-divider" />
        <Row label="Total Charges" value={fmtINR(charges.total)} bold color="#dc2626" />
        <Row label="Gross P&amp;L" value={fmtINR(charges.grossPnl)} />
        <Row label="Breakeven" value={`₹${fmtNum(charges.breakeven)}`} />
        <Row
          label="Charges as % of Profit"
          value={chargesPctOfProfit == null ? "—" : fmtPct(chargesPctOfProfit * 100)}
        />
      </div>
    );
  }

  return (
    <CalcSection title="Brokerage">
      <div className="calc-row-2">
        <label className="calc-field">
          <span className="calc-field-label">Broker</span>
          <div className="calc-select-wrap">
            <select
              className="calc-input calc-select"
              value={broker}
              onChange={(event) => onBrokerChange(event.target.value as BrokerSelection)}
            >
              <option value="">Select...</option>
              {BROKERS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span className="calc-select-chevron" aria-hidden="true">
              ▼
            </span>
          </div>
        </label>
        <label className="calc-field">
          <span className="calc-field-label">Segment</span>
          <div className="calc-select-wrap">
            <select
              className="calc-input calc-select"
              value={segment}
              onChange={(event) => onSegmentChange(event.target.value as SegmentSelection)}
            >
              <option value="">Select...</option>
              {SEGMENTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span className="calc-select-chevron" aria-hidden="true">
              ▼
            </span>
          </div>
        </label>
      </div>
      <div className="calc-row-3">
        <Field label="Buy Price (₹)" value={buyPrice} onChange={setBuyPrice} min={0} />
        <Field label="Sell Price (₹)" value={sellPrice} onChange={setSellPrice} min={0} />
        <Field label="Quantity" value={quantity} onChange={setQuantity} placeholder="1" min={0} />
      </div>
      {!hasSelections ? <div className="calc-note-copy">Select both broker and segment to see charges.</div> : null}
      {result}
    </CalcSection>
  );
}

function CompoundingCalculator() {
  const [capital, setCapital] = useState("");
  const [monthlyReturn, setMonthlyReturn] = useState("2");
  const [duration, setDuration] = useState("");
  const [durationUnit, setDurationUnit] = useState<"months" | "years">("months");
  const [monthlyAddition, setMonthlyAddition] = useState("0");

  const capitalValue = n(capital);
  const monthlyRate = n(monthlyReturn) / 100;
  const months = durationUnit === "years" ? n(duration) * 12 : n(duration);
  const monthlyAdditionValue = n(monthlyAddition);

  let result: React.ReactNode = null;

  if (capital !== "" && duration !== "" && capitalValue >= 0 && months > 0) {
    const finalValue =
      capitalValue * Math.pow(1 + monthlyRate, months) +
      (monthlyRate === 0
        ? monthlyAdditionValue * months
        : monthlyAdditionValue * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate));
    const totalInvested = capitalValue + monthlyAdditionValue * months;
    const totalProfit = finalValue - totalInvested;
    const growthMultiple = totalInvested > 0 ? finalValue / totalInvested : null;

    const rows = Array.from({ length: Math.min(10, Math.max(1, Math.ceil(months / 12))) }, (_, index) => {
      const yearMonths = Math.min(months, (index + 1) * 12);
      const projectedValue =
        capitalValue * Math.pow(1 + monthlyRate, yearMonths) +
        (monthlyRate === 0
          ? monthlyAdditionValue * yearMonths
          : monthlyAdditionValue * ((Math.pow(1 + monthlyRate, yearMonths) - 1) / monthlyRate));

      return {
        label: `Year ${index + 1}`,
        value: projectedValue,
      };
    });

    result = (
      <div className="calc-results">
        <Row label="Final Value" value={fmtINR(finalValue)} bold />
        <Row label="Total Profit" value={fmtINR(totalProfit)} color={totalProfit >= 0 ? "#16a34a" : "#dc2626"} />
        <Row label="Total Invested" value={fmtINR(totalInvested)} />
        <Row label="Growth Multiple" value={growthMultiple == null ? "—" : `${fmtNum(growthMultiple)}x`} />
        <div className="calc-divider" />
        <div className="calc-table-title">Projection</div>
        <div className="calc-projection-list">
          {rows.map((row) => (
            <div key={row.label} className="calc-projection-row">
              <span>{row.label}</span>
              <strong>{fmtINR(row.value)}</strong>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <Field label="Starting Capital (₹)" value={capital} onChange={setCapital} min={0} />
      <Field label="Monthly Return (%)" value={monthlyReturn} onChange={setMonthlyReturn} min={0} />
      <div className="calc-row-2">
        <Field label="Duration" value={duration} onChange={setDuration} min={0} />
        <label className="calc-field">
          <span className="calc-field-label">Unit</span>
          <div className="calc-select-wrap">
            <select
              className="calc-input calc-select"
              value={durationUnit}
              onChange={(event) => setDurationUnit(event.target.value as "months" | "years")}
            >
              <option value="months">Months</option>
              <option value="years">Years</option>
            </select>
            <span className="calc-select-chevron" aria-hidden="true">
              ▼
            </span>
          </div>
        </label>
      </div>
      <Field label="Monthly Addition (₹)" value={monthlyAddition} onChange={setMonthlyAddition} min={0} />
      {result}
    </>
  );
}

function MarginCalculator({ referenceCapital }: { referenceCapital: string }) {
  const [instrument, setInstrument] = useState<MarginInstrument>("Nifty Futures");
  const [optionAction, setOptionAction] = useState<MarginOptionAction>("Buy");
  const [lotSize, setLotSize] = useState(String(LOT_SIZE_DEFAULTS["Nifty Futures"]));
  const [lots, setLots] = useState("1");
  const [price, setPrice] = useState("");
  const [marginType, setMarginType] = useState<MarginType>("NRML");

  useEffect(() => {
    setLotSize(String(LOT_SIZE_DEFAULTS[instrument]));
  }, [instrument]);

  const lotSizeValue = n(lotSize);
  const lotsValue = n(lots);
  const priceValue = n(price);
  const capitalValue = n(referenceCapital);
  const isOption = instrument.includes("Options");

  let result: React.ReactNode = null;

  if (price !== "" && lotSizeValue > 0 && lotsValue > 0 && priceValue > 0) {
    const contractValue = lotSizeValue * lotsValue * priceValue;
    let marginRequired = 0;

    if (instrument.includes("Futures")) {
      const nrmlRate = instrument === "Stock Futures" ? 0.2 : 0.15;
      marginRequired = contractValue * nrmlRate;
      if (marginType === "MIS") {
        marginRequired *= 0.4;
      }
    } else if (optionAction === "Buy") {
      marginRequired = contractValue;
    } else {
      marginRequired = contractValue * 0.15;
      if (marginType === "MIS") {
        marginRequired *= 0.4;
      }
    }

    const marginPct = capitalValue > 0 ? safeDivide(marginRequired, capitalValue) : null;
    const leverage = safeDivide(contractValue, marginRequired);

    result = (
      <div className="calc-results">
        <Row label="Total Contract Value" value={fmtINR(contractValue)} bold />
        <Row label="Approximate Margin Required" value={fmtINR(marginRequired)} />
        <Row
          label="Margin as % of Capital"
          value={marginPct == null ? "—" : fmtPct(marginPct * 100)}
        />
        <Row label="Exposure (Leverage)" value={leverage == null ? "—" : `${fmtNum(leverage)}x leverage`} />
        <div className="calc-note-copy">
          Approximate margins. Actual margins vary by broker and market conditions.
        </div>
      </div>
    );
  }

  return (
    <>
      <label className="calc-field">
        <span className="calc-field-label">Instrument</span>
        <div className="calc-select-wrap">
          <select
            className="calc-input calc-select"
            value={instrument}
            onChange={(event) => setInstrument(event.target.value as MarginInstrument)}
          >
            {MARGIN_INSTRUMENTS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <span className="calc-select-chevron" aria-hidden="true">
            ▼
          </span>
        </div>
      </label>
      {isOption ? (
        <label className="calc-field">
          <span className="calc-field-label">Option Position</span>
          <div className="calc-select-wrap">
            <select
              className="calc-input calc-select"
              value={optionAction}
              onChange={(event) => setOptionAction(event.target.value as MarginOptionAction)}
            >
              <option value="Buy">Buy</option>
              <option value="Sell">Sell</option>
            </select>
            <span className="calc-select-chevron" aria-hidden="true">
              ▼
            </span>
          </div>
        </label>
      ) : null}
      <div className="calc-row-2">
        <Field label="Lot Size" value={lotSize} onChange={setLotSize} min={0} />
        <Field label="Number of Lots" value={lots} onChange={setLots} min={0} />
      </div>
      <Field
        label={isOption && optionAction === "Buy" ? "Premium / Price (₹)" : "Price (₹)"}
        value={price}
        onChange={setPrice}
        min={0}
      />
      <label className="calc-field">
        <span className="calc-field-label">Margin Type</span>
        <div className="calc-select-wrap">
          <select
            className="calc-input calc-select"
            value={marginType}
            onChange={(event) => setMarginType(event.target.value as MarginType)}
          >
            <option value="NRML">NRML (Carry Forward)</option>
            <option value="MIS">MIS (Intraday)</option>
          </select>
          <span className="calc-select-chevron" aria-hidden="true">
            ▼
          </span>
        </div>
      </label>
      {result}
    </>
  );
}

function OptionsPnlCalculator() {
  const [optionType, setOptionType] = useState<OptionType>("Call");
  const [action, setAction] = useState<OptionAction>("Buy");
  const [strike, setStrike] = useState("");
  const [premium, setPremium] = useState("");
  const [lotSize, setLotSize] = useState("25");
  const [lots, setLots] = useState("1");
  const [underlyingAtExpiry, setUnderlyingAtExpiry] = useState("");

  let result: React.ReactNode = null;

  if (
    valid(strike, premium, lotSize, lots, underlyingAtExpiry) &&
    strike !== "" &&
    premium !== "" &&
    lotSize !== "" &&
    lots !== "" &&
    underlyingAtExpiry !== ""
  ) {
    const strikeValue = n(strike);
    const premiumValue = n(premium);
    const lotSizeValue = n(lotSize);
    const lotsValue = n(lots);
    const underlyingValue = n(underlyingAtExpiry);
    const intrinsicValue =
      optionType === "Call"
        ? Math.max(0, underlyingValue - strikeValue)
        : Math.max(0, strikeValue - underlyingValue);
    const pnlPerLot =
      action === "Buy"
        ? (intrinsicValue - premiumValue) * lotSizeValue
        : (premiumValue - intrinsicValue) * lotSizeValue;
    const totalPnl = pnlPerLot * lotsValue;
    const breakeven = optionType === "Call" ? strikeValue + premiumValue : strikeValue - premiumValue;
    const investment = premiumValue * lotSizeValue * lotsValue;
    const roi = safeDivide(totalPnl, investment);

    const maxLossText =
      action === "Buy"
        ? fmtINR(investment)
        : optionType === "Call"
          ? "Unlimited (calls)"
          : `${fmtINR(strikeValue * lotSizeValue * lotsValue)} approx. (puts)`;
    const maxProfitText =
      action === "Buy"
        ? optionType === "Call"
          ? "Unlimited (calls)"
          : `${fmtINR(Math.max(0, (strikeValue - premiumValue) * lotSizeValue * lotsValue))} approx. (puts)`
        : fmtINR(investment);

    result = (
      <div className="calc-results">
        <Row label="Intrinsic Value at Expiry" value={`₹${fmtNum(intrinsicValue)}`} />
        <Row label="P&amp;L per Lot" value={fmtINR(pnlPerLot)} color={pnlPerLot >= 0 ? "#16a34a" : "#dc2626"} />
        <Row
          label="Total P&amp;L"
          value={fmtINR(totalPnl)}
          bold
          large
          color={totalPnl >= 0 ? "#16a34a" : "#dc2626"}
        />
        <Row label="Breakeven" value={`₹${fmtNum(breakeven)}`} />
        <Row label="Max Loss" value={maxLossText} color={action === "Sell" ? "#dc2626" : undefined} />
        <Row label="Max Profit" value={maxProfitText} />
        <Row label="ROI" value={roi == null ? "—" : fmtPct(roi * 100)} />
        {action === "Sell" ? (
          <div className="calc-warning-copy">⚠️ Option selling carries unlimited risk</div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="calc-row-2">
        <label className="calc-field">
          <span className="calc-field-label">Type</span>
          <div className="calc-select-wrap">
            <select
              className="calc-input calc-select"
              value={optionType}
              onChange={(event) => setOptionType(event.target.value as OptionType)}
            >
              <option value="Call">Call</option>
              <option value="Put">Put</option>
            </select>
            <span className="calc-select-chevron" aria-hidden="true">
              ▼
            </span>
          </div>
        </label>
        <label className="calc-field">
          <span className="calc-field-label">Action</span>
          <div className="calc-select-wrap">
            <select
              className="calc-input calc-select"
              value={action}
              onChange={(event) => setAction(event.target.value as OptionAction)}
            >
              <option value="Buy">Buy</option>
              <option value="Sell">Sell</option>
            </select>
            <span className="calc-select-chevron" aria-hidden="true">
              ▼
            </span>
          </div>
        </label>
      </div>
      <Field label="Strike Price (₹)" value={strike} onChange={setStrike} min={0} />
      <Field label="Premium Paid / Received (₹)" value={premium} onChange={setPremium} min={0} />
      <div className="calc-row-2">
        <Field label="Lot Size" value={lotSize} onChange={setLotSize} min={0} />
        <Field label="Number of Lots" value={lots} onChange={setLots} min={0} />
      </div>
      <Field
        label="Expected Underlying Price at Expiry (₹)"
        value={underlyingAtExpiry}
        onChange={setUnderlyingAtExpiry}
        min={0}
      />
      {result}
    </>
  );
}

function DrawdownRecoveryCalculator({ referenceCapital }: { referenceCapital: string }) {
  const [drawdown, setDrawdown] = useState("20");

  const drawdownValue = Math.min(90, Math.max(1, n(drawdown) || 20));
  const capitalValue = n(referenceCapital);
  const recoveryPct = (1 / (1 - drawdownValue / 100) - 1) * 100;
  const actualLoss = capitalValue > 0 ? capitalValue * (drawdownValue / 100) : null;
  const capitalAfterLoss = actualLoss == null ? null : capitalValue - actualLoss;
  const recoveryAmount = capitalAfterLoss == null ? null : capitalValue - capitalAfterLoss;

  const rows = useMemo(
    () =>
      DRAWDOWN_LEVELS.map((loss) => ({
        loss,
        recovery: (1 / (1 - loss / 100) - 1) * 100,
        selected: loss === Math.round(drawdownValue),
      })),
    [drawdownValue]
  );

  return (
    <>
      <label className="calc-field">
        <span className="calc-field-label">Drawdown %</span>
        <input
          className="calc-range"
          type="range"
          min="1"
          max="90"
          value={drawdownValue}
          onChange={(event) => setDrawdown(event.target.value)}
        />
      </label>
      <Field label="Drawdown % (Input)" value={String(drawdownValue)} onChange={setDrawdown} min={1} max={90} />
      <div className="calc-results">
        <Row label="Recovery % Needed" value={fmtPct(recoveryPct)} bold />
        {actualLoss != null && recoveryAmount != null ? (
          <div className="calc-insight-copy">
            You lost {fmtINR(actualLoss)}. You need to make {fmtINR(recoveryAmount)} just to get
            back to where you started.
          </div>
        ) : null}
        <div className="calc-divider" />
        <div className="calc-table-wrap">
          <div className="calc-table-header">
            <span>Loss</span>
            <span>Recovery Needed</span>
          </div>
          {rows.map((row) => (
            <div key={row.loss} className={`calc-table-row${row.selected ? " selected" : ""}`}>
              <span>{row.loss}%</span>
              <strong>{fmtPct(row.recovery)}</strong>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function WinRateExpectancyCalculator() {
  const [winRate, setWinRate] = useState("50");
  const [avgWin, setAvgWin] = useState("");
  const [avgLoss, setAvgLoss] = useState("");
  const [tradesPerMonth, setTradesPerMonth] = useState("20");

  const winRateValue = Math.min(100, Math.max(0, n(winRate)));
  const winRatio = winRateValue / 100;
  const avgWinValue = n(avgWin);
  const avgLossValue = n(avgLoss);
  const tradesValue = n(tradesPerMonth);

  let result: React.ReactNode = null;

  if (avgWin !== "" && avgLoss !== "" && tradesPerMonth !== "" && avgWinValue >= 0 && avgLossValue >= 0) {
    const expectancy = winRatio * avgWinValue - (1 - winRatio) * avgLossValue;
    const monthlyPnl = expectancy * tradesValue;
    const annualPnl = monthlyPnl * 12;
    const breakevenWinRate = safeDivide(avgLossValue, avgWinValue + avgLossValue);
    const rrRatio = safeDivide(avgWinValue, avgLossValue);

    let status = "⚠️ Breakeven — no edge";
    let statusClass = "calc-quality-badge moderate";
    if (expectancy > 0) {
      status = `✅ Positive expectancy — your edge is ${fmtINR(expectancy)} per trade`;
      statusClass = "calc-quality-badge good";
    } else if (expectancy < 0) {
      status = `🔴 Negative expectancy — you lose ${fmtINR(Math.abs(expectancy))} per trade on average`;
      statusClass = "calc-quality-badge high";
    }

    const insight =
      breakevenWinRate != null && rrRatio != null
        ? winRatio >= breakevenWinRate
          ? `With your current R:R of 1:${fmtNum(rrRatio)}, you only need ${fmtPct(breakevenWinRate * 100)} win rate to be profitable.`
          : `Your win rate of ${fmtPct(winRateValue)} is below the required ${fmtPct(breakevenWinRate * 100)} for this R:R — consider wider targets or tighter stops.`
        : "Add your average win and loss to see expectancy.";

    result = (
      <div className="calc-results">
        <Row
          label="Expectancy per Trade"
          value={fmtINR(expectancy)}
          bold
          color={expectancy >= 0 ? "#16a34a" : "#dc2626"}
        />
        <Row label="Expected Monthly P&amp;L" value={fmtINR(monthlyPnl)} color={monthlyPnl >= 0 ? "#16a34a" : "#dc2626"} />
        <Row label="Expected Annual P&amp;L" value={fmtINR(annualPnl)} color={annualPnl >= 0 ? "#16a34a" : "#dc2626"} />
        <Row
          label="Required Win Rate for Breakeven"
          value={breakevenWinRate == null ? "—" : fmtPct(breakevenWinRate * 100)}
        />
        <div className={statusClass}>{status}</div>
        <div className="calc-insight-copy">{insight}</div>
      </div>
    );
  }

  return (
    <>
      <label className="calc-field">
        <span className="calc-field-label">Win Rate (%)</span>
        <input
          className="calc-range"
          type="range"
          min="0"
          max="100"
          value={winRateValue}
          onChange={(event) => setWinRate(event.target.value)}
        />
      </label>
      <Field label="Win Rate (%)" value={String(winRateValue)} onChange={setWinRate} min={0} max={100} />
      <Field label="Average Win (₹)" value={avgWin} onChange={setAvgWin} min={0} />
      <Field label="Average Loss (₹)" value={avgLoss} onChange={setAvgLoss} min={0} />
      <Field label="Number of Trades per Month" value={tradesPerMonth} onChange={setTradesPerMonth} min={0} />
      {result}
    </>
  );
}

export default function CalculatorsTab() {
  const [primaryRrRatio, setPrimaryRrRatio] = useState<number | null>(null);
  const [capital, setCapital] = useState("");
  const [broker, setBroker] = useState<BrokerSelection>("");
  const [segment, setSegment] = useState<SegmentSelection>("");
  const [openAccordions, setOpenAccordions] = useState({
    compounding: false,
    margin: false,
    options: false,
    drawdown: false,
    expectancy: false,
  });

  function toggleAccordion(key: keyof typeof openAccordions) {
    setOpenAccordions((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <div className="calc-root">
      <PositionSizeCalc
        rrRatio={primaryRrRatio}
        capital={capital}
        onCapitalChange={setCapital}
        broker={broker}
        segment={segment}
      />
      <RRCalc onPrimaryRatioChange={setPrimaryRrRatio} />
      <BrokerageCalc
        broker={broker}
        segment={segment}
        onBrokerChange={setBroker}
        onSegmentChange={setSegment}
      />

      <AccordionCalc
        title="📈 Compounding Calculator"
        open={openAccordions.compounding}
        onToggle={() => toggleAccordion("compounding")}
      >
        <CompoundingCalculator />
      </AccordionCalc>

      <AccordionCalc
        title="📊 F&O Margin Calculator"
        open={openAccordions.margin}
        onToggle={() => toggleAccordion("margin")}
      >
        <MarginCalculator referenceCapital={capital} />
      </AccordionCalc>

      <AccordionCalc
        title="🎯 Options P&L Calculator"
        open={openAccordions.options}
        onToggle={() => toggleAccordion("options")}
      >
        <OptionsPnlCalculator />
      </AccordionCalc>

      <AccordionCalc
        title="📉 Drawdown Recovery Calculator"
        open={openAccordions.drawdown}
        onToggle={() => toggleAccordion("drawdown")}
      >
        <DrawdownRecoveryCalculator referenceCapital={capital} />
      </AccordionCalc>

      <AccordionCalc
        title="🏆 Win Rate & Expectancy"
        open={openAccordions.expectancy}
        onToggle={() => toggleAccordion("expectancy")}
      >
        <WinRateExpectancyCalculator />
      </AccordionCalc>
    </div>
  );
}
