import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/design-system/primitives/Badge";
import { balanceDue, sumMoney } from "@/lib/money";
import { invoiceStatusLabel } from "@/data/crm";
import {
  sortInvoices, matchesInvoiceSearch, formatInvoiceIdRef,
  type InvoiceSort,
} from "@/lib/invoiceAging";
import { Search, X, Receipt } from "lucide-react";

interface RawInvoice {
  id: string;
  customer_id: string;
  status: string;
  due_at?: string | null;
  total?: number;
  paid_total?: number;
  paidTotal?: number;
}

interface OutstandingInvoicesPanelProps {
  invoices: RawInvoice[];
  customerNames: Record<string, string>;
}

function fmt$(n: number) {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function invStatusBadge(s: string): "warning" | "error" | "muted" {
  return s === "overdue" ? "error" : "warning";
}

/**
 * Display and navigation only — no collection, payment, reminder, send, or
 * delete actions anywhere in this panel.
 */
export function OutstandingInvoicesPanel({ invoices, customerNames }: OutstandingInvoicesPanelProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<InvoiceSort>("oldest");

  const rows = useMemo(() => invoices.map((inv) => ({
    id: inv.id,
    idRef: formatInvoiceIdRef(inv.id),
    customerName: customerNames[inv.customer_id] ?? "Unknown customer",
    dueDate: inv.due_at ? inv.due_at.slice(0, 10) : null,
    status: inv.status,
    balance: balanceDue(inv),
  })), [invoices, customerNames]);

  const totalOutstanding = useMemo(() => sumMoney(rows, (r) => r.balance), [rows]);

  const filtered = useMemo(
    () => rows.filter((r) => matchesInvoiceSearch(r, query)),
    [rows, query],
  );
  const sorted = useMemo(() => sortInvoices(filtered, sort), [filtered, sort]);
  const filteredSubtotal = useMemo(() => sumMoney(sorted, (r) => r.balance), [sorted]);
  const searching = query.trim().length > 0;

  return (
    <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-paper-deep bg-paper-warm flex-wrap gap-2">
        <p className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
          <Receipt className="w-4 h-4 text-ink-quiet" /> Outstanding Invoices
          <Badge variant="muted">Current outstanding</Badge>
        </p>
        <p className="text-[13px] font-semibold text-ink">
          {searching ? `${fmt$(filteredSubtotal)} of ${fmt$(totalOutstanding)} total` : `${fmt$(totalOutstanding)} total outstanding`}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-5 text-[13px] text-ink-quiet">No outstanding invoices.</p>
      ) : (
        <>
          <div className="flex gap-2 px-5 py-3 border-b border-paper-deep flex-wrap items-center">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-quiet" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by customer or invoice reference…"
                className="w-full pl-8 pr-8 py-1.5 text-[13px] border border-paper-deep rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-ink-quiet hover:text-ink transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as InvoiceSort)}
              className="px-2.5 py-1.5 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors"
            >
              <option value="oldest">Oldest due date</option>
              <option value="newest">Newest due date</option>
              <option value="largestBalance">Largest balance</option>
            </select>
          </div>

          {sorted.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-[13px] text-ink-quiet mb-1">No invoices match your search.</p>
              <button onClick={() => setQuery("")} className="text-[12px] text-accent hover:underline">Clear search</button>
            </div>
          ) : (
            <div className="divide-y divide-paper-deep">
              {sorted.map((row) => (
                <Link
                  key={row.id}
                  to={`/invoices/${row.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-paper-warm transition-colors"
                >
                  <span
                    title={row.id}
                    className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-mono font-semibold border border-paper-deep bg-paper-warm text-ink-soft flex-shrink-0"
                  >
                    #{row.idRef}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-ink truncate">{row.customerName}</p>
                    <p className="text-[11px] text-ink-quiet">
                      {row.dueDate ? `Due ${row.dueDate}` : "No due date"}
                    </p>
                  </div>
                  <Badge variant={invStatusBadge(row.status)}>{invoiceStatusLabel(row.status as any)}</Badge>
                  <p className="text-[13px] font-semibold text-ink flex-shrink-0 w-20 text-right">{fmt$(row.balance)}</p>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
