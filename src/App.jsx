
import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

const buttonStyle = { borderRadius: 14, border: "1px solid #dbe3ee", padding: "12px 14px", fontSize: 15, fontWeight: 700, cursor: "pointer", background: "#fff" };
const inputStyle = { width: "100%", padding: "12px 14px", borderRadius: 14, border: "1px solid #dbe3ee", fontSize: 16, boxSizing: "border-box" };

function parseDecimal(value) {
  const n = Number(String(value || "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}
function money(value) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2 }).format(value || 0);
}
function timeToMinutes(value) {
  const d = String(value || "").replace(/\D/g, "").slice(0, 4);
  if (!d) return null;
  let h = 0, m = 0;
  if (d.length <= 2) h = Number(d);
  else if (d.length === 3) { h = Number(d[0]); m = Number(d.slice(1)); }
  else { h = Number(d.slice(0, 2)); m = Number(d.slice(2)); }
  h = Math.min(23, Math.max(0, h));
  m = Math.min(59, Math.max(0, m));
  return h * 60 + m;
}
function formatTime(value) {
  const mins = timeToMinutes(value);
  if (mins == null) return "";
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}
function formatMinutes(mins) {
  if (mins == null) return "—";
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}
function Row({ label, value, strong }) {
  return <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontWeight: strong ? 900 : 600 }}><span style={{ color: "#475569" }}>{label}</span><span>{value}</span></div>;
}

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function makeDays() {
  return dayNames.map((name) => ({ name, type: name === "Sunday" || name === "Saturday" ? "off" : "work", start: "", finish: "", startKm: "", finishKm: "", holidayPay: "", nightOut: false, splitBreak: false, adr: 0, genset: 0, splitter: 0 }));
}

