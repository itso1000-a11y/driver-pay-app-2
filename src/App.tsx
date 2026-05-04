import React, { useEffect, useMemo, useRef, useState } from "react";

type BonusType = "ADR" | "Genset" | "Splitter" | "Driver Assist" | "London Bonus";
type DayType = "work" | "holiday" | "off";
type WeekArchiveType = "worked" | "holiday" | "off";
type RestStatus = "good" | "reduced" | "violation" | "unknown";

type BonusEntry = { id: string; type: BonusType; qty: number };

type DayRecord = {
  id: string;
  dayName: string;
  dateLabel: string;
  dateISO: string;
  start: string;
  finish: string;
  startKm: string;
  finishKm: string;
  holidayPay: string;
  dayType: DayType;
  splitBreak: boolean;
  nightOut: boolean;
  bonuses: BonusEntry[];
};

type SettingsState = {
  weekdayRate: string;
  weekendRate: string;
  overtimeThresholdHours: string;
  overtimeRate: string;
  foodAllowanceRate: string;
  nightOutRate: string;
  bonusRates: Record<BonusType, string>;
};

type ComputedDay = DayRecord & {
  weekend: boolean;
  workedMinutes: number | null;
  overtimeMinutes: number;
  kmRun: number | null;
  basePay: number;
  overtimePay: number;
  bonusPay: number;
  holidayPayAmount: number;
  nightOutPay: number;
  foodAllowancePay: number;
  taxablePay: number;
  untaxedPay: number;
  tax: number;
  ni: number;
  net: number;
  total: number;
};

type WeekTotals = {
  worked: number;
  overtime: number;
  km: number;
  taxable: number;
  untaxed: number;
  tax: number;
  ni: number;
  net: number;
  total: number;
};

type SavedWeekData = { days: DayRecord[]; settings: SettingsState; payslipActualWeek?: string };

const BONUS_TYPES: BonusType[] = ["ADR", "Genset", "Splitter", "Driver Assist", "London Bonus"];
const DAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const emptyTotals: WeekTotals = { worked: 0, overtime: 0, km: 0, taxable: 0, untaxed: 0, tax: 0, ni: 0, net: 0, total: 0 };

const initialSettings: SettingsState = {
  weekdayRate: "14.00",
  weekendRate: "21.00",
  overtimeThresholdHours: "10.00",
  overtimeRate: "17.50",
  foodAllowanceRate: "10.00",
  nightOutRate: "26.00",
  bonusRates: { ADR: "11.25", Genset: "11.25", Splitter: "11.25", "Driver Assist": "11.25", "London Bonus": "15.00" },
};

const pageStyle: React.CSSProperties = { minHeight: "100vh", background: "#f5f7fb", padding: 12, fontFamily: "Arial, sans-serif", color: "#0f172a" };
const shellStyle: React.CSSProperties = { maxWidth: 430, margin: "0 auto", background: "#ffffff", borderRadius: 24, border: "1px solid #e5e7eb", overflow: "hidden" };
const sectionStyle: React.CSSProperties = { padding: 16, borderTop: "1px solid #eef2f7" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "12px 14px", borderRadius: 14, border: "1px solid #dbe3ee", fontSize: 16, outline: "none", boxSizing: "border-box", background: "#fff" };
const buttonStyle: React.CSSProperties = { borderRadius: 14, border: "1px solid #dbe3ee", padding: "12px 14px", fontSize: 15, fontWeight: 700, cursor: "pointer", background: "#fff", transition: "transform 0.08s ease, filter 0.08s ease, background 0.08s ease, opacity 0.08s ease, box-shadow 0.08s ease", WebkitTapHighlightColor: "transparent", userSelect: "none" };

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y || 2026, (m || 1) - 1, d || 1);
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function getTaxWeekNumber(date: Date): number {
  const taxYearStart = new Date(date.getFullYear(), 3, 6);
  const start = date < taxYearStart ? new Date(date.getFullYear() - 1, 3, 6) : taxYearStart;
  return Math.floor(Math.floor((date.getTime() - start.getTime()) / 86400000) / 7) + 1;
}

function isWeekend(dayName: string): boolean {
  return dayName === "Saturday" || dayName === "Sunday";
}

function makeDay(id: string, dayName: string, date: Date): DayRecord {
  return {
    id,
    dayName,
    dateLabel: formatDateLabel(date),
    dateISO: toISODate(date),
    start: "",
    finish: "",
    startKm: "",
    finishKm: "",
    holidayPay: "",
    dayType: isWeekend(dayName) ? "off" : "work",
    splitBreak: false,
    nightOut: false,
    bonuses: [],
  };
}

function buildPayrollWeek(saturdayISO: string): DayRecord[] {
  const sat = fromISODate(saturdayISO);
  return [
    makeDay("mon", "Monday", addDays(sat, -5)),
    makeDay("tue", "Tuesday", addDays(sat, -4)),
    makeDay("wed", "Wednesday", addDays(sat, -3)),
    makeDay("thu", "Thursday", addDays(sat, -2)),
    makeDay("fri", "Friday", addDays(sat, -1)),
    makeDay("sat", "Saturday", sat),
    makeDay("sun", "Sunday", addDays(sat, -6)),
  ];
}

function getCurrentPayrollSaturdayISO(): string {
  const today = new Date();
  return toISODate(addDays(today, (6 - today.getDay() + 7) % 7));
}

const initialDays = buildPayrollWeek(getCurrentPayrollSaturdayISO());

function sanitizeBonusType(value: unknown): BonusType {
  return BONUS_TYPES.includes(value as BonusType) ? (value as BonusType) : "ADR";
}

function sanitizeBonusEntry(raw: unknown): BonusEntry {
  const r = (raw ?? {}) as Record<string, unknown>;
  return { id: typeof r.id === "string" ? r.id : `${Date.now()}-${Math.random()}`, type: sanitizeBonusType(r.type), qty: Number.isFinite(Number(r.qty)) ? Math.max(1, Number(r.qty)) : 1 };
}

function sanitizeDayType(value: unknown): DayType {
  return value === "holiday" || value === "off" || value === "work" ? value : "work";
}

function sanitizeDayRecord(raw: unknown, fallback: DayRecord): DayRecord {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    ...fallback,
    id: typeof r.id === "string" ? r.id : fallback.id,
    dayName: typeof r.dayName === "string" ? r.dayName : fallback.dayName,
    dateLabel: typeof r.dateLabel === "string" ? r.dateLabel : fallback.dateLabel,
    dateISO: typeof r.dateISO === "string" ? r.dateISO : fallback.dateISO,
    start: typeof r.start === "string" ? r.start : "",
    finish: typeof r.finish === "string" ? r.finish : "",
    startKm: typeof r.startKm === "string" ? r.startKm : "",
    finishKm: typeof r.finishKm === "string" ? r.finishKm : "",
    holidayPay: typeof r.holidayPay === "string" ? r.holidayPay : "",
    dayType: sanitizeDayType(r.dayType),
    splitBreak: Boolean(r.splitBreak),
    nightOut: Boolean(r.nightOut),
    bonuses: Array.isArray(r.bonuses) ? r.bonuses.map(sanitizeBonusEntry) : [],
  };
}

