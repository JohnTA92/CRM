import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/design-system/primitives/Badge";
import { Button } from "@/design-system/primitives/Button";
import { estimates, getCustomer, estimateStatusLabel, type EstimateStatus } from "@/data/crm";
import { Plus, FileText } from "lucide-react";

const STATUS_FILTERS: { label: string; value: EstimateStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Approved", value: "approved" },
  { label: "Declined", value: "declined" },
];

function estStatusBadge(s: string) {
  const m: Record<string, "warning" | "success" | "error" | "muted" | "default"> = {
    draft: "muted", sent: "warning", approved: "success", declined: "error", expired: "muted",
  };
  return m[s] ?? "default";
}

export function EstimatesPage() {
  const [statusFilter, setStatusFilter] = useState<EstimateStatus | "all">("all");

  const filtered = estimates.filter(
    (e) => statusFilter === "all" || e.status === statusFilter,
  );

  const totalSent = estimates.filter((e) => e.status === "sent").reduce((s, e) => s + e.total, 0);
  const totalApproved = estimates.filter((e) => e.status === "approved").reduce((s, e) => s + e.total, 0);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-[22px] font-semibold text-ink">Estimates</h1>
          <p className="text-[14px] text-ink-quiet mt-1">
            ${totalSent.toLocaleString()} pending approval · ${totalApproved.toLocaleString()} approved
          </p>
        </div>
        <Button size="sm" className="w-auto gap-1.5">
          <Plus className="w-4 h-4" /> New Estimate
        </Button>
      </div>

      <div className="flex gap-1.5 mb-5 flex-wrap">
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
          <div className="py-16 text-center text-[14px] text-ink-quiet">No estimates found.</div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-2.5 border-b border-paper-deep bg-paper-warm">
              <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide">Customer / Job</p>
              <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide text-right">Total</p>
              <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide text-right">Sent</p>
              <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide text-right">Status</p>
            </div>
            <div className="divide-y divide-paper-deep">
              {filtered.map((est) => {
                const customer = getCustomer(est.customerId);
                return (
                  <Link
                    key={est.id}
                    to={`/estimates/${est.id}`}
                    className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-5 py-4 hover:bg-paper-warm transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-ink truncate">{customer?.name}</p>
                      <p className="text-[12px] text-ink-quiet">
                        Estimate #{est.id} · {est.lineItems.length} items
                      </p>
                    </div>
                    <p className="text-[14px] font-semibold text-ink text-right">${est.total.toLocaleString()}</p>
                    <p className="text-[12px] text-ink-quiet text-right">{est.sentAt ?? "—"}</p>
                    <Badge variant={estStatusBadge(est.status)}>{estimateStatusLabel(est.status)}</Badge>
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
