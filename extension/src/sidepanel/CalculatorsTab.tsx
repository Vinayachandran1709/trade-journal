import { useState } from "react";

const inrFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const fmtINR = (n: number) => `₹${inrFmt.format(n)}`;
const fmtNum = (n: number, d = 2) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: d }).format(n);

function n(s: string): number {
  return parseFloat(s) || 0;
}

function valid(...vals: string[]): boolean {
  return vals.every((v) => v !== "" && isFinite(parseFloat(v)) && parseFloat(v) > 0);
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

function Row({
  label,
  value,
  bold,
  color,
}: {
  label: string;
  value: string;
  bold?: boolean;
  color?: string;
}) {
  return (
    <div className="calc-result-row">
      <span className="calc-result-label">{label}</span>
      <span
        className="calc-result-value"
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="calc-field">
      <span className="calc-field-label">{label}</span>
      <input
        className="calc-input"
        type="number"
        step="any"
        value={value}
        placeholder={placeholder ?? "0"}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function PositionSizeCalc() {
  const [capital, setCapital] = useState("");
  const [riskPct, setRiskPct] = useState("2");
  const [entry, setEntry] = useState("");
  const [sl, setSl] = useState("");

  const hasInputs = capital !== "" && riskPct !== "" && entry !== "" && sl !== "";
  const entryN = n(entry);
  const slN = n(sl);
  const slDist = Math.abs(entryN - slN);

  let result: React.ReactNode = null;

  if (hasInputs) {
    if (!valid(capital, riskPct) || n(capital) <= 0) {
      result = <p className="calc-error">Enter valid positive values.</p>;
    } else if (slDist === 0) {
      result = <p className="calc-error">Stop loss must differ from entry.</p>;
    } else {
      const riskAmt = n(capital) * (n(riskPct) / 100);
      const maxShares = Math.floor(riskAmt / slDist);
      const posValue = maxShares * entryN;
      const maxLoss = maxShares * slDist;
      result = (
        <div className="calc-results">
          <Row label="Risk Amount" value={fmtINR(riskAmt)} />
          <Row label="SL Distance" value={`₹${fmtNum(slDist)}`} />
          <Row label="Max Shares" value={fmtNum(maxShares, 0)} bold />
          <Row label="Position Value" value={fmtINR(posValue)} bold />
          <Row label="Max Loss" value={fmtINR(maxLoss)} color="#dc2626" />
        </div>
      );
    }
  }

  return (
    <CalcSection title="Position Size">
      <Field
        label="Total Capital (₹)"
        value={capital}
        onChange={setCapital}
        placeholder="e.g. 500000"
      />
      <Field
        label="Risk per Trade (%)"
        value={riskPct}
        onChange={setRiskPct}
        placeholder="2"
      />
      <Field label="Entry Price (₹)" value={entry} onChange={setEntry} />
      <Field label="Stop Loss Price (₹)" value={sl} onChange={setSl} />
      {result}
    </CalcSection>
  );
}

function RRBar({ rr }: { rr: number }) {
  const capped = Math.min(rr, 10);
  const total = 1 + capped;
  const riskW = (1 / total) * 100;
  const rewardW = (capped / total) * 100;
  const rewardColor = rr >= 2 ? "#16a34a" : rr >= 1 ? "#f59e0b" : "#ef4444";
  return (
    <div className="calc-rr-bar-wrap">
      <div style={{ width: `${riskW}%`, background: "#dc2626", height: "100%" }} />
      <div
        style={{ width: `${rewardW}%`, background: rewardColor, height: "100%" }}
      />
    </div>
  );
}

function RRCalc() {
  const [entry, setEntry] = useState("");
  const [sl, setSl] = useState("");
  const [t1, setT1] = useState("");
  const [t2, setT2] = useState("");

  const hasBase = entry !== "" && sl !== "" && t1 !== "";
  const entryN = n(entry);
  const slN = n(sl);
  const t1N = n(t1);
  const t2N = t2 !== "" ? n(t2) : null;

  let result: React.ReactNode = null;

  if (hasBase) {
    const risk = Math.abs(entryN - slN);
    if (risk === 0) {
      result = <p className="calc-error">Stop loss must differ from entry.</p>;
    } else if (t1N <= 0) {
      result = <p className="calc-error">Enter valid target price.</p>;
    } else {
      const rewardT1 = Math.abs(t1N - entryN);
      const rrT1 = rewardT1 / risk;
      const winRateT1 = (1 / (1 + rrT1)) * 100;

      result = (
        <div className="calc-results">
          <Row label="Risk" value={`₹${fmtNum(risk)}`} color="#dc2626" />
          <Row label="Reward T1" value={`₹${fmtNum(rewardT1)}`} color="#16a34a" />
          <Row label="R:R Ratio T1" value={`1 : ${fmtNum(rrT1)}`} bold />
          <RRBar rr={rrT1} />
          <Row label="Min. Win Rate T1" value={`${fmtNum(winRateT1)}%`} />

          {t2N != null && t2N > 0 && (() => {
            const rewardT2 = Math.abs(t2N - entryN);
            const rrT2 = rewardT2 / risk;
            const winRateT2 = (1 / (1 + rrT2)) * 100;
            return (
              <>
                <div className="calc-divider" />
                <Row
                  label="Reward T2"
                  value={`₹${fmtNum(rewardT2)}`}
                  color="#16a34a"
                />
                <Row label="R:R Ratio T2" value={`1 : ${fmtNum(rrT2)}`} bold />
                <RRBar rr={rrT2} />
                <Row label="Min. Win Rate T2" value={`${fmtNum(winRateT2)}%`} />
              </>
            );
          })()}
        </div>
      );
    }
  }

  return (
    <CalcSection title="Risk : Reward">
      <Field label="Entry Price (₹)" value={entry} onChange={setEntry} />
      <Field label="Stop Loss Price (₹)" value={sl} onChange={setSl} />
      <Field label="Target 1 (₹)" value={t1} onChange={setT1} />
      <Field
        label="Target 2 (₹) — optional"
        value={t2}
        onChange={setT2}
        placeholder="optional"
      />
      {result}
    </CalcSection>
  );
}

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

function calcBrokerage(
  broker: BrokerKey,
  seg: SegKey,
  buyV: number,
  sellV: number
): number {
  const tv = buyV + sellV;
  switch (broker) {
    case "zerodha":
      if (seg === "delivery") return 0;
      if (seg === "intraday") {
        return Math.min(20, buyV * 0.0003) + Math.min(20, sellV * 0.0003);
      }
      return 40;
    case "groww":
    case "angel_one":
      if (seg === "delivery") return 0;
      return 40;
    case "upstox":
      if (seg === "delivery") return 0;
      if (seg === "intraday") {
        return Math.min(20, buyV * 0.0005) + Math.min(20, sellV * 0.0005);
      }
      return 40;
    case "dhan":
      if (seg === "delivery") return 0;
      if (seg === "intraday") {
        return Math.min(20, buyV * 0.0003) + Math.min(20, sellV * 0.0003);
      }
      return 40;
    case "icici_direct":
      if (seg === "intraday") {
        return Math.min(20, buyV * 0.00275) + Math.min(20, sellV * 0.00275);
      }
      if (seg === "delivery") return tv * 0.0055;
      return 40;
    case "hdfc_securities":
      if (seg === "intraday") {
        return Math.min(20, buyV * 0.0005) + Math.min(20, sellV * 0.0005);
      }
      if (seg === "delivery") return tv * 0.005;
      return 40;
    default:
      return 0;
  }
}

interface BrkResult {
  brokerage: number;
  stt: number;
  exc: number;
  sebi: number;
  gst: number;
  stamp: number;
  total: number;
  grossPnl: number;
  netPnl: number;
  breakeven: number;
}

function compute(
  broker: BrokerKey,
  seg: SegKey,
  buyP: number,
  sellP: number,
  qty: number
): BrkResult {
  const buyV = buyP * qty;
  const sellV = sellP * qty;
  const tv = buyV + sellV;

  const brokerage = calcBrokerage(broker, seg, buyV, sellV);

  let stt = 0;
  if (seg === "intraday") stt = sellV * 0.00025;
  else if (seg === "delivery") stt = tv * 0.001;
  else if (seg === "fno_futures") stt = sellV * 0.000125;
  else if (seg === "fno_options") stt = sellV * 0.000625;

  let exc = 0;
  if (seg === "intraday" || seg === "delivery") exc = tv * 0.0000297;
  else if (seg === "fno_futures") exc = tv * 0.0000173;
  else if (seg === "fno_options") exc = tv * 0.000495;

  const sebi = tv * 0.000001;
  const gst = (brokerage + exc) * 0.18;
  const stamp = buyV * 0.00003;
  const total = brokerage + stt + exc + sebi + gst + stamp;
  const grossPnl = (sellP - buyP) * qty;
  const netPnl = grossPnl - total;
  const breakeven = buyP + total / qty;

  return { brokerage, stt, exc, sebi, gst, stamp, total, grossPnl, netPnl, breakeven };
}

function BrokerageCalc() {
  const [buyP, setBuyP] = useState("");
  const [sellP, setSellP] = useState("");
  const [qty, setQty] = useState("");
  const [broker, setBroker] = useState<BrokerSelection>("");
  const [seg, setSeg] = useState<SegmentSelection>("");

  const canCalc =
    broker !== "" &&
    seg !== "" &&
    buyP !== "" &&
    sellP !== "" &&
    qty !== "" &&
    parseFloat(buyP) > 0 &&
    parseFloat(sellP) > 0 &&
    parseFloat(qty) > 0;

  let result: React.ReactNode = null;

  if (canCalc) {
    const r = compute(broker, seg, n(buyP), n(sellP), n(qty));
    const netColor = r.netPnl >= 0 ? "#16a34a" : "#dc2626";
    result = (
      <div className="calc-results">
        <Row label="Brokerage" value={fmtINR(r.brokerage)} />
        <Row label="STT" value={fmtINR(r.stt)} />
        <Row label="Exch. Charges" value={fmtINR(r.exc)} />
        <Row label="SEBI Charges" value={fmtINR(r.sebi)} />
        <Row label="GST (18%)" value={fmtINR(r.gst)} />
        <Row label="Stamp Duty" value={fmtINR(r.stamp)} />
        <div className="calc-divider" />
        <Row label="Total Charges" value={fmtINR(r.total)} bold color="#dc2626" />
        <Row label="Gross P&L" value={fmtINR(r.grossPnl)} />
        <Row label="Net P&L" value={fmtINR(r.netPnl)} bold color={netColor} />
        <Row label="Breakeven" value={`₹${fmtNum(r.breakeven)}`} />
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
              onChange={(e) => setBroker(e.target.value as BrokerSelection)}
            >
              <option value="">Select broker...</option>
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
              value={seg}
              onChange={(e) => setSeg(e.target.value as SegmentSelection)}
            >
              <option value="">Select segment...</option>
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
        <Field label="Buy Price (₹)" value={buyP} onChange={setBuyP} />
        <Field label="Sell Price (₹)" value={sellP} onChange={setSellP} />
        <Field label="Quantity" value={qty} onChange={setQty} placeholder="1" />
      </div>
      {result}
    </CalcSection>
  );
}

export default function CalculatorsTab() {
  return (
    <div className="calc-root">
      <PositionSizeCalc />
      <RRCalc />
      <BrokerageCalc />
    </div>
  );
}