function sanitizeSettings(raw: unknown): SettingsState {
  const r = (raw ?? {}) as Record<string, unknown>;
  const br = (r.bonusRates ?? {}) as Record<string, unknown>;
  return {
    weekdayRate: typeof r.weekdayRate === "string" ? r.weekdayRate : initialSettings.weekdayRate,
    weekendRate: typeof r.weekendRate === "string" ? r.weekendRate : initialSettings.weekendRate,
    overtimeThresholdHours: typeof r.overtimeThresholdHours === "string" ? r.overtimeThresholdHours : initialSettings.overtimeThresholdHours,
    overtimeRate: typeof r.overtimeRate === "string" ? r.overtimeRate : initialSettings.overtimeRate,
    foodAllowanceRate: typeof r.foodAllowanceRate === "string" ? r.foodAllowanceRate : initialSettings.foodAllowanceRate,
    nightOutRate: typeof r.nightOutRate === "string" ? r.nightOutRate : initialSettings.nightOutRate,
    bonusRates: {
      ADR: typeof br.ADR === "string" ? br.ADR : initialSettings.bonusRates.ADR,
      Genset: typeof br.Genset === "string" ? br.Genset : initialSettings.bonusRates.Genset,
      Splitter: typeof br.Splitter === "string" ? br.Splitter : initialSettings.bonusRates.Splitter,
      "Driver Assist": typeof br["Driver Assist"] === "string" ? br["Driver Assist"] : initialSettings.bonusRates["Driver Assist"],
      "London Bonus": typeof br["London Bonus"] === "string" ? br["London Bonus"] : initialSettings.bonusRates["London Bonus"],
    },
  };
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function formatTimeInput(raw: string): string {
  return digitsOnly(raw).slice(0, 4);
}

function normalizeTime(value: string): string {
  const d = digitsOnly(value).slice(0, 4);
  if (!d) return "";
  if (d.length === 1) return `0${d}:00`;
  if (d.length === 2) return `${String(Math.min(23, Number(d))).padStart(2, "0")}:00`;
  if (d.length === 3) return `0${d[0]}:${String(Math.min(59, Number(d.slice(1)))).padStart(2, "0")}`;
  return `${String(Math.min(23, Number(d.slice(0, 2)))).padStart(2, "0")}:${String(Math.min(59, Number(d.slice(2, 4)))).padStart(2, "0")}`;
}

function parseTimeToMinutes(value: string): number | null {
  const n = normalizeTime(value);
  if (!n) return null;
  const [h, m] = n.split(":").map(Number);
  return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m;
}

function minutesToTime(mins: number | null): string {
  if (mins == null) return "";
  return `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

function parseDecimal(value: string): number {
  const parsed = Number(String(value || "").replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMinutes(value: number | null): string {
  if (value == null) return "—";
  const safe = Math.max(0, Math.round(value));
  return `${Math.floor(safe / 60)}h ${(safe % 60).toString().padStart(2, "0")}m`;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
}

function getWorkedMinutes(day: DayRecord): number | null {
  if (day.dayType !== "work") return null;
  const s = parseTimeToMinutes(day.start);
  const f = parseTimeToMinutes(day.finish);
  if (s == null || f == null || f <= s) return null;
  return f - s;
}

function getShiftValidationMessage(day: DayRecord): string | null {
  if (day.dayType !== "work") return null;
  const start = normalizeTime(day.start || "");
  const finish = normalizeTime(day.finish || "");
  const s = parseTimeToMinutes(start);
  const f = parseTimeToMinutes(finish);
  if ((start && !finish) || (!start && finish)) return "Incomplete shift.";
  if (s != null && f != null && f <= s) return "Finish time is before start.";
  if (s != null && f != null && f - s > 15 * 60) return `Long shift: ${Math.floor((f - s) / 60)}h ${(f - s) % 60}m.`;
  return null;
}

function getKmRun(day: DayRecord): number | null {
  const start = Number(day.startKm);
  const finish = Number(day.finishKm);
  if (!day.startKm || !day.finishKm || !Number.isFinite(start) || !Number.isFinite(finish) || finish < start) return null;
  return finish - start;
}

function getRestBeforeMinutes(previous: DayRecord | undefined, current: DayRecord): number | null {
  if (!previous || current.dayType !== "work") return null;
  const pf = parseTimeToMinutes(previous.finish);
  const cs = parseTimeToMinutes(current.start);
  if (pf == null || cs == null) return null;
  return (cs < pf ? cs + 1440 : cs) - pf;
}

function getBaseRestStatus(restMinutes: number | null): RestStatus {
  if (restMinutes == null) return "unknown";
  if (restMinutes >= 11 * 60) return "good";
  if (restMinutes >= 9 * 60) return "reduced";
  return "violation";
}

function getOrderedDayIndices(days: DayRecord[]): number[] {
  return DAY_ORDER.map((id) => days.findIndex((d) => d.id === id)).filter((index) => index !== -1);
}

function getPreviousLogicalDay(days: DayRecord[], index: number): DayRecord | undefined {
  const ordered = getOrderedDayIndices(days);
  const pos = ordered.indexOf(index);
  return pos > 0 ? days[ordered[pos - 1]] : undefined;
}

function getLastFinishKmBeforeIndex(days: DayRecord[], index: number): string {
  const ordered = getOrderedDayIndices(days);
  const pos = ordered.indexOf(index);
  if (pos <= 0) return "";
  for (let i = pos - 1; i >= 0; i -= 1) {
    const finishKm = days[ordered[i]]?.finishKm || "";
    if (finishKm) return finishKm;
  }
  return "";
}

function getWeeklyReducedRestCountBeforeIndex(days: DayRecord[], targetIndex: number): number {
  const ordered = getOrderedDayIndices(days);
  const targetPos = ordered.indexOf(targetIndex);
  if (targetPos <= 0) return 0;
  let count = 0;
  for (let pos = 1; pos < targetPos; pos += 1) {
    if (getBaseRestStatus(getRestBeforeMinutes(days[ordered[pos - 1]], days[ordered[pos]])) === "reduced") count += 1;
  }
  return count;
}

function getEffectiveRestStatus(restMinutes: number | null, previousWorkedMinutes: number | null, hasWeeklySplitBreak: boolean, reducedCountBeforeCurrent: number): RestStatus {
  const base = getBaseRestStatus(restMinutes);
  if (base === "unknown" || base === "violation") return base;
  if (!hasWeeklySplitBreak && previousWorkedMinutes != null && previousWorkedMinutes > 13 * 60) return restMinutes != null && restMinutes >= 9 * 60 ? "reduced" : "violation";
  if (!hasWeeklySplitBreak && base === "reduced" && reducedCountBeforeCurrent >= 3) return "violation";
  return base;
}

function getSuggestedStartTimes(prevFinish: number | null, reducedCount: number) {
  if (prevFinish == null) return { h11: null, h9: null, h9Blocked: false };
  return { h11: prevFinish + 11 * 60, h9: prevFinish + 9 * 60, h9Blocked: reducedCount >= 3 };
}

function getSuggestedStartHelp(suggested: { h9: number | null; h9Blocked?: boolean }): string {
  if (suggested.h9 == null) return "";
  return suggested.h9Blocked ? `9h option: ${minutesToTime(suggested.h9)} (reduced limit reached)` : `9h option: ${minutesToTime(suggested.h9)}`;
}

function statusPalette(status: RestStatus) {
  if (status === "good") return { bg: "linear-gradient(135deg,#ffffff 0%,#dcfce7 100%)", border: "#86efac", text: "#166534", label: "11h rest" };
  if (status === "reduced") return { bg: "linear-gradient(135deg,#ffffff 0%,#fef9c3 100%)", border: "#fde68a", text: "#a16207", label: "9h rest" };
  if (status === "violation") return { bg: "linear-gradient(135deg,#ffffff 0%,#fee2e2 100%)", border: "#fca5a5", text: "#b91c1c", label: "Violation" };
  return { bg: "#f8fafc", border: "#e2e8f0", text: "#64748b", label: "Pending" };
}

function isDayComplete(day: DayRecord): boolean {
  return (day.dayType === "work" && Boolean(normalizeTime(day.start || "") && normalizeTime(day.finish || ""))) || day.dayType === "off" || day.dayType === "holiday";
}

function getFirstIncompleteIndex(days: DayRecord[]): number {
  const ordered = getOrderedDayIndices(days);
  for (const index of ordered) if (!isDayComplete(days[index])) return index;
  const saturday = days.findIndex((d) => d.id === "sat");
  return saturday >= 0 ? saturday : 0;
}

function getAdjacentLogicalIndex(days: DayRecord[], currentIndex: number, direction: 1 | -1): number {
  const ordered = getOrderedDayIndices(days);
  const currentPos = ordered.indexOf(currentIndex);
  const nextPos = currentPos + direction;
  if (currentPos === -1 || nextPos < 0 || nextPos >= ordered.length) return currentIndex;
  return ordered[nextPos];
}

function getSaturdayDay(days: DayRecord[]): DayRecord {
  return days.find((day) => day.id === "sat") || days[5] || days[days.length - 1];
}

function getWeekStorageKey(saturdayISO: string): string {
  return `driverApp_week_${saturdayISO}`;
}

function saveWeekData(days: DayRecord[], settings: SettingsState, payslipActualWeek: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(getWeekStorageKey(getSaturdayDay(days).dateISO), JSON.stringify({ days, settings, payslipActualWeek }));
}

function loadSavedWeekDataOrBlank(saturdayISO: string): SavedWeekData {
  const fallbackDays = buildPayrollWeek(saturdayISO);
  const fallback = { days: fallbackDays, settings: initialSettings, payslipActualWeek: "" };
  if (typeof window === "undefined") return fallback;
  try {
    const saved = localStorage.getItem(getWeekStorageKey(saturdayISO));
    if (!saved) return fallback;
    const parsed = JSON.parse(saved);
    const rawDays = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.days) ? parsed.days : [];
    return { days: fallbackDays.map((day, index) => sanitizeDayRecord(rawDays[index], day)), settings: Array.isArray(parsed) ? initialSettings : sanitizeSettings(parsed?.settings), payslipActualWeek: typeof parsed?.payslipActualWeek === "string" ? parsed.payslipActualWeek : "" };
  } catch {
    return fallback;
  }
}

function getLastFinishKmFromPreviousWeek(saturdayISO: string): string {
  if (typeof window === "undefined") return "";
  try {
    const previousSaturdayISO = toISODate(addDays(fromISODate(saturdayISO), -7));
    const saved = localStorage.getItem(getWeekStorageKey(previousSaturdayISO));
    if (!saved) return "";
    const parsed = JSON.parse(saved);
    const rawDays = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.days) ? parsed.days : [];
    const previousWeek = buildPayrollWeek(previousSaturdayISO).map((day, index) => sanitizeDayRecord(rawDays[index], day));
    const ordered = getOrderedDayIndices(previousWeek);
    for (let i = ordered.length - 1; i >= 0; i -= 1) {
      const finishKm = previousWeek[ordered[i]]?.finishKm || "";
      if (finishKm) return finishKm;
    }
  } catch {
    return "";
  }
  return "";
}

function getWeekEndingLabel(days: DayRecord[]): string {
  const saturday = getSaturdayDay(days);
  const date = fromISODate(saturday.dateISO);
  return `Tax Week ${getTaxWeekNumber(date)} - ending ${saturday.dateLabel} ${date.getFullYear()}`;
}

function getDifferenceStyle(value: number): React.CSSProperties {
  if (value > 0) return { background: "linear-gradient(135deg,#ffffff 0%,#dcfce7 100%)", border: "1px solid #86efac", color: "#166534" };
  if (value < 0) return { background: "linear-gradient(135deg,#ffffff 0%,#fee2e2 100%)", border: "1px solid #fca5a5", color: "#b91c1c" };
  return { background: "#f8fafc", border: "1px solid #e2e8f0", color: "#64748b" };
}

function runDevTests() {
  if (typeof window === "undefined" || (window as any).__driverPayTestsRun) return;
  (window as any).__driverPayTestsRun = true;
  console.assert(normalizeTime("7") === "07:00", "normalizeTime single digit failed");
  console.assert(normalizeTime("703") === "07:03", "normalizeTime 3 digits failed");
  console.assert(getKmRun({ ...makeDay("x", "Monday", new Date()), startKm: "1000", finishKm: "1123" }) === 123, "km run failed");
  console.assert(getKmRun({ ...makeDay("x", "Monday", new Date()), startKm: "1123", finishKm: "1000" }) === null, "negative km should be null");
  console.assert(isDayComplete({ ...makeDay("x", "Monday", new Date()), dayType: "off" }), "off day complete failed");
  console.assert(isDayComplete({ ...makeDay("x", "Monday", new Date()), dayType: "holiday" }), "holiday day complete failed");
  console.assert(getWorkedMinutes({ ...makeDay("x", "Monday", new Date()), dayType: "holiday", start: "0700", finish: "1700" }) === null, "holiday must not count hours");
  const testWeek = buildPayrollWeek("2026-04-25");
  console.assert(getOrderedDayIndices(testWeek).map((i) => testWeek[i].id).join(",") === "sun,mon,tue,wed,thu,fri,sat", "logical day order failed");
  console.assert(getSuggestedStartTimes(600, 3).h9Blocked === true, "9h should be flagged when reduced limit reached");
}


type DriverBackup = {
  version: 1;
  exportedAt: string;
  activeWeekSaturdayISO: string;
  days: DayRecord[];
  settings: SettingsState;
  payslipActualWeek: string;
  archive: any[];
  savedWeeks: Record<string, SavedWeekData>;
};

function collectSavedWeeksFromLocalStorage(): Record<string, SavedWeekData> {
  const savedWeeks: Record<string, SavedWeekData> = {};
  if (typeof window === "undefined") return savedWeeks;
  for (let i = 0; i < localStorage.length; i += 1) {
    const storageKey = localStorage.key(i) || "";
    if (!storageKey.startsWith("driverApp_week_")) continue;
    try {
      const saturdayISO = storageKey.replace("driverApp_week_", "");
      const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}");
      if (Array.isArray(parsed?.days)) savedWeeks[saturdayISO] = parsed;
    } catch {}
  }
  return savedWeeks;
}

function downloadDriverBackup(days: DayRecord[], settings: SettingsState, payslipActualWeek: string, archive: any[]) {
  const activeWeekSaturdayISO = getSaturdayDay(days).dateISO;
  const backup: DriverBackup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    activeWeekSaturdayISO,
    days,
    settings,
    payslipActualWeek,
    archive,
    savedWeeks: collectSavedWeeksFromLocalStorage(),
  };
  backup.savedWeeks[activeWeekSaturdayISO] = { days, settings, payslipActualWeek };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `driver-pay-backup-${activeWeekSaturdayISO}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function restoreDriverBackupFile(file: File, callbacks: {
  setDays: React.Dispatch<React.SetStateAction<DayRecord[]>>;
  setSettings: React.Dispatch<React.SetStateAction<SettingsState>>;
  setPayslipActualWeek: React.Dispatch<React.SetStateAction<string>>;
  setArchive: React.Dispatch<React.SetStateAction<any[]>>;
  setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
  setSelectedSaturday: React.Dispatch<React.SetStateAction<string>>;
  setHistoricalEditEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  onDone?: () => void;
}) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || "{}")) as Partial<DriverBackup>;
      const restoredDays = Array.isArray(parsed.days) ? parsed.days : [];
      const restoredSettings = parsed.settings ? sanitizeSettings(parsed.settings) : initialSettings;
      const restoredArchive = Array.isArray(parsed.archive) ? parsed.archive : [];
      const restoredPayslip = typeof parsed.payslipActualWeek === "string" ? parsed.payslipActualWeek : "";
      if (!restoredDays.length) throw new Error("No days in backup");
      if (parsed.savedWeeks && typeof parsed.savedWeeks === "object") {
        Object.entries(parsed.savedWeeks).forEach(([saturdayISO, weekData]) => {
          if (saturdayISO && weekData && Array.isArray((weekData as SavedWeekData).days)) {
            localStorage.setItem(getWeekStorageKey(saturdayISO), JSON.stringify(weekData));
          }
        });
      }
      const activeSaturday = typeof parsed.activeWeekSaturdayISO === "string" ? parsed.activeWeekSaturdayISO : getSaturdayDay(restoredDays).dateISO;
      localStorage.setItem(getWeekStorageKey(activeSaturday), JSON.stringify({ days: restoredDays, settings: restoredSettings, payslipActualWeek: restoredPayslip }));
      localStorage.setItem("days", JSON.stringify(restoredDays));
      localStorage.setItem("driverApp_days", JSON.stringify(restoredDays));
      localStorage.setItem("settings", JSON.stringify(restoredSettings));
      localStorage.setItem("archive", JSON.stringify(restoredArchive));
      callbacks.setDays(restoredDays);
      callbacks.setSettings(restoredSettings);
      callbacks.setPayslipActualWeek(restoredPayslip);
      callbacks.setArchive(restoredArchive);
      callbacks.setSelectedSaturday(activeSaturday);
      callbacks.setHistoricalEditEnabled(false);
      callbacks.setCurrentIndex(getFirstIncompleteIndex(restoredDays));
      callbacks.onDone?.();
      window.alert("Backup restored successfully.");
    } catch {
      window.alert("This backup file could not be restored.");
    }
  };
  reader.readAsText(file);
}