function App() {
  const [days, setDays] = useState(() => {
    try { return JSON.parse(localStorage.getItem("driver-pay-js-days")) || makeDays(); } catch { return makeDays(); }
  });
  const [index, setIndex] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [rates, setRates] = useState(() => {
    try { return JSON.parse(localStorage.getItem("driver-pay-js-rates")) || null; } catch { return null; }
  } || { weekday: "14.00", weekend: "21.00", overtime: "17.50", threshold: "10", food: "10", nightOut: "26", bonus: "11.25" });

  function saveDays(next) { setDays(next); localStorage.setItem("driver-pay-js-days", JSON.stringify(next)); }
  function saveRates(next) { setRates(next); localStorage.setItem("driver-pay-js-rates", JSON.stringify(next)); }
  function updateDay(key, value) { saveDays(days.map((d, i) => i === index ? { ...d, [key]: value } : d)); }

  const computed = useMemo(() => days.map((day) => {
    const weekend = day.name === "Sunday" || day.name === "Saturday";
    const start = timeToMinutes(day.start), finish = timeToMinutes(day.finish);
    const workedMinutes = day.type === "work" && start != null && finish != null && finish > start ? finish - start : null;
    const hours = workedMinutes ? workedMinutes / 60 : 0;
    const threshold = parseDecimal(rates.threshold);
    const hasWork = day.type === "work" && workedMinutes;
    const baseHours = hasWork ? (weekend ? hours : Math.min(hours, threshold)) : 0;
    const overtimeHours = hasWork && !weekend ? Math.max(0, hours - threshold) : 0;
    const basePay = baseHours * parseDecimal(weekend ? rates.weekend : rates.weekday);
    const overtimePay = overtimeHours * parseDecimal(rates.overtime);
    const bonusPay = hasWork ? (Number(day.adr || 0) + Number(day.genset || 0) + Number(day.splitter || 0)) * parseDecimal(rates.bonus) : 0;
    const holidayPay = day.type === "holiday" ? parseDecimal(day.holidayPay) : 0;
    const nightOutPay = hasWork && day.nightOut ? parseDecimal(rates.nightOut) : 0;
    const foodPay = hasWork ? parseDecimal(rates.food) : 0;
    const startKm = Number(day.startKm), finishKm = Number(day.finishKm);
    const km = day.startKm && day.finishKm && finishKm >= startKm ? finishKm - startKm : null;
    const taxable = basePay + overtimePay + bonusPay + holidayPay;
    const untaxed = nightOutPay + foodPay;
    return { ...day, workedMinutes, basePay, overtimePay, bonusPay, holidayPay, nightOutPay, foodPay, taxable, untaxed, total: taxable + untaxed, km };
  }), [days, rates]);

  const totals = computed.reduce((acc, d) => {
    acc.worked += d.workedMinutes || 0; acc.taxable += d.taxable; acc.untaxed += d.untaxed; acc.total += d.total; acc.km += d.km || 0;
    return acc;
  }, { worked: 0, taxable: 0, untaxed: 0, total: 0, km: 0 });
  const tax = Math.max(0, totals.taxable - 12570 / 52) * 0.2;
  const ni = totals.taxable > 242 ? (totals.taxable - 242) * 0.08 : 0;
  const net = totals.total - tax - ni;
  const current = days[index];
  const currentComputed = computed[index];

  function dayButtonStyle(type, active) {
    const colors = { work: ["#dcfce7", "#22c55e", "#166534"], holiday: ["#fed7aa", "#f97316", "#9a3412"], off: ["#fee2e2", "#ef4444", "#991b1b"] };
    const c = colors[type];
    return { ...buttonStyle, textAlign: "left", background: active ? `linear-gradient(135deg,#fff 0%,${c[0]} 100%)` : "#f8fafc", border: active ? `2px solid ${c[1]}` : "1px solid #cbd5e1", color: active ? c[2] : "#475569", boxShadow: active ? "inset 0 4px 10px rgba(15,23,42,0.16)" : "0 2px 0 #cbd5e1", transform: active ? "translateY(2px)" : "none" };
  }

  return <div style={{ minHeight: "100vh", background: "#f5f7fb", padding: 12, fontFamily: "Arial, sans-serif" }}>
    <style>{`button:active{transform:scale(.97)} input:focus{outline:none;box-shadow:0 0 0 3px rgba(148,163,184,.25)}`}</style>
    <div style={{ maxWidth: 430, margin: "0 auto", background: "#fff", borderRadius: 24, border: "1px solid #e5e7eb", overflow: "hidden" }}>
      <div style={{ padding: 16, display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div><div style={{ fontSize: 12, color: "#64748b" }}>Driver Pay App</div><div style={{ fontSize: 28, fontWeight: 900 }}>{current.name}</div></div>
        <button style={buttonStyle} onClick={() => setShowSettings(!showSettings)}>Settings</button>
      </div>

      <div style={{ padding: 16, borderTop: "1px solid #eef2f7", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button style={buttonStyle} onClick={() => setIndex(Math.max(0, index - 1))}>← Prev</button>
        <button style={buttonStyle} onClick={() => setIndex(Math.min(days.length - 1, index + 1))}>Next →</button>
      </div>

      {showSettings && <div style={{ padding: 16, borderTop: "1px solid #eef2f7", background: "#f8fafc" }}>
        <h3>Settings</h3>{Object.keys(rates).map((key) => <label key={key} style={{ display: "block", marginBottom: 10 }}><div style={{ fontSize: 13, fontWeight: 800 }}>{key}</div><input style={inputStyle} value={rates[key]} onChange={(e) => saveRates({ ...rates, [key]: e.target.value })} /></label>)}
      </div>}

      <Section title="Day type">
        <div style={{ display: "grid", gap: 10 }}>
          <button style={dayButtonStyle("work", current.type === "work")} onClick={() => updateDay("type", "work")}>Work day {current.type === "work" ? "SELECTED" : ""}</button>
          <button style={dayButtonStyle("holiday", current.type === "holiday")} onClick={() => updateDay("type", "holiday")}>Holiday day {current.type === "holiday" ? "SELECTED" : ""}</button>
          <button style={dayButtonStyle("off", current.type === "off")} onClick={() => updateDay("type", "off")}>Off day {current.type === "off" ? "SELECTED" : ""}</button>
        </div>
      </Section>

      {current.type === "work" && <Section title="Shift">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label><div>Start</div><input style={inputStyle} inputMode="numeric" value={current.start} onChange={(e) => updateDay("start", e.target.value.replace(/\D/g, "").slice(0, 4))} onBlur={() => updateDay("start", formatTime(current.start))} /></label>
          <label><div>Finish</div><input style={inputStyle} inputMode="numeric" value={current.finish} onChange={(e) => updateDay("finish", e.target.value.replace(/\D/g, "").slice(0, 4))} onBlur={() => updateDay("finish", formatTime(current.finish))} /></label>
        </div>
      </Section>}

      {current.type === "holiday" && <Section title="Holiday pay"><input style={inputStyle} inputMode="decimal" value={current.holidayPay} onChange={(e) => updateDay("holidayPay", e.target.value)} placeholder="0.00" /></Section>}

      <Section title="Kilometres">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label><div>Start km</div><input style={inputStyle} inputMode="numeric" value={current.startKm} onChange={(e) => updateDay("startKm", e.target.value.replace(/\D/g, ""))} /></label>
          <label><div>Finish km</div><input style={inputStyle} inputMode="numeric" value={current.finishKm} onChange={(e) => updateDay("finishKm", e.target.value.replace(/\D/g, ""))} /></label>
        </div>
      </Section>

      {current.type === "work" && <Section title="Extras">
        <label><input type="checkbox" checked={current.nightOut} onChange={(e) => updateDay("nightOut", e.target.checked)} /> Night out</label><br />
        <label><input type="checkbox" checked={current.splitBreak} onChange={(e) => updateDay("splitBreak", e.target.checked)} /> Split break</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
          <label><div>ADR</div><input style={inputStyle} inputMode="numeric" value={current.adr} onChange={(e) => updateDay("adr", Number(e.target.value || 0))} /></label>
          <label><div>Genset</div><input style={inputStyle} inputMode="numeric" value={current.genset} onChange={(e) => updateDay("genset", Number(e.target.value || 0))} /></label>
          <label><div>Splitter</div><input style={inputStyle} inputMode="numeric" value={current.splitter} onChange={(e) => updateDay("splitter", Number(e.target.value || 0))} /></label>
        </div>
      </Section>}

      <Section title="Day summary">
        <Row label="Worked" value={formatMinutes(currentComputed.workedMinutes)} /><Row label="Base" value={money(currentComputed.basePay)} /><Row label="Overtime" value={money(currentComputed.overtimePay)} /><Row label="Bonuses" value={money(currentComputed.bonusPay)} /><Row label="Holiday pay" value={money(currentComputed.holidayPay)} /><Row label="Untaxed" value={money(currentComputed.untaxed)} /><Row label="Day total" value={money(currentComputed.total)} strong />
      </Section>

      <Section title="Week estimate" muted>
        <Row label="Hours" value={formatMinutes(totals.worked)} /><Row label="KM" value={String(totals.km)} /><Row label="Taxable" value={money(totals.taxable)} /><Row label="Untaxed" value={money(totals.untaxed)} /><Row label="Tax" value={money(tax)} /><Row label="NI" value={money(ni)} /><Row label="Estimated net" value={money(net)} strong />
      </Section>
    </div>
  </div>;
}

function Section({ title, children, muted }) {
  return <div style={{ padding: 16, borderTop: "1px solid #eef2f7", background: muted ? "#f8fafc" : "#fff" }}><h3 style={{ marginTop: 0 }}>{title}</h3>{children}</div>;
}

createRoot(document.getElementById("root")).render(<App />);
