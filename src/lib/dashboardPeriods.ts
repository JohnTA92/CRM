// Pure, dependency-free Dashboard period/comparison logic — mirrors the style
// of src/lib/jobFilters.ts. No business timezone is stored anywhere in this
// app (confirmed absent from every table, same finding as the Jobs batch), so
// every boundary here is explicit UTC, matching the existing convention
// already disclosed in RevenuePage.tsx ("Dates use UTC").

export type PeriodPreset =
  | "today" | "thisWeek" | "thisMonth" | "thisQuarter" | "thisYear"
  | "last30" | "last90" | "custom";

export interface DateRange {
  /** Inclusive start, as YYYY-MM-DD. */
  startISO: string;
  /** Exclusive end (the day AFTER the last included day), as YYYY-MM-DD. */
  endExclusiveISO: string;
}

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Today",
  thisWeek: "This Week",
  thisMonth: "This Month",
  thisQuarter: "This Quarter",
  thisYear: "This Year",
  last30: "Last 30 Days",
  last90: "Last 90 Days",
  custom: "Custom Range",
};

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fromISODate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function addUTCDays(iso: string, days: number): string {
  const d = fromISODate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

export function todayUTC(): string {
  return toISODate(new Date());
}

/** Shifts a YYYY-MM-DD string back exactly one calendar year, clamping a
 * nonexistent Feb 29 (in a non-leap comparison year) to Feb 28. */
function shiftYearBack(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const targetYear = y - 1;
  const isLeap = (targetYear % 4 === 0 && targetYear % 100 !== 0) || targetYear % 400 === 0;
  const day = m === 2 && d === 29 && !isLeap ? 28 : d;
  return `${targetYear}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysBetweenISO(startISO: string, endISO: string): number {
  return Math.round((fromISODate(endISO).getTime() - fromISODate(startISO).getTime()) / 86400000);
}

export interface CustomRangeInput {
  start: string;
  end: string;
}

export type PeriodRangeResult =
  | { ok: true; range: DateRange }
  | { ok: false; error: string };

/**
 * Calendar periods run through today, not the full calendar unit: "This Month"
 * is the 1st through today, not the 1st through the last day of the month.
 * Week starts Monday, computed in UTC (not the browser's local getDay()).
 */
export function computePeriodRange(preset: PeriodPreset, custom?: CustomRangeInput, today: string = todayUTC()): PeriodRangeResult {
  const endExclusiveISO = addUTCDays(today, 1);
  if (preset === "today") return { ok: true, range: { startISO: today, endExclusiveISO } };
  if (preset === "thisWeek") {
    const d = fromISODate(today);
    const mondayOffset = (d.getUTCDay() + 6) % 7; // Sun=0..Sat=6 -> days since Monday
    const start = new Date(d);
    start.setUTCDate(start.getUTCDate() - mondayOffset);
    return { ok: true, range: { startISO: toISODate(start), endExclusiveISO } };
  }
  if (preset === "thisMonth") {
    const [y, m] = today.split("-");
    return { ok: true, range: { startISO: `${y}-${m}-01`, endExclusiveISO } };
  }
  if (preset === "thisQuarter") {
    const [y, m] = today.split("-").map(Number);
    const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
    return { ok: true, range: { startISO: `${y}-${String(qStartMonth).padStart(2, "0")}-01`, endExclusiveISO } };
  }
  if (preset === "thisYear") {
    const y = today.slice(0, 4);
    return { ok: true, range: { startISO: `${y}-01-01`, endExclusiveISO } };
  }
  if (preset === "last30") return { ok: true, range: { startISO: addUTCDays(today, -29), endExclusiveISO } };
  if (preset === "last90") return { ok: true, range: { startISO: addUTCDays(today, -89), endExclusiveISO } };
  // custom
  if (!custom || !custom.start || !custom.end) {
    return { ok: false, error: "Choose both a start and an end date." };
  }
  if (custom.start > custom.end) {
    return { ok: false, error: "The start date must be on or before the end date." };
  }
  return { ok: true, range: { startISO: custom.start, endExclusiveISO: addUTCDays(custom.end, 1) } };
}

/**
 * Calendar presets (today/thisWeek/thisMonth/thisQuarter/thisYear): the
 * equivalent elapsed period last year — the exact same calendar dates, shifted
 * back one year (Feb 29 clamped to Feb 28 in a non-leap comparison year).
 * Rolling/custom (last30/last90/custom): the immediately preceding period of
 * the exact same length in days.
 */
export function computeComparisonRange(preset: PeriodPreset, range: DateRange): DateRange {
  const isCalendarPreset = preset === "today" || preset === "thisWeek" || preset === "thisMonth" || preset === "thisQuarter" || preset === "thisYear";
  if (isCalendarPreset) {
    // endExclusiveISO is "last included day + 1"; shift the actual included
    // range (start, lastIncludedDay), not the exclusive bound itself.
    const lastIncludedDay = addUTCDays(range.endExclusiveISO, -1);
    return {
      startISO: shiftYearBack(range.startISO),
      endExclusiveISO: addUTCDays(shiftYearBack(lastIncludedDay), 1),
    };
  }
  const lengthDays = daysBetweenISO(range.startISO, range.endExclusiveISO);
  return {
    startISO: addUTCDays(range.startISO, -lengthDays),
    endExclusiveISO: range.startISO,
  };
}

/** Inclusive start, exclusive end. Accepts a plain date or a timestamp (only
 * the date portion is compared — no timezone reinterpretation). */
export function isDateInRange(value: string | null | undefined, range: DateRange): boolean {
  if (!value) return false;
  const date = value.slice(0, 10);
  return date >= range.startISO && date < range.endExclusiveISO;
}

/** No percentage shown when the comparison denominator is zero. */
export function trendPct(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

function formatMonthDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[m - 1]} ${d}`;
}

/** The actual date range text shown to the user, with an explicit UTC label. */
export function formatRangeLabel(range: DateRange): string {
  const lastIncludedDay = addUTCDays(range.endExclusiveISO, -1);
  const year = lastIncludedDay.slice(0, 4);
  if (range.startISO === lastIncludedDay) {
    return `${formatMonthDay(range.startISO)}, ${year} (UTC)`;
  }
  const startYear = range.startISO.slice(0, 4);
  const startLabel = startYear === year ? formatMonthDay(range.startISO) : `${formatMonthDay(range.startISO)}, ${startYear}`;
  return `${startLabel} – ${formatMonthDay(lastIncludedDay)}, ${year} (UTC)`;
}