export default function App() {
  runDevTests();
  const [days, setDays] = useState<DayRecord[]>(() => {
    if (typeof window === "undefined") return initialDays;
    const currentSaturday = getCurrentPayrollSaturdayISO();
    const weekData = loadSavedWeekDataOrBlank(currentSaturday);
    if (localStorage.getItem(getWeekStorageKey(currentSaturday))) return weekData.days;
    try {
      const saved = localStorage.getItem("days") || localStorage.getItem("driverApp_days");
      if (!saved) return initialDays;
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? initialDays.map((day, index) => sanitizeDayRecord(parsed[index], day)) : initialDays;
    } catch {
      return initialDays;
    }
  });
  const [settings, setSettings] = useState<SettingsState>(() => {
    if (typeof window === "undefined") return initialSettings;
    try { const saved = localStorage.getItem("settings"); return saved ? sanitizeSettings(JSON.parse(saved)) : initialSettings; } catch { return initialSettings; }
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const didAutoSelectRef = useRef(false);
  const [showWeekView, setShowWeekView] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBonusForm, setShowBonusForm] = useState(false);
  const [draftBonusType, setDraftBonusType] = useState<BonusType>("ADR");
  const [draftBonusQty, setDraftBonusQty] = useState("1");
  const [payslipActualWeek, setPayslipActualWeek] = useState("");
  const [selectedSaturday, setSelectedSaturday] = useState(() => getSaturdayDay(initialDays).dateISO);
  const [archive, setArchive] = useState<any[]>(() => { try { const saved = localStorage.getItem("archive"); return saved ? JSON.parse(saved) : []; } catch { return []; } });
  const [historicalEditEnabled, setHistoricalEditEnabled] = useState(false);

  const currentDay = days[currentIndex] ?? initialDays[0];
  const orderedIndices = getOrderedDayIndices(days);
  const currentPos = orderedIndices.indexOf(currentIndex);
  const previousDay = currentPos > 0 ? days[orderedIndices[currentPos - 1]] : undefined;
  const lastFinishKmThisWeek = getLastFinishKmBeforeIndex(days, currentIndex);
  const previousWeekFinishKm = !lastFinishKmThisWeek ? getLastFinishKmFromPreviousWeek(getSaturdayDay(days).dateISO) : "";
  const previousFinishKm = lastFinishKmThisWeek || previousWeekFinishKm;
  const startKmSuggestionSource = lastFinishKmThisWeek ? "last saved day" : previousWeekFinishKm ? "last week" : "";
  const displayStartKm = currentDay.startKm || previousFinishKm;
  const startKmIsSuggested = !currentDay.startKm && Boolean(previousFinishKm);
  const hasWeeklySplitBreak = useMemo(() => days.some((day) => day.splitBreak), [days]);
  const weekEndingLabel = useMemo(() => getWeekEndingLabel(days), [days]);
  const weekIsHistorical = getSaturdayDay(days).dateISO < getCurrentPayrollSaturdayISO();
  const weekLocked = weekIsHistorical && !historicalEditEnabled;
  const shiftValidationMessage = useMemo(() => getShiftValidationMessage(currentDay), [currentDay]);

  useEffect(() => { if (typeof window !== "undefined") { localStorage.setItem("days", JSON.stringify(days)); localStorage.setItem("driverApp_days", JSON.stringify(days)); saveWeekData(days, settings, payslipActualWeek); } }, [days, settings, payslipActualWeek]);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("settings", JSON.stringify(settings)); }, [settings]);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("archive", JSON.stringify(archive)); }, [archive]);
  useEffect(() => { if (!didAutoSelectRef.current) { setCurrentIndex(getFirstIncompleteIndex(days)); didAutoSelectRef.current = true; } }, [days]);
  useEffect(() => { setSelectedSaturday(getSaturdayDay(days).dateISO); }, [days]);

  function updateCurrentDay<K extends keyof DayRecord>(key: K, value: DayRecord[K]) { if (weekLocked) return; setDays((prev) => prev.map((day, index) => (index === currentIndex ? { ...day, [key]: value } : day))); }
  function updateTimeValue(field: "start" | "finish", rawValue: string) { updateCurrentDay(field, formatTimeInput(rawValue)); }
  function normalizeTimeValue(field: "start" | "finish") { updateCurrentDay(field, normalizeTime(currentDay[field] || "")); }
  function updateKmValue(field: "startKm" | "finishKm", rawValue: string) { updateCurrentDay(field, digitsOnly(rawValue)); }
  function removeBonus(id: string) { updateCurrentDay("bonuses", currentDay.bonuses.filter((bonus) => bonus.id !== id)); }
  function addBonus() { const qty = Math.max(1, Number(draftBonusQty || "1") || 1); updateCurrentDay("bonuses", [...currentDay.bonuses, { id: `${Date.now()}-${Math.random()}`, type: draftBonusType, qty }]); setDraftBonusQty("1"); setShowBonusForm(false); }
  function navigateLogical(direction: 1 | -1) { setCurrentIndex((prev) => getAdjacentLogicalIndex(days, prev, direction)); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function loadSelectedWeek() { saveWeekData(days, settings, payslipActualWeek); const loaded = loadSavedWeekDataOrBlank(selectedSaturday); setDays(loaded.days); setSettings(loaded.settings); setPayslipActualWeek(loaded.payslipActualWeek || ""); setHistoricalEditEnabled(false); setCurrentIndex(getFirstIncompleteIndex(loaded.days)); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function loadCurrentWeek() { saveWeekData(days, settings, payslipActualWeek); const currentSaturday = getCurrentPayrollSaturdayISO(); const loaded = loadSavedWeekDataOrBlank(currentSaturday); setSelectedSaturday(currentSaturday); setDays(loaded.days); setSettings(loaded.settings); setPayslipActualWeek(loaded.payslipActualWeek || ""); setHistoricalEditEnabled(false); setCurrentIndex(getFirstIncompleteIndex(loaded.days)); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function setCurrentDayType(type: DayType) {
    if (weekLocked) return;
    setDays((prev) => prev.map((day, index) => {
      if (index !== currentIndex) return day;
      if (type === "work") return { ...day, dayType: "work" };
      if (type === "holiday") return { ...day, dayType: "holiday", start: "", finish: "", bonuses: [], nightOut: false, splitBreak: false };
      return { ...day, dayType: "off", start: "", finish: "", holidayPay: "", bonuses: [], nightOut: false, splitBreak: false };
    }));
  }
  function saveAndGo() {
    const day = days[currentIndex];
    const suggestedStart = minutesToTime(suggestedTimes.h11);
    const start = normalizeTime(day.start || (day.finish && suggestedStart ? suggestedStart : ""));
    const finish = normalizeTime(day.finish || "");
    const s = parseTimeToMinutes(start);
    const f = parseTimeToMinutes(finish);
    const emptyWeekendWorkDay = day.dayType === "work" && isWeekend(day.dayName) && !start && !finish && !day.finishKm && !day.holidayPay && day.bonuses.length === 0 && !day.nightOut && !day.splitBreak;
    if (weekLocked) { window.alert("This is an older saved week. Press Unlock editing if you want to change it."); return; }
    if (day.dayType === "work" && !emptyWeekendWorkDay) {
      if ((start && !finish) || (!start && finish)) { window.alert("Work day needs both Start and Finish. Choose Off/Holiday if this was not a working day."); return; }
      if (s != null && f != null && f <= s) { if (!window.confirm("Finish time is before start. Continue anyway?")) return; }
      if (s != null && f != null && f - s > 15 * 60) { if (!window.confirm(`You worked ${Math.floor((f - s) / 60)}h ${(f - s) % 60}m. Confirm?`)) return; }
    }
    const effectiveStartKm = day.startKm || (day.finishKm ? previousFinishKm : "");
    const nextIndex = getAdjacentLogicalIndex(days, currentIndex, 1);
    setDays((prev) => prev.map((d, index) => index === currentIndex ? { ...d, dayType: emptyWeekendWorkDay ? "off" : d.dayType, start: emptyWeekendWorkDay ? "" : d.dayType === "work" ? start : "", finish: emptyWeekendWorkDay ? "" : d.dayType === "work" ? finish : "", startKm: effectiveStartKm } : d));
    setShowBonusForm(false);
    setCurrentIndex(nextIndex);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const computedWeek = useMemo<ComputedDay[]>(() => days.map((day, index) => {
    const effectiveDay = { ...day, startKm: day.startKm || getLastFinishKmBeforeIndex(days, index) || "" };
    const workedMinutes = getWorkedMinutes(day);
    const kmRun = getKmRun(effectiveDay);
    const weekend = isWeekend(day.dayName);
    const baseRate = weekend ? parseDecimal(settings.weekendRate) : parseDecimal(settings.weekdayRate);
    const hoursDecimal = workedMinutes ? workedMinutes / 60 : 0;
    const guaranteedHours = parseDecimal(settings.overtimeThresholdHours);
    const hasWorkedDay = day.dayType === "work" && workedMinutes != null && workedMinutes > 0;
    let baseHoursDecimal = 0;
    let overtimeDecimal = 0;
    if (weekend) baseHoursDecimal = hasWorkedDay ? hoursDecimal : 0;
    else if (hasWorkedDay) { overtimeDecimal = Math.max(0, hoursDecimal - guaranteedHours); baseHoursDecimal = guaranteedHours; }
    const basePay = baseHoursDecimal * baseRate;
    const overtimePay = overtimeDecimal * parseDecimal(settings.overtimeRate);
    const bonusPay = hasWorkedDay ? day.bonuses.reduce((sum, bonus) => sum + bonus.qty * parseDecimal(settings.bonusRates[bonus.type]), 0) : 0;
    const holidayPayAmount = day.dayType === "holiday" ? parseDecimal(day.holidayPay || "") : 0;
    const nightOutPay = hasWorkedDay && day.nightOut ? parseDecimal(settings.nightOutRate) : 0;
    const foodAllowancePay = hasWorkedDay ? parseDecimal(settings.foodAllowanceRate) : 0;
    const taxablePay = basePay + overtimePay + bonusPay + holidayPayAmount;
    const untaxedPay = nightOutPay + foodAllowancePay;
    const total = taxablePay + untaxedPay;
    return { ...day, weekend, workedMinutes, overtimeMinutes: Math.round(overtimeDecimal * 60), kmRun, basePay, overtimePay, bonusPay, holidayPayAmount, nightOutPay, foodAllowancePay, taxablePay, untaxedPay, tax: 0, ni: 0, net: total, total };
  }), [days, settings]);

  const weeklyTaxModel = useMemo(() => {
    const taxable = computedWeek.reduce((sum, day) => sum + day.taxablePay, 0);
    const untaxed = computedWeek.reduce((sum, day) => sum + day.untaxedPay, 0);
    const gross = taxable + untaxed;
    const tax = Math.round(Math.max(0, taxable - 12570 / 52) * 0.2 * 100) / 100;
    const ni = Math.round((taxable > 242 ? (taxable - 242) * 0.08 : 0) * 100) / 100;
    return { taxable, untaxed, gross, tax, ni, net: gross - tax - ni };
  }, [computedWeek]);

  const taxedWeek = useMemo(() => computedWeek.map((day) => {
    const share = weeklyTaxModel.taxable > 0 ? day.taxablePay / weeklyTaxModel.taxable : 0;
    const tax = weeklyTaxModel.tax * share;
    const ni = weeklyTaxModel.ni * share;
    return { ...day, tax, ni, net: day.total - tax - ni };
  }), [computedWeek, weeklyTaxModel]);

  const currentComputed = taxedWeek[currentIndex] ?? { ...currentDay, weekend: false, workedMinutes: null, overtimeMinutes: 0, kmRun: null, basePay: 0, overtimePay: 0, bonusPay: 0, holidayPayAmount: 0, nightOutPay: 0, foodAllowancePay: 0, taxablePay: 0, untaxedPay: 0, tax: 0, ni: 0, net: 0, total: 0 };
  const restBeforeMinutes = getRestBeforeMinutes(previousDay, currentDay);
  const previousWorked = previousDay ? getWorkedMinutes(previousDay) : null;
  const reducedCount = getWeeklyReducedRestCountBeforeIndex(days, currentIndex);
  const restBeforeColors = statusPalette(getEffectiveRestStatus(restBeforeMinutes, previousWorked, hasWeeklySplitBreak, reducedCount));
  const suggestedTimes = getSuggestedStartTimes(previousDay ? parseTimeToMinutes(previousDay.finish) : null, reducedCount);
  const previewWeek = useMemo(() => [...taxedWeek].sort((a, b) => DAY_ORDER.indexOf(a.id) - DAY_ORDER.indexOf(b.id)), [taxedWeek]);
  const weekTotals = taxedWeek.reduce<WeekTotals>((acc, day) => { acc.worked += day.workedMinutes || 0; acc.overtime += day.overtimeMinutes || 0; acc.km += day.kmRun || 0; acc.taxable += day.taxablePay || 0; acc.untaxed += day.untaxedPay || 0; acc.tax += day.tax || 0; acc.ni += day.ni || 0; acc.net += day.net || 0; acc.total += day.total || 0; return acc; }, { ...emptyTotals });
  const weekDifference = payslipActualWeek ? parseDecimal(payslipActualWeek) - weekTotals.net : 0;
  const weekBonusSummary = useMemo(() => taxedWeek.reduce((acc, day) => { for (const bonus of day.bonuses) acc[bonus.type] += bonus.qty; if (day.nightOut) acc.nightOuts += 1; return acc; }, { ADR: 0, Genset: 0, Splitter: 0, "Driver Assist": 0, "London Bonus": 0, nightOuts: 0 } as Record<BonusType | "nightOuts", number>), [taxedWeek]);

  function endWeek(type: WeekArchiveType) {
    const finalDays = type === "worked" ? days : days.map((d) => ({ ...d, dayType: type === "holiday" ? "holiday" as DayType : "off" as DayType, start: "", finish: "", bonuses: [], nightOut: false, splitBreak: false }));
    saveWeekData(finalDays, settings, type === "worked" ? payslipActualWeek : "");
    setArchive((prev) => [{ id: Date.now(), label: weekEndingLabel, createdAt: new Date().toISOString(), days: finalDays, settings, totals: type === "worked" ? weekTotals : emptyTotals, payslip: type === "worked" ? payslipActualWeek : "", type }, ...prev]);
    const nextSaturday = toISODate(addDays(fromISODate(getSaturdayDay(days).dateISO), 7));
    const nextWeek = loadSavedWeekDataOrBlank(nextSaturday);
    setDays(nextWeek.days);
    setSettings(nextWeek.settings);
    setPayslipActualWeek(nextWeek.payslipActualWeek || "");
    setCurrentIndex(getFirstIncompleteIndex(nextWeek.days));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return <div style={pageStyle}><style>{`button{transition:transform .08s ease,filter .08s ease,background .08s ease,opacity .08s ease,box-shadow .08s ease;-webkit-tap-highlight-color:transparent;user-select:none}button:active:not(:disabled){transform:scale(.96);filter:brightness(.92)}button:disabled{opacity:.45;cursor:not-allowed}input,select{transition:border-color .12s ease,box-shadow .12s ease,background .12s ease}input:focus,select:focus{border-color:#94a3b8!important;box-shadow:0 0 0 3px rgba(148,163,184,.22)}`}</style><div style={shellStyle}><Header currentDay={currentDay} weekEndingLabel={weekEndingLabel} onWeek={() => setShowWeekView(true)} onSettings={() => setShowSettings(true)} />{weekLocked && <div style={{ margin: 16, marginTop: 0, padding: 12, borderRadius: 14, background: "#fff7ed", border: "1px solid #fdba74", color: "#9a3412" }}><div style={{ fontSize: 14, fontWeight: 900 }}>Saved historical week</div><div style={{ fontSize: 12, marginTop: 4 }}>This week is locked to protect old records.</div><button style={{ ...buttonStyle, marginTop: 10, background: "#9a3412", color: "white", borderColor: "#9a3412" }} onClick={() => setHistoricalEditEnabled(true)}>Unlock editing</button></div>}<div style={{ padding: 16, borderTop: "1px solid #eef2f7" }}><div style={{ padding: 12, borderRadius: 14, background: "#f8fafc", border: "1px solid #eef2f7" }}><div style={{ fontSize: 13, fontWeight: 800, color: "#334155", marginBottom: 8 }}>Week ending Saturday</div><div style={{ display: "grid", gap: 8 }}><input style={inputStyle} type="date" value={selectedSaturday} onChange={(e) => setSelectedSaturday(e.target.value)} /><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><button style={buttonStyle} onClick={loadSelectedWeek}>Load selected</button><button style={{ ...buttonStyle, background: "#0f172a", color: "white", borderColor: "#0f172a" }} onClick={loadCurrentWeek}>Current week</button></div></div></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}><button style={buttonStyle} disabled={currentIndex === orderedIndices[0]} onClick={() => navigateLogical(-1)}>← Prev</button><button style={buttonStyle} disabled={currentIndex === orderedIndices[orderedIndices.length - 1]} onClick={() => navigateLogical(1)}>Next →</button></div></div><div style={sectionStyle}><SectionHeading title="Day type" /><div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}><DayTypeButton label="Work day" variant="work" active={currentDay.dayType === "work"} onClick={() => setCurrentDayType("work")} /><DayTypeButton label="Holiday day" variant="holiday" active={currentDay.dayType === "holiday"} onClick={() => setCurrentDayType("holiday")} /><DayTypeButton label="Off day" variant="off" active={currentDay.dayType === "off"} onClick={() => setCurrentDayType("off")} /></div></div>{currentDay.dayType === "work" && <div style={sectionStyle}><SectionHeading title="Shift" right={currentComputed.weekend ? "Weekend" : undefined} /><div style={{ display: "grid", gap: 12 }}><TimeRow label="Start" value={currentDay.start || ""} placeholder={minutesToTime(suggestedTimes.h11) || "00:00"} helper={getSuggestedStartHelp(suggestedTimes)} onChange={(value) => updateTimeValue("start", value)} onBlur={() => normalizeTimeValue("start")} /><TimeRow label="Finish" value={currentDay.finish || ""} onChange={(value) => updateTimeValue("finish", value)} onBlur={() => normalizeTimeValue("finish")} /></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}><MiniStat label="Worked" value={formatMinutes(currentComputed.workedMinutes)} /><MiniStat label="OT" value={formatMinutes(currentComputed.overtimeMinutes)} /></div>{shiftValidationMessage && <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: "#b91c1c" }}>{shiftValidationMessage}</div>}</div>}<div style={sectionStyle}><SectionHeading title="Kilometres" right={startKmIsSuggested ? "suggested" : undefined} /><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><Field label="Start km"><div style={{ position: "relative" }}><input style={{ ...inputStyle, fontSize: 22, fontWeight: 700, textAlign: "center", color: startKmIsSuggested ? "#94a3b8" : "#0f172a", background: startKmIsSuggested ? "#f8fafc" : "#fff", paddingBottom: startKmIsSuggested ? 24 : 12 }} inputMode="numeric" value={displayStartKm} onChange={(e) => updateKmValue("startKm", e.target.value)} placeholder="Start" />{startKmIsSuggested && <div style={{ position: "absolute", left: 0, right: 0, bottom: 6, textAlign: "center", fontSize: 10, fontWeight: 800, color: "#64748b", pointerEvents: "none" }}>from {startKmSuggestionSource} finish km</div>}</div></Field><Field label="Finish km"><input style={{ ...inputStyle, fontSize: 22, fontWeight: 700, textAlign: "center" }} inputMode="numeric" value={currentDay.finishKm || ""} onChange={(e) => updateKmValue("finishKm", e.target.value)} placeholder="Finish" /></Field></div><div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>{startKmIsSuggested ? `Grey start km is suggested from ${startKmSuggestionSource}. Type over it if it is wrong.` : "Start km can be edited manually."}</div><div style={{ marginTop: 12 }}><MiniStat label="KM run" value={currentComputed.kmRun ?? "—"} /></div></div>{currentDay.dayType === "work" && <div style={{ ...sectionStyle, background: restBeforeColors.bg }}><SectionHeading title="Rest from previous day" /><RestCard value={formatMinutes(restBeforeMinutes)} colors={restBeforeColors} />{currentIndex === orderedIndices[0] && <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>No previous day in this week.</div>}</div>}{currentDay.dayType === "holiday" && <div style={sectionStyle}><SectionHeading title="Holiday pay" right="taxed" /><input style={inputStyle} type="text" inputMode="decimal" value={currentDay.holidayPay || ""} onChange={(e) => updateCurrentDay("holidayPay", e.target.value)} placeholder="0.00" /></div>}{currentDay.dayType === "work" && <div style={sectionStyle}><div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}><ToggleRow label="Split break" variant="warning" right={hasWeeklySplitBreak ? "Week active" : undefined} value={currentDay.splitBreak} onChange={(checked) => updateCurrentDay("splitBreak", checked)} /><ToggleRow label="Night out" variant="success" value={currentDay.nightOut} onChange={(checked) => updateCurrentDay("nightOut", checked)} /></div></div>}{currentDay.dayType === "work" && <div style={sectionStyle}><SectionHeading title="Bonuses" />{!showBonusForm && <button style={{ ...buttonStyle, background: "#0f172a", color: "white", borderColor: "#0f172a" }} onClick={() => setShowBonusForm(true)}>+ Add bonus</button>}{showBonusForm && <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 88px", gap: 8 }}><select style={inputStyle} value={draftBonusType} onChange={(e) => setDraftBonusType(sanitizeBonusType(e.target.value))}>{BONUS_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select><input style={inputStyle} inputMode="numeric" value={draftBonusQty} onChange={(e) => setDraftBonusQty(digitsOnly(e.target.value))} /><button style={{ ...buttonStyle, background: "#0f172a", color: "white", borderColor: "#0f172a" }} onClick={addBonus}>Add</button></div>}<div style={{ display: "grid", gap: 8, marginTop: 12 }}>{currentDay.bonuses.length === 0 && <div style={{ fontSize: 14, color: "#64748b" }}>No bonuses added.</div>}{currentDay.bonuses.map((bonus) => <BonusRow key={bonus.id} bonus={bonus} rate={settings.bonusRates[bonus.type]} onDelete={() => removeBonus(bonus.id)} />)}</div></div>}<SummarySection currentComputed={currentComputed} /><div style={{ ...sectionStyle, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><button style={{ ...buttonStyle, background: "#0f172a", color: "white", borderColor: "#0f172a" }} onClick={saveAndGo}>Save & Next</button><button style={buttonStyle} onClick={() => setShowWeekView(true)}>Week View</button></div>{showSettings && <SettingsModal settings={settings} setSettings={setSettings} days={days} setDays={setDays} archive={archive} setArchive={setArchive} payslipActualWeek={payslipActualWeek} setPayslipActualWeek={setPayslipActualWeek} setCurrentIndex={setCurrentIndex} setSelectedSaturday={setSelectedSaturday} setHistoricalEditEnabled={setHistoricalEditEnabled} onClose={() => setShowSettings(false)} />}{showWeekView && <WeekViewModal weekEndingLabel={weekEndingLabel} weekTotals={weekTotals} payslipActualWeek={payslipActualWeek} setPayslipActualWeek={setPayslipActualWeek} weekDifference={weekDifference} weekBonusSummary={weekBonusSummary} previewWeek={previewWeek} taxedWeek={taxedWeek} setCurrentIndex={setCurrentIndex} close={() => setShowWeekView(false)} endWeek={endWeek} />}</div></div>;
}

function Header({ currentDay, weekEndingLabel, onWeek, onSettings }: { currentDay: DayRecord; weekEndingLabel: string; onWeek: () => void; onSettings: () => void }) { return <div style={{ padding: 16 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}><div><div style={{ fontSize: 12, color: "#64748b" }}>Current day</div><div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{currentDay.dayName}</div><div style={{ fontSize: 24, color: "#0f172a", fontWeight: 900, marginTop: 4 }}>{currentDay.dateLabel}</div><div style={{ fontSize: 15, color: "#334155", fontWeight: 800, marginTop: 8 }}>{weekEndingLabel}</div></div><div style={{ display: "flex", gap: 8 }}><button style={buttonStyle} onClick={onWeek}>Week</button><button style={buttonStyle} onClick={onSettings}>Settings</button></div></div></div>; }
function SectionHeading({ title, right }: { title: string; right?: string }) { return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}><div style={{ fontSize: 15, fontWeight: 900 }}>{title}</div>{right && <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b" }}>{right}</div>}</div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label style={{ display: "grid", gap: 6 }}><div style={{ fontSize: 13, fontWeight: 800, color: "#334155" }}>{label}</div>{children}</label>; }
function TimeRow({ label, value, onChange, onBlur, placeholder = "00:00", helper }: { label: string; value: string; onChange: (value: string) => void; onBlur: () => void; placeholder?: string; helper?: string }) { return <Field label={label}><input style={{ ...inputStyle, fontSize: 28, fontWeight: 900, textAlign: "center", letterSpacing: 1 }} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} />{helper && <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, color: helper.includes("limit") ? "#b91c1c" : "#166534" }}>{helper}</div>}</Field>; }
function MiniStat({ label, value }: { label: string; value: React.ReactNode }) { return <div style={{ padding: 12, borderRadius: 14, border: "1px solid #eef2f7", background: "#f8fafc" }}><div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>{label}</div><div style={{ fontSize: 17, fontWeight: 900, marginTop: 3 }}>{value}</div></div>; }
function RestCard({ value, colors }: { value: string; colors: { bg: string; border: string; text: string; label: string } }) { return <div style={{ padding: 12, borderRadius: 14, border: `1px solid ${colors.border}`, background: "rgba(255,255,255,0.65)", color: colors.text }}><div style={{ fontSize: 12, fontWeight: 800 }}>{colors.label}</div><div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{value}</div></div>; }

