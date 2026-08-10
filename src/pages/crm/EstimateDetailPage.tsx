import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Badge } from "@/design-system/primitives/Badge";
import { Button } from "@/design-system/primitives/Button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { estimateStatusLabel } from "@/data/crm";
import { buildEstimateEmail, sendEmail } from "@/lib/email";
import { ArrowLeft, Send, ThumbsUp, ThumbsDown, Loader2, Mail, X, CheckCircle2, AlertCircle, Plus, Trash2, Pencil } from "lucide-react";

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

  const [showEditModal, setShowEditModal] = useState(false);
  const [editItems, setEditItems] = useState<any[]>([]);
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { business } = useAuth();
  const businessId = business?.id ?? "";

  useEffect(() => { if (id) load(id); }, [id]);

  async function load(estId: string) {
    setLoading(true);
    const { data, error } = await supabase.from("estimates").select("*").eq("id", estId).eq("business_id", businessId).single();
    if (error || !data) { setNotFound(true); setLoading(false); return; }
    setEstimate(data);
    const { data: cust } = await supabase.from("customers").select("*").eq("id", data.customer_id).eq("business_id", businessId).single();
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

  function openEdit() {
    setEditItems((estimate.line_items ?? []).map((li: any) => ({ ...li })));
    setEditNotes(estimate.notes ?? "");
    setShowEditModal(true);
  }

  function updateItem(idx: number, field: string, value: string) {
    const stringFields = ["description", "type"];
    setEditItems((prev) => prev.map((li, i) => i === idx ? { ...li, [field]: stringFields.includes(field) ? value : Number(value) } : li));
  }

  function addItem() {
    setEditItems((prev) => [...prev, { id: crypto.randomUUID(), description: "", type: "service", quantity: 1, unitPrice: 0 }]);
  }

  function removeItem(idx: number) {
    setEditItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function saveEdit() {
    setSaving(true);
    const newTotal = editItems.reduce((s: number, li: any) => s + (li.quantity ?? 0) * (li.unitPrice ?? 0), 0);
    const { data } = await supabase.from("estimates")
      .update({ line_items: editItems, notes: editNotes, total: newTotal })
      .eq("id", estimate.id).select().single();
    if (data) setEstimate(data);
    setSaving(false);
    setShowEditModal(false);
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
        {!["approved","declined","expired"].includes(estimate.status) && (
          <Button size="sm" variant={estimate.status === "draft" ? "secondary" : "ghost"} className="w-auto gap-1.5" onClick={openEdit}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        )}
      </div>

      {/* Edit modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-paper-deep flex-shrink-0">
              <h2 className="text-[15px] font-semibold text-ink">Edit Estimate</h2>
              <button onClick={() => setShowEditModal(false)} className="p-1.5 rounded-lg hover:bg-paper-warm text-ink-quiet transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 overflow-y-auto flex-1 space-y-5">
              {/* Line items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[12px] font-semibold text-ink-quiet uppercase tracking-wide">Line Items</p>
                  <button onClick={addItem} className="flex items-center gap-1 text-[12px] font-semibold text-accent hover:text-accent/80 transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Add Item
                  </button>
                </div>
                <div className="space-y-2">
                  {editItems.map((li, idx) => (
                    <div key={li.id ?? idx} className="bg-paper-warm rounded-xl border border-paper-deep p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          value={li.description}
                          onChange={(e) => updateItem(idx, "description", e.target.value)}
                          placeholder="Description"
                          className="flex-1 px-3 py-2 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                        />
                        <button onClick={() => removeItem(idx)} className="p-1.5 rounded-lg hover:bg-red-50 text-ink-quiet hover:text-red-500 transition-colors flex-shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-ink-quiet uppercase tracking-wide mb-1">Type</label>
                          <select
                            value={li.type}
                            onChange={(e) => updateItem(idx, "type", e.target.value)}
                            className="w-full px-2 py-1.5 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/30">
                            <option value="service">Service</option>
                            <option value="material">Material</option>
                            <option value="labor">Labor</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-ink-quiet uppercase tracking-wide mb-1">Qty</label>
                          <input
                            type="number" min="1" value={li.quantity}
                            onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                            className="w-full px-2 py-1.5 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-ink-quiet uppercase tracking-wide mb-1">Unit Price</label>
                          <input
                            type="number" min="0" step="0.01" value={li.unitPrice}
                            onChange={(e) => updateItem(idx, "unitPrice", e.target.value)}
                            className="w-full px-2 py-1.5 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                          />
                        </div>
                      </div>
                      <p className="text-[12px] text-ink-quiet text-right">
                        Line total: <span className="font-semibold text-ink">${(li.quantity * li.unitPrice).toFixed(2)}</span>
                      </p>
                    </div>
                  ))}
                </div>
                {editItems.length > 0 && (
                  <div className="flex items-center justify-between mt-3 px-1">
                    <p className="text-[13px] font-semibold text-ink">Total</p>
                    <p className="text-[18px] font-bold text-ink">
                      ${editItems.reduce((s, li) => s + (li.quantity ?? 0) * (li.unitPrice ?? 0), 0).toFixed(2)}
                    </p>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet uppercase tracking-wide mb-1.5">Notes</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                  placeholder="Optional notes for the customer…"
                  className="w-full px-3 py-2.5 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-paper-deep flex gap-2 justify-end flex-shrink-0">
              <Button variant="secondary" size="sm" className="w-auto" onClick={() => setShowEditModal(false)}>Cancel</Button>
              <Button size="sm" className="w-auto gap-1.5" onClick={saveEdit} disabled={saving}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {saving ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

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
