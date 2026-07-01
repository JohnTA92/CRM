import { useParams, Link } from "react-router-dom";
import { Badge } from "@/design-system/primitives/Badge";
import { Button } from "@/design-system/primitives/Button";
import { estimates, getCustomer, estimateStatusLabel } from "@/data/crm";
import { ArrowLeft, Send, ThumbsUp, ThumbsDown } from "lucide-react";

function estStatusBadge(s: string) {
  const m: Record<string, "warning" | "success" | "error" | "muted" | "default"> = {
    draft: "muted", sent: "warning", approved: "success", declined: "error", expired: "muted",
  };
  return m[s] ?? "default";
}

export function EstimateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const estimate = estimates.find((e) => e.id === id);

  if (!estimate) return <div className="p-8 text-ink-quiet">Estimate not found.</div>;

  const customer = getCustomer(estimate.customerId);
  const subtotal = estimate.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);

  return (
    <div className="p-8 max-w-2xl">
      <Link to="/estimates" className="inline-flex items-center gap-1.5 text-[13px] text-ink-quiet hover:text-ink mb-6 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Estimates
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-semibold text-ink">Estimate #{estimate.id}</h1>
          <p className="text-[13px] text-ink-quiet mt-1">
            {customer?.name} · Created {estimate.createdAt}
          </p>
        </div>
        <Badge variant={estStatusBadge(estimate.status)}>{estimateStatusLabel(estimate.status)}</Badge>
      </div>

      <div className="bg-white rounded-xl border border-paper-deep overflow-hidden mb-5">
        <div className="px-5 py-3.5 border-b border-paper-deep bg-paper-warm grid grid-cols-[1fr_auto_auto_auto] gap-4">
          <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide">Description</p>
          <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide text-right">Qty</p>
          <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide text-right">Unit Price</p>
          <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide text-right">Total</p>
        </div>
        <div className="divide-y divide-paper-deep">
          {estimate.lineItems.map((li) => (
            <div key={li.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3.5 items-center">
              <div>
                <p className="text-[13px] font-medium text-ink">{li.description}</p>
                <p className="text-[11px] text-ink-quiet capitalize">{li.type}</p>
              </div>
              <p className="text-[13px] text-ink-soft text-right">{li.quantity}</p>
              <p className="text-[13px] text-ink-soft text-right">${li.unitPrice.toFixed(2)}</p>
              <p className="text-[13px] font-semibold text-ink text-right">${(li.quantity * li.unitPrice).toFixed(2)}</p>
            </div>
          ))}
        </div>
        <div className="border-t-2 border-paper-deep">
          <div className="flex items-center justify-between px-5 py-4">
            <p className="text-[15px] font-bold text-ink">Total</p>
            <p className="text-[22px] font-bold text-ink">${subtotal.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {estimate.notes && (
        <div className="bg-paper-warm rounded-xl border border-paper-deep px-5 py-4 mb-5">
          <p className="text-[12px] font-semibold text-ink-quiet uppercase tracking-wide mb-1">Notes</p>
          <p className="text-[13px] text-ink-soft">{estimate.notes}</p>
        </div>
      )}

      {estimate.expiresAt && (
        <p className="text-[12px] text-ink-quiet mb-5">
          Expires {estimate.expiresAt}
        </p>
      )}

      <div className="flex gap-2">
        {estimate.status === "draft" && (
          <Button size="sm" className="w-auto gap-1.5">
            <Send className="w-3.5 h-3.5" /> Send to Customer
          </Button>
        )}
        {estimate.status === "sent" && (
          <>
            <Button size="sm" className="w-auto gap-1.5 bg-moss hover:bg-moss-dark">
              <ThumbsUp className="w-3.5 h-3.5" /> Mark Approved
            </Button>
            <Button size="sm" variant="secondary" className="w-auto gap-1.5">
              <ThumbsDown className="w-3.5 h-3.5" /> Mark Declined
            </Button>
          </>
        )}
        <Button size="sm" variant={estimate.status === "draft" ? "secondary" : "ghost"} className="w-auto">
          Edit
        </Button>
      </div>
    </div>
  );
}
