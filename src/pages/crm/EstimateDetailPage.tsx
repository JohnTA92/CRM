import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Badge } from "@/design-system/primitives/Badge";
import { Button } from "@/design-system/primitives/Button";
import { supabase } from "@/lib/supabase";
import { estimateStatusLabel } from "@/data/crm";
import { buildEstimateEmail, sendEmail } from "@/lib/email";
import { ArrowLeft, Send, ThumbsUp, ThumbsDown, Loader2, Mail, X, CheckCircle2, AlertCircle } from "lucide-react";

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

  const [showSendModal, setShowSendModal] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => { if (id) load(id); }, [id]);

  async function load(estId: string) {
    setLoading(true);
    const { data, error } = await supabase.from("estimates").select("*").eq("id", estId).single();
    if (error || !data) { setNotFound(true); setLoading(false); return; }
    setEstimate(data);
    const { data: cust } = await supabase.from("customers").select("*").eq("id", data.customer_id).single();
    if (cust) {
      setCustomer(cust);
      setSendTo(cust.email ?? "");
    }
    setLoading(false);
  }

  async function updateStatus(status: string) {
    const updates: any = { status };
    if (status === "sent") updates.sent_at = new Date().toISOString();
    const { data } = await supabase.from("estimates").update(updates).eq("id", estimate.id).select().single();
    if (data) setEstimate(data);
  }

  async function handleSend() {
    if (!sendTo.trim()) return;
    setSending(true);
    setSendResult(null);

    const { subject, html } = buildEstimateEmail({
      to: sendTo,
      customerName: customer?.name ?? "Customer",
      estimateId: estimate.id,
      lineItems: lineItems,
      total: subtotal,
      notes: estimate.notes,
      createdAt: estimate.created_at?.split("T")[0],
    });

    const result = await sendEmail({ to: sendTo, subject, html, type: "estimate", recordId: estimate.id });

    if (result.success) {
      await updateStatus("sent");
      setSendResult({ success: true, message: `Estimate sent to ${sendTo}` });
      setTimeout(() => { setShowSendModal(false); setSendResult(null); }, 2000);
    } else {
      setSendResult({ success: false, message: result.error ?? "Failed to send email" });
    }
    setSending(false);
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
        {(estimate.status === "draft" || estimate.status === "sent") && (
          <Button size="sm" className="w-auto gap-1.5" onClick={() => setShowSendModal(true)}>
            <Mail className="w-3.5 h-3.5" /> Email to Customer
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

      {/* Send modal */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-paper-deep">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#dcfce7] flex items-center justify-center">
                  <Send className="w-4 h-4 text-[#16a34a]" />
                </div>
                <h2 className="text-[15px] font-semibold text-ink">Send Estimate</h2>
              </div>
              <button onClick={() => { setShowSendModal(false); setSendResult(null); }} className="p-1.5 rounded-lg hover:bg-paper-warm text-ink-quiet transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Summary card */}
              <div className="bg-paper-warm rounded-xl border border-paper-deep p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-semibold text-ink">{customer?.name}</p>
                    <p className="text-[12px] text-ink-quiet mt-0.5">{lineItems.length} line item{lineItems.length !== 1 ? "s" : ""}</p>
                  </div>
                  <p className="text-[20px] font-bold text-ink">${subtotal.toFixed(2)}</p>
                </div>
              </div>

              {/* Email field */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet uppercase tracking-wide mb-1.5">
                  Send to
                </label>
                <input
                  type="email"
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                  placeholder="customer@email.com"
                  className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors"
                />
                {!customer?.email && (
                  <p className="text-[12px] text-amber-600 mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    No email on file for this customer — enter one above
                  </p>
                )}
              </div>

              {/* What gets sent */}
              <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl p-4">
                <p className="text-[12px] font-semibold text-[#15803d] mb-2">What the customer receives</p>
                <ul className="space-y-1.5">
                  {["Professional HTML email with all line items", "Itemized pricing and grand total", "Any notes you've added", "Your business name in the sender line"].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-[12px] text-[#166534]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#16a34a] flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {sendResult && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-[13px] font-medium ${
                  sendResult.success
                    ? "bg-[#dcfce7] text-[#15803d] border border-[#bbf7d0]"
                    : "bg-[#fef2f2] text-[#dc2626] border border-[#fecaca]"
                }`}>
                  {sendResult.success
                    ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                  {sendResult.message}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-paper-deep flex gap-2 justify-end">
              <Button variant="secondary" size="sm" className="w-auto" onClick={() => { setShowSendModal(false); setSendResult(null); }}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="w-auto gap-1.5"
                onClick={handleSend}
                disabled={sending || !sendTo.trim()}
              >
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {sending ? "Sending…" : "Send Estimate"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
