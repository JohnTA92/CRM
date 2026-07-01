import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Badge } from "@/design-system/primitives/Badge";
import { Button } from "@/design-system/primitives/Button";
import { supabase } from "@/lib/supabase";
import { estimateStatusLabel } from "@/data/crm";
import { ArrowLeft, Send, ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";

function estStatusBadge(s: string): "warning" | "success" | "error" | "muted" | "default" {
  const m: Record<string, "warning" | "success" | "error" | "muted" | "default"> = {
    draft: "muted", sent: "warning", approved: "success", declined: "error", expired: "muted",
  };
  return m[s] ?? "default";
}

export function EstimateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [estimate, setEstimate] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => { if (id) load(id); }, [id]);

  async function load(estId: string) {
    setLoading(true);
    const { data, error } = await supabase.from("estimates").select("*").eq("id", estId).single();
    if (error || !data) { setNotFound(true); setLoading(false); return; }
    setEstimate(data);
    const { data: cust } = await supabase.from("customers").select("*").eq("id", data.customer_id).single();
    if (cust) setCustomer(cust);
    setLoading(false);
  }

  async function updateStatus(status: string) {
    const { data } = await supabase.from("estimates").update({ status }).eq("id", estimate.id).select().single();
    if (data) setEstimate(data);
  }

  if (loading) return (
    <div className="p-8 flex items-center gap-2 text-ink-quiet">
      <Loader2 className="w-4 h-4 animate-spin" /><span className="text-[14px]">Loading estimate…</span>
    </div>
  );

  if (notFound || !estimate) return (
    <div className="p-8">
      <Link to="/estimates" className="inline-flex items-center gap-1.5 text-[13px] text-ink-quiet hover:text-ink mb-4 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Estimates
      </Link>
      <p className="text-[14px] text-ink-quiet">Estimate not found.</p>
    </div>
  );

  const lineItems: any[] = estimate.line_items ?? [];
  const subtotal = lineItems.reduce((s: number, li: any) => s + (li.quantity ?? 0) * (li.unitPrice ?? 0), 0);

  return (
    <div className="p-8 max-w-2xl">
      <Link to="/estimates" className="inline-flex items-center gap-1.5 text-[13px] text-ink-quiet hover:text-ink mb-6 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Estimates
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-semibold text-ink">Estimate</h1>
          <p className="text-[13px] text-ink-quiet mt-1">
            {customer?.name} · Created {estimate.created_at?.split("T")[0]}
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
          {lineItems.map((li: any, i: number) => (
            <div key={li.id ?? i} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3.5 items-center">
              <div>
                <p className="text-[13px] font-medium text-ink">{li.description}</p>
                <p className="text-[11px] text-ink-quiet capitalize">{li.type}</p>
              </div>
              <p className="text-[13px] text-ink-soft text-right">{li.quantity}</p>
              <p className="text-[13px] text-ink-soft text-right">${Number(li.unitPrice).toFixed(2)}</p>
              <p className="text-[13px] font-semibold text-ink text-right">${(li.quantity * li.unitPrice).toFixed(2)}</p>
            </div>
          ))}
        </div>
        <div className="border-t-2 border-paper-deep flex items-center justify-between px-5 py-4">
          <p className="text-[15px] font-bold text-ink">Total</p>
          <p className="text-[22px] font-bold text-ink">${subtotal.toFixed(2)}</p>
        </div>
      </div>

      {estimate.notes && (
        <div className="bg-paper-warm rounded-xl border border-paper-deep px-5 py-4 mb-5">
          <p className="text-[12px] font-semibold text-ink-quiet uppercase tracking-wide mb-1">Notes</p>
          <p className="text-[13px] text-ink-soft">{estimate.notes}</p>
        </div>
      )}

      <div className="flex gap-2">
        {estimate.status === "draft" && (
          <Button size="sm" className="w-auto gap-1.5" onClick={() => updateStatus("sent")}>
            <Send className="w-3.5 h-3.5" /> Send to Customer
          </Button>
        )}
        {estimate.status === "sent" && (
          <>
            <Button size="sm" className="w-auto gap-1.5 bg-moss hover:bg-moss-dark" onClick={() => updateStatus("approved")}>
              <ThumbsUp className="w-3.5 h-3.5" /> Mark Approved
            </Button>
            <Button size="sm" variant="secondary" className="w-auto gap-1.5" onClick={() => updateStatus("declined")}>
              <ThumbsDown className="w-3.5 h-3.5" /> Mark Declined
            </Button>
          </>
        )}
        <Button size="sm" variant={estimate.status === "draft" ? "secondary" : "ghost"} className="w-auto">Edit</Button>
      </div>
    </div>
  );
}
