import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/design-system/primitives/Badge";
import { Button } from "@/design-system/primitives/Button";
import { invoices, getCustomer, invoiceStatusLabel, type InvoiceStatus } from "@/data/crm";
import { Plus, AlertCircle } from "lucide-react";

const STATUS_FILTERS: { label: string; value: InvoiceStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Paid", value: "paid" },
  { label: "Overdue", value: "overdue" },
];

function invStatusBadge(s: string) {
  const m: Record<string, "warning" | "success" | "error" | "muted" | "default"> = {
    draft: "muted", sent: "warning", paid: "success", overdue: "error", voided: "muted",
  };
  return m[s] ?? "default";
}

export function InvoicesPage() {
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");

  const filtered = invoices.filter(
    (i) => statusFilter === "all" || i.status === statusFilter,
  );

  const totalCollected = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.total, 0);
  const totalOutstanding = invoices.filter((i) => ["sent", "overdue"].includes(i.status)).reduce((s, i) => s + i.total, 0);
  const overdue = invoices.filter((i) => i.status === "overdue");

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-[22px] font-semibold text-ink">Invoices</h1>
          <p className="text-[14px] text-ink-quiet mt-1">
            ${totalCollected.toLocaleString()} collected · ${totalOutstanding.toLocaleString()} outstanding
          </p>
        </div>
        <Button size="sm" className="w-auto gap-1.5">
          <Plus className="w-4 h-4" /> New Invoice
        </Button>
      </div>

      {overdue.length > 0 && (
        <div className="bg-[#fff8e1] border border-[#ffe082] rounded-xl px-5 py-3.5 mb-5 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-[#e65100] flex-shrink-0" />
          <p className="text-[13px] text-[#5d3a00] font-medium">
            {overdue.length} overdue invoice{overdue.length > 1 ? "s" : ""} totaling ${overdue.reduce((s, i) => s + i.total, 0).toLocaleString()}
          </p>
        </div>
      )}

      <div className="flex gap-1.5 mb-5">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
              statusFilter === f.value ? "bg-ink text-white" : "bg-paper-warm text-ink-soft hover:bg-paper-dark"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-[14px] text-ink-quiet">No invoices found.</div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-2.5 border-b border-paper-deep bg-paper-warm">
              <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide">Customer</p>
              <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide text-right">Amount</p>
              <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide text-right">Sent</p>
              <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide text-right">Due</p>
              <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide text-right">Status</p>
            </div>
            <div className="divide-y divide-paper-deep">
              {filtered.map((inv) => {
                const customer = getCustomer(inv.customerId);
                return (
                  <Link
                    key={inv.id}
                    to={`/invoices/${inv.id}`}
                    className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center px-5 py-4 hover:bg-paper-warm transition-colors"
                  >
                    <div>
                      <p className="text-[14px] font-semibold text-ink">{customer?.name}</p>
                      <p className="text-[12px] text-ink-quiet">Invoice #{inv.id}</p>
                    </div>
                    <p className="text-[14px] font-semibold text-ink text-right">${inv.total.toLocaleString()}</p>
                    <p className="text-[12px] text-ink-quiet text-right">{inv.sentAt ?? "—"}</p>
                    <p className="text-[12px] text-ink-quiet text-right">{inv.dueAt ?? "—"}</p>
                    <Badge variant={invStatusBadge(inv.status)}>{invoiceStatusLabel(inv.status)}</Badge>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