type ToggleVariant = "danger" | "warning" | "success";
function ToggleRow({ label, value, onChange, right, variant }: { label: string; value: boolean; onChange: (checked: boolean) => void; right?: string; variant: ToggleVariant }) { const palettes: Record<ToggleVariant, { bg: string; border: string; text: string; shadow: string }> = { danger: { bg: "linear-gradient(135deg,#ffffff 0%,#fee2e2 100%)", border: "#ef4444", text: "#991b1b", shadow: "inset 0 3px 8px rgba(153,27,27,0.22)" }, warning: { bg: "linear-gradient(135deg,#ffffff 0%,#fed7aa 100%)", border: "#f97316", text: "#9a3412", shadow: "inset 0 3px 8px rgba(154,52,18,0.20)" }, success: { bg: "linear-gradient(135deg,#ffffff 0%,#dcfce7 100%)", border: "#22c55e", text: "#166534", shadow: "inset 0 3px 8px rgba(22,101,52,0.20)" } }; const p = palettes[variant]; const style: React.CSSProperties = value ? { ...buttonStyle, width: "100%", textAlign: "left", background: p.bg, border: `2px solid ${p.border}`, color: p.text, boxShadow: p.shadow, transform: "translateY(2px)", padding: "13px 14px" } : { ...buttonStyle, width: "100%", textAlign: "left", background: "#f8fafc", border: "1px solid #cbd5e1", color: "#475569", boxShadow: "0 2px 0 #cbd5e1", padding: "13px 14px" }; return <button type="button" style={style} onClick={() => onChange(!value)}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}><div><div style={{ fontSize: 15, fontWeight: 900 }}>{label}</div>{right && <div style={{ marginTop: 3, fontSize: 11, fontWeight: 800, opacity: 0.8 }}>{right}</div>}</div><div style={{ fontSize: 13, fontWeight: 950, letterSpacing: 0.6 }}>{value ? "ON" : "OFF"}</div></div></button>; }

