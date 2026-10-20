// Pure logic for the Outstanding Invoices panel and invoice aging — mirrors
// the style of src/lib/jobFilters.ts / src/lib/dashboardPeriods.ts.

export type AgingBucket = "noDueDate" | "notYetDue" | "under30" | "between30and60" | "over60";

export const AGING_BUCKET_LABELS: Record<AgingBucket, string> = {
  noDueDate: "No due date set",
  notYetDue: "Not yet due",
  under30: "Overdue — under 30 days",
  between30and60: "Overdue — 30–60 days",
  over60: "Overdue — 60+ days",
};

/**
 * Due-date based classification. A prior version of this logic measured "days
 * since sent" (or, failing that, due/created date) and effectively presented
 * that as if it meant overdue. This version only ever measures from the
 * verified due_at field, and keeps "not yet due" and "no due date" as their
 * own distinct buckets rather than folding them into a day-count bucket.
 */
export function classifyInvoiceAging(invoice: { due_at?: string | null }, today: string): AgingBucket {
  const dueDate = invoice.due_at?.slice(0, 10);
  if (!dueDate) return "noDueDate";
  if (dueDate >= today) return "notYetDue";
  const daysOverdue = Math.floor((new Date(`${today}T00:00:00.000Z`).getTime() - new Date(`${dueDate}T00:00:00.000Z`).getTime()) / 86400000);
  if (daysOverdue < 30) return "under30";
  if (daysOverdue < 60) return "between30and60";
  return "over60";
}

export type InvoiceSort = "oldest" | "newest" | "largestBalance";

export interface SortableInvoice {
  id: string;
  dueDate: string | null; // the same "relevant date" shown in the panel, null when unset
  balance: number;
}

/** Oldest/Newest sort by the relevant date, with invoices lacking a due date
 * sorted last (they have no date to be oldest/newest by). Every comparator
 * breaks ties on id so repeated sorts never visibly reorder equal values. */
export function compareInvoices(a: SortableInvoice, b: SortableInvoice, sort: InvoiceSort): number {
  if (sort === "largestBalance") {
    if (b.balance !== a.balance) return b.balance - a.balance;
    return a.id.localeCompare(b.id);
  }
  const aDate = a.dueDate;
  const bDate = b.dueDate;
  if (aDate === null && bDate === null) return a.id.localeCompare(b.id);
  if (aDate === null) return 1; // no due date sorts last regardless of direction
  if (bDate === null) return -1;
  if (aDate !== bDate) {
    return sort === "oldest" ? (aDate < bDate ? -1 : 1) : (aDate > bDate ? -1 : 1);
  }
  return a.id.localeCompare(b.id);
}

export function sortInvoices<T extends SortableInvoice>(invoices: T[], sort: InvoiceSort): T[] {
  return [...invoices].sort((a, b) => compareInvoices(a, b, sort));
}

export function matchesInvoiceSearch(invoice: { idRef: string; customerName: string }, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return invoice.idRef.toLowerCase().includes(q) || invoice.customerName.toLowerCase().includes(q);
}

/** First 8 chars of the uuid, uppercased — a stable reference, never a real invoice number. */
export function formatInvoiceIdRef(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}
