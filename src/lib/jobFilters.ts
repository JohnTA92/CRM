// Pure, dependency-free Jobs-list filtering logic — mirrors the style of
// src/lib/customerMatching.ts / src/lib/scheduling.ts. No business timezone is
// stored anywhere in this app (confirmed absent from every table), so all date
// bucketing here is explicit UTC, matching the existing convention already
// disclosed in src/lib/reporting.ts / RevenuePage.tsx ("Dates use UTC").

export type DateRangePreset = "all" | "last30" | "last90" | "thisYear" | "lastYear" | "custom";
export type StatusTab = "all" | "overdue" | "upcoming" | "done" | "paid";
export type JobTypeFilter = "all" | "recurring" | "oneoff";

export interface DateRange {
  /** Inclusive start, as YYYY-MM-DD, or null for no lower bound. */
  startISO: string | null;
  /** Exclusive end (the day AFTER the last included day), as YYYY-MM-DD, or null for no upper bound. */
  endExclusiveISO: string | null;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addUTCDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

export function todayUTC(): string {
  return toISODate(new Date());
}

/**
 * Computes [startISO, endExclusiveISO) for a preset, anchored to the current UTC
 * calendar day. "all" has no bounds at all (distinct from a custom range that
 * happens to be wide) so callers can tell "no filter" apart from "a specific range".
 */
export function computeDateRange(preset: DateRangePreset, custom?: { start: string; end: string }, today: string = todayUTC()): DateRange {
  if (preset === "all") return { startISO: null, endExclusiveISO: null };
  if (preset === "last30") return { startISO: addUTCDays(today, -29), endExclusiveISO: addUTCDays(today, 1) };
  if (preset === "last90") return { startISO: addUTCDays(today, -89), endExclusiveISO: addUTCDays(today, 1) };
  if (preset === "thisYear") {
    const year = today.slice(0, 4);
    return { startISO: `${year}-01-01`, endExclusiveISO: `${Number(year) + 1}-01-01` };
  }
  if (preset === "lastYear") {
    const year = Number(today.slice(0, 4)) - 1;
    return { startISO: `${year}-01-01`, endExclusiveISO: `${year + 1}-01-01` };
  }
  // custom: inclusive start, exclusive day-after-end (e.g. Oct 1 - Oct 19 means
  // Oct 1 00:00 UTC through, but excluding, Oct 20 00:00 UTC).
  if (!custom || !custom.start || !custom.end) return { startISO: null, endExclusiveISO: null };
  return { startISO: custom.start, endExclusiveISO: addUTCDays(custom.end, 1) };
}

/**
 * "All dates" (no bounds) includes unscheduled jobs. Any specific range excludes
 * them — an unscheduled job has no date to fall inside a bound.
 */
export function isJobInDateRange(scheduledDate: string | null | undefined, range: DateRange): boolean {
  if (range.startISO === null && range.endExclusiveISO === null) return true;
  if (!scheduledDate) return false;
  const date = scheduledDate.slice(0, 10);
  if (range.startISO !== null && date < range.startISO) return false;
  if (range.endExclusiveISO !== null && date >= range.endExclusiveISO) return false;
  return true;
}

const OPEN_STATUSES = new Set(["quoted", "scheduled", "in-progress"]);

/**
 * Tab definitions (see the batch plan for the full rationale):
 * - overdue/upcoming only ever apply to open (not draft/cancelled/complete/invoiced)
 *   jobs, so a finished or never-committed job is never misclassified.
 * - done = complete or invoiced.
 * - paid = invoice_id set AND the linked invoice's own status is 'paid' — never
 *   inferred from job status alone.
 * "Schedule Later" is intentionally not implemented: no stored flag distinguishes
 * "deliberately unscheduled" from simply never-scheduled.
 */
export function matchesStatusTab(
  job: { status: string; scheduled_date?: string | null },
  tab: StatusTab,
  today: string = todayUTC(),
  invoiceStatus?: string | null,
): boolean {
  if (tab === "all") return true;
  if (tab === "overdue") {
    return !!job.scheduled_date && job.scheduled_date.slice(0, 10) < today && OPEN_STATUSES.has(job.status);
  }
  if (tab === "upcoming") {
    return !!job.scheduled_date && job.scheduled_date.slice(0, 10) >= today && OPEN_STATUSES.has(job.status);
  }
  if (tab === "done") {
    return job.status === "complete" || job.status === "invoiced";
  }
  if (tab === "paid") {
    return invoiceStatus === "paid";
  }
  return true;
}

// The jobs.recurring column is `not null default 'none'` at the schema level
// (supabase/migrations baseline + every later ALTER TABLE on jobs leaves it
// untouched), so a real row can never be null/absent. Still, this function
// treats a missing value defensively as non-recurring rather than trusting
// that guarantee to hold at every call site forever.
export function matchesJobType(recurring: string | null | undefined, type: JobTypeFilter): boolean {
  const value = recurring ?? "none";
  if (type === "all") return true;
  if (type === "recurring") return value !== "none";
  return value === "none";
}

/**
 * "Crew" as a named team is not a concept in this schema — only individual
 * crew_members exist, referenced by jobs.crew_member_ids. This is the one
 * filterable grouping; "Unassigned" means an empty/missing array.
 */
export function matchesEmployeeFilter(
  crewMemberIds: string[] | null | undefined,
  selectedIds: string[],
  includeUnassigned: boolean,
): boolean {
  if (selectedIds.length === 0 && !includeUnassigned) return true;
  const ids = crewMemberIds ?? [];
  if (ids.length === 0) return includeUnassigned;
  return selectedIds.some((id) => ids.includes(id));
}

export function matchesJobQuery(
  job: { idRef: string; title: string; serviceAddress?: string | null },
  query: string,
  customerName: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    job.idRef.toLowerCase().includes(q) ||
    job.title.toLowerCase().includes(q) ||
    customerName.toLowerCase().includes(q) ||
    (job.serviceAddress ?? "").toLowerCase().includes(q)
  );
}

/** First 8 chars of the uuid, uppercased — a stable reference, never a real sequential number. */
export function formatJobIdRef(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}