type DayButtonVariant = "work" | "holiday" | "off";
function DayTypeButton({ label, active, onClick, variant }: { label: string; active: boolean; onClick: () => void; variant: DayButtonVariant }) { const palettes: Record<DayButtonVariant, { bg: string; border: string; text: string; hint: string }> = { work: { bg: "linear-gradient(135deg,#ffffff 0%,#dcfce7 100%)", border: "#22c55e", text: "#166534", hint: "hours + extras" }, holiday: { bg: "linear-gradient(135deg,#ffffff 0%,#fed7aa 100%)", border: "#f97316", text: "#9a3412", hint: "paid, no shift" }, off: { bg: "linear-gradient(135deg,#ffffff 0%,#fee2e2 100%)", border: "#ef4444", text: "#991b1b", hint: "no pay" } }; const p = palettes[variant]; const style: React.CSSProperties = active ? { ...buttonStyle, width: "100%", textAlign: "left", background: p.bg, border: `2px solid ${p.border}`, color: p.text, boxShadow: "inset 0 4px 10px rgba(15,23,42,0.16)", transform: "translateY(2px)", padding: "14px 14px" } : { ...buttonStyle, width: "100%", textAlign: "left", background: "#f8fafc", border: "1px solid #cbd5e1", color: "#475569", boxShadow: "0 2px 0 #cbd5e1", padding: "14px 14px" }; return <button type="button" style={style} onClick={onClick}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}><div><div style={{ fontSize: 15, fontWeight: 950 }}>{label}</div><div style={{ marginTop: 3, fontSize: 11, fontWeight: 800, opacity: 0.75 }}>{p.hint}</div></div><div style={{ fontSize: 13, fontWeight: 950 }}>{active ? "SELECTED" : "—"}</div></div></button>; }

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) { return <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", fontSize: strong ? 16 : 14, fontWeight: strong ? 900 : 600 }}><div style={{ color: strong ? "#0f172a" : "#475569" }}>{label}</div><div>{value}</div></div>; }
function BonusRow({ bonus, rate, onDelete }: { bonus: BonusEntry; rate: string; onDelete: () => void }) { return <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "10px 0", borderTop: "1px solid #eef2f7" }}><div><div style={{ fontWeight: 600 }}>{bonus.type} × {bonus.qty}</div><div style={{ marginTop: 2, fontSize: 13, color: "#64748b" }}>{formatMoney(bonus.qty * parseDecimal(rate))}</div></div><button style={{ ...buttonStyle, padding: "8px 12px", color: "#b91c1c" }} onClick={onDelete}>Delete</button></div>; }
function SummarySection({ currentComputed }: { currentComputed: ComputedDay }) { const bonusText = currentComputed.bonuses.length ? currentComputed.bonuses.map((b) => `${b.type} x${b.qty}`).join(", ") : "—"; return <div style={sectionStyle}><SectionHeading title="Day summary" /><Row label="Hours" value={formatMinutes(currentComputed.workedMinutes)} /><Row label="Overtime" value={formatMinutes(currentComputed.overtimeMinutes)} /><Row label="KM" value={currentComputed.kmRun == null ? "—" : String(currentComputed.kmRun)} /><Row label="Bonuses" value={bonusText} /><Row label="Night out" value={currentComputed.nightOut ? "Yes" : "No"} /></div>; }
function SummaryPair({ label, value }: { label: string; value: string }) { return <><div style={{ fontSize: 14, fontWeight: 700 }}>{label}</div><div style={{ fontSize: 14, fontWeight: 800, textAlign: "right" }}>{value}</div></>; }
function SettingsInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label style={{ display: "grid", gap: 6, marginBottom: 10 }}><div style={{ fontSize: 13, fontWeight: 800, color: "#334155" }}>{label}</div><input style={inputStyle} type="text" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} /></label>; }
function SettingsModal({ settings, setSettings, days, setDays, archive, setArchive, payslipActualWeek, setPayslipActualWeek, setCurrentIndex, setSelectedSaturday, setHistoricalEditEnabled, onClose }: { settings: SettingsState; setSettings: React.Dispatch<React.SetStateAction<SettingsState>>; days: DayRecord[]; setDays: React.Dispatch<React.SetStateAction<DayRecord[]>>; archive: any[]; setArchive: React.Dispatch<React.SetStateAction<any[]>>; payslipActualWeek: string; setPayslipActualWeek: React.Dispatch<React.SetStateAction<string>>; setCurrentIndex: React.Dispatch<React.SetStateAction<number>>; setSelectedSaturday: React.Dispatch<React.SetStateAction<string>>; setHistoricalEditEnabled: React.Dispatch<React.SetStateAction<boolean>>; onClose: () => void }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  return <Overlay onClose={onClose}><ModalCard><ModalTitle>Settings</ModalTitle><div style={{ marginBottom: 14, padding: 12, borderRadius: 14, border: "1px solid #dbe3ee", background: "#f8fafc" }}><SectionHeading title="Backup / Restore" right="recommended" /><div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.35, marginBottom: 10 }}>Save a copy of all weeks, current entries, settings, archive, and payslip comparison. Restore it if Edge data is cleared or you move to another computer.</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><button style={{ ...buttonStyle, background: "#0f172a", color: "white", borderColor: "#0f172a" }} onClick={() => downloadDriverBackup(days, settings, payslipActualWeek, archive)}>Backup</button><button style={buttonStyle} onClick={() => fileInputRef.current?.click()}>Restore</button></div><input ref={fileInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0]; if (file) restoreDriverBackupFile(file, { setDays, setSettings, setPayslipActualWeek, setArchive, setCurrentIndex, setSelectedSaturday, setHistoricalEditEnabled, onDone: onClose }); e.currentTarget.value = ""; }} /></div><SectionHeading title="Pay rates" /><SettingsInput label="Weekday pay rate" value={settings.weekdayRate} onChange={(v) => setSettings({ ...settings, weekdayRate: v })} /><SettingsInput label="Weekend pay rate" value={settings.weekendRate} onChange={(v) => setSettings({ ...settings, weekendRate: v })} /><SettingsInput label="Overtime threshold (hours)" value={settings.overtimeThresholdHours} onChange={(v) => setSettings({ ...settings, overtimeThresholdHours: v })} /><SettingsInput label="Overtime pay rate" value={settings.overtimeRate} onChange={(v) => setSettings({ ...settings, overtimeRate: v })} /><SettingsInput label="Food allowance per worked day" value={settings.foodAllowanceRate} onChange={(v) => setSettings({ ...settings, foodAllowanceRate: v })} /><SettingsInput label="Night out pay" value={settings.nightOutRate} onChange={(v) => setSettings({ ...settings, nightOutRate: v })} /><SectionHeading title="Bonus pay rates" />{BONUS_TYPES.map((bonusType) => <SettingsInput key={bonusType} label={bonusType} value={settings.bonusRates[bonusType]} onChange={(v) => setSettings({ ...settings, bonusRates: { ...settings.bonusRates, [bonusType]: v } })} />)}<button style={{ ...buttonStyle, width: "100%", marginTop: 8, background: "#0f172a", color: "white", borderColor: "#0f172a" }} onClick={onClose}>Done</button></ModalCard></Overlay>;
}
function WeekViewModal(props: { weekEndingLabel: string; weekTotals: WeekTotals; payslipActualWeek: string; setPayslipActualWeek: (value: string) => void; weekDifference: number; weekBonusSummary: Record<BonusType | "nightOuts", number>; previewWeek: ComputedDay[]; taxedWeek: ComputedDay[]; setCurrentIndex: (index: number) => void; close: () => void; endWeek: (type: WeekArchiveType) => void }) {
  const p = props;
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const differenceStyle = getDifferenceStyle(p.weekDifference);
  const hasPayslip = Boolean(p.payslipActualWeek);
  const splitDays = p.previewWeek.filter((day) => day.splitBreak);
  let reducedRestCount = 0;
  p.previewWeek.forEach((day, index) => {
    if (index === 0) return;
    const previous = p.previewWeek[index - 1];
    const restMinutes = getRestBeforeMinutes(previous, day);
    const previousWorked = getWorkedMinutes(previous);
    const status = getEffectiveRestStatus(restMinutes, previousWorked, p.previewWeek.some((d) => d.splitBreak), reducedRestCount);
    if (status === "reduced") reducedRestCount += 1;
  });
  const totalBasePay = p.previewWeek.reduce((sum, day) => sum + day.basePay, 0);
  const totalOvertimePay = p.previewWeek.reduce((sum, day) => sum + day.overtimePay, 0);
  const totalBonusPay = p.previewWeek.reduce((sum, day) => sum + day.bonusPay, 0);
  const totalFood = p.previewWeek.reduce((sum, day) => sum + day.foodAllowancePay, 0);
  const totalNightOut = p.previewWeek.reduce((sum, day) => sum + day.nightOutPay, 0);
  const closeTypeStyle = { ...buttonStyle, fontWeight: 900 };

  const bonusTextForDay = (day: ComputedDay) => day.bonuses.length ? day.bonuses.map((b) => `${b.type} x${b.qty}`).join(", ") : "—";

  if (showCloseConfirm) {
    return <Overlay onClose={() => setShowCloseConfirm(false)}><ModalCard><ModalTitle>End Week Preview</ModalTitle><div style={{ fontSize: 14, fontWeight: 800, color: "#334155", marginBottom: 12 }}>{p.weekEndingLabel}</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><MiniStat label="Total hours" value={formatMinutes(p.weekTotals.worked)} /><MiniStat label="KM" value={String(p.weekTotals.km)} /><MiniStat label="Estimated net" value={formatMoney(p.weekTotals.net)} /><MiniStat label="Payslip net" value={hasPayslip ? formatMoney(parseDecimal(p.payslipActualWeek)) : "—"} /><MiniStat label="Reduced rests" value={String(reducedRestCount)} /><MiniStat label="Split rests" value={String(splitDays.length)} /></div><div style={{ ...differenceStyle, borderRadius: 14, padding: 12, marginTop: 12 }}><div style={{ fontSize: 12, marginBottom: 4 }}>Difference</div><div style={{ fontSize: 22, fontWeight: 900 }}>{hasPayslip ? formatMoney(p.weekDifference) : "—"}</div></div><div style={{ marginTop: 12, padding: 12, borderRadius: 14, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 12, color: "#475569", lineHeight: 1.35 }}>Confirming will close this week, save an automatic backup, and open the next week. Choose how to mark the remaining days.</div><div style={{ display: "grid", gap: 8, marginTop: 12 }}><button style={{ ...closeTypeStyle, background: "#0f172a", color: "white", borderColor: "#0f172a" }} onClick={() => p.endWeek("worked")}>Confirm & Close Week</button><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><button style={closeTypeStyle} onClick={() => p.endWeek("off")}>Remaining Off</button><button style={closeTypeStyle} onClick={() => p.endWeek("holiday")}>Remaining Holiday</button></div><button style={buttonStyle} onClick={() => setShowCloseConfirm(false)}>Back</button></div></ModalCard></Overlay>;
  }

  return <Overlay onClose={p.close}><ModalCard><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}><div><ModalTitle>Week Preview</ModalTitle><div style={{ fontSize: 14, fontWeight: 800, color: "#334155", marginTop: 4 }}>{p.weekEndingLabel}</div></div><button style={{ ...buttonStyle, padding: "8px 12px" }} onClick={p.close}>Close</button></div><div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, marginTop: 10 }}><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}><MiniStat label="Estimated Net" value={formatMoney(p.weekTotals.net)} /><label style={{ ...inputStyle, padding: 8, display: "grid", gap: 2 }}><div style={{ fontSize: 10, fontWeight: 900, color: "#64748b", textTransform: "uppercase" }}>Payslip Net</div><input style={{ border: 0, outline: 0, background: "transparent", fontSize: 18, fontWeight: 900, textAlign: "center", width: "100%" }} type="text" inputMode="decimal" value={p.payslipActualWeek} onChange={(e) => p.setPayslipActualWeek(e.target.value)} placeholder="0.00" /></label><div style={{ ...differenceStyle, borderRadius: 14, padding: 8, textAlign: "center" }}><div style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>Difference</div><div style={{ fontSize: 18, fontWeight: 900 }}>{hasPayslip ? formatMoney(p.weekDifference) : "—"}</div></div></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}><MiniStat label="Hours" value={formatMinutes(p.weekTotals.worked)} /><MiniStat label="OT" value={formatMinutes(p.weekTotals.overtime)} /><MiniStat label="KM" value={String(p.weekTotals.km)} /></div></div><div style={{ marginTop: 12 }}><SectionHeading title="Days" right="no £ here" />{p.previewWeek.map((day) => { const originalIndex = p.taxedWeek.findIndex((d) => d.id === day.id); const isWorked = day.dayType === "work" && day.workedMinutes != null; return <button key={day.id} onClick={() => { p.setCurrentIndex(originalIndex); p.close(); window.scrollTo({ top: 0, behavior: "smooth" }); }} style={{ ...buttonStyle, display: "grid", gap: 5, textAlign: "left", padding: 12, marginBottom: 8, background: day.splitBreak ? "#fefce8" : "#fff" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><div style={{ fontWeight: 900, fontSize: 16 }}>{day.dayName} · {day.dateLabel}</div>{day.splitBreak && <span style={{ padding: "2px 8px", borderRadius: 999, background: "#fef3c7", color: "#92400e", fontSize: 11, fontWeight: 900 }}>SR</span>}</div><div style={{ fontSize: 13, color: "#475569", fontWeight: 700 }}>{day.dayType === "holiday" ? "Holiday" : day.dayType === "off" ? "Off" : `${normalizeTime(day.start) || "—"} → ${normalizeTime(day.finish) || "—"}`}</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, fontSize: 12, color: "#0f172a" }}><span>Hours: <b>{formatMinutes(day.workedMinutes)}</b></span><span>OT: <b>{formatMinutes(day.overtimeMinutes)}</b></span><span>KM: <b>{day.kmRun ?? "—"}</b></span></div>{isWorked && <div style={{ fontSize: 12, color: "#64748b" }}>Bonuses: {bonusTextForDay(day)}</div>}</button>; })}</div><button style={{ ...buttonStyle, width: "100%", marginTop: 4, background: showBreakdown ? "#e2e8f0" : "#f8fafc" }} onClick={() => setShowBreakdown((value) => !value)}>{showBreakdown ? "Hide breakdown" : "Show breakdown"}</button>{showBreakdown && <div style={{ marginTop: 10, padding: 12, borderRadius: 14, border: "1px solid #eef2f7", background: "#f8fafc" }}><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 7, columnGap: 10 }}><SummaryPair label="Base pay" value={formatMoney(totalBasePay)} /><SummaryPair label="Overtime" value={`${formatMinutes(p.weekTotals.overtime)} × rate = ${formatMoney(totalOvertimePay)}`} /><SummaryPair label="Bonuses" value={formatMoney(totalBonusPay)} /><SummaryPair label="Food" value={formatMoney(totalFood)} /><SummaryPair label="Night out" value={formatMoney(totalNightOut)} /><SummaryPair label="Tax" value={`- ${formatMoney(p.weekTotals.tax)}`} /><SummaryPair label="NI" value={`- ${formatMoney(p.weekTotals.ni)}`} /><SummaryPair label="Net" value={formatMoney(p.weekTotals.net)} /><SummaryPair label="Split rests" value={splitDays.length ? splitDays.map((d) => d.dayName).join(", ") : "0"} /></div></div>}<div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><button style={buttonStyle} onClick={p.close}>Back</button><button style={{ ...buttonStyle, background: "#0f172a", color: "white", borderColor: "#0f172a", fontWeight: 900 }} onClick={() => setShowCloseConfirm(true)}>End Week</button></div></ModalCard></Overlay>;
}
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) { return <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", padding: 12, zIndex: 100, overflow: "auto" }} onMouseDown={onClose}><div onMouseDown={(e) => e.stopPropagation()}>{children}</div></div>; }
function ModalCard({ children }: { children: React.ReactNode }) { return <div style={{ maxWidth: 430, margin: "24px auto", background: "white", borderRadius: 22, padding: 16, border: "1px solid #e5e7eb", boxShadow: "0 20px 50px rgba(15,23,42,0.25)" }}>{children}</div>; }
function ModalTitle({ children }: { children: React.ReactNode }) { return <div style={{ fontSize: 24, fontWeight: 900, color: "#0f172a", marginBottom: 12 }}>{children}</div>; }
