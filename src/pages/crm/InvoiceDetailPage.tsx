import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Badge } from "@/design-system/primitives/Badge";
import { Button } from "@/design-system/primitives/Button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { invoiceStatusLabel } from "@/data/crm";
import { buildInvoiceEmail, sendEmail } from "@/lib/email";
import { ArrowLeft, Send, CheckCircle2, CreditCard, Loader2, Mail, X, AlertCircle, Plus, DollarSign, Pencil, Trash2, ExternalLink } from "lucide-react";
import { createPaymentSession } from "@/lib/stripe";

function invStatusBadge(s: string): "warning" | "success" | "error" | "muted" | "default" {
  const m: Record<string, "warning" | "success" | "error" | "muted" | "default"> = {
    draft: "muted", sent: "warning", paid: "success", overdue: "error", voided: "muted",
  };
  return m[s] ?? "default";
}

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { business } = useAuth();
  const businessId = business?.id ?? "";
  const [invoice, setInvoice] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [payments, setPayments] = useState<any[]>([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editItems, setEditItems] = useState<any[]>([]);
  const [editNotes, setEditNotes] = useState("");
  const [editDueAt, setEditDueAt] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [showSendModal, setShowSendModal] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [creatingPaymentLink, setCreatingPaymentLink] = useState(false);
  const [paymentLinkError, setPaymentLinkError] = useState<string | null>(null);

  useEffect(() => { if (id) load(id); }, [id]);
  useEffect(() => {
    supabase.from("company_settings").select("stripe_enabled, stripe_publishable_key").eq("id", businessId).single()
      .then(({ data }) => {
        if (data?.stripe_enabled && data?.stripe_publishable_key?.startsWith("pk_")) setStripeEnabled(true);
      });
  }, [businessId]);

  async function load(invId: string) {
    setLoading(true);
    const { data, error } = await supabase.from("invoices").select("*").eq("id", invId).eq("business_id", businessId).single();
    if (error || !data) { setNotFound(true); setLoading(false); return; }
    setInvoice(data);
    const { data: cust } = await supabase.from("customers").select("*").eq("id", data.customer_id).eq("business_id", businessId).single();
    if (cust) {
      setCustomer(cust);
      setSendTo(cust.email ?? "");
    }
    const { data: pmts } = await supabase
      .from("invoice_payments")
      .select("*")
      .eq("invoice_id", invId)
      .eq("business_id", businessId)
      .order("paid_at", { ascending: true });
    if (pmts) setPayments(pmts);
    setLoading(false);
  }

  async function handleLogPayment() {
    const amt = parseFloat(paymentAmount);
    if (!amt || amt <= 0) { setPaymentError("Enter a valid amount."); return; }
    setPaymentSaving(true);
    setPaymentError(null);
    const { data: pmt, error } = await supabase.from("invoice_payments").insert({
      invoice_id: invoice.id,
      business_id: businessId,
      amount: amt,
      method: paymentMethod,
      note: paymentNote.trim() || null,
      paid_at: new Date().toISOString(),
    }).select().single();
    if (error) { setPaymentError(error.message); setPaymentSaving(false); return; }
    const newPayments = [...payments, pmt];
    setPayments(newPayments);
    const totalPaid = newPayments.reduce((s: number, p: any) => s + (p.amount ?? 0), 0);
    if (totalPaid >= (invoice.total ?? 0)) {
      await updateStatus("paid");
    }
    setPaymentAmount("");
    setPaymentMethod("cash");
    setPaymentNote("");
    setPaymentSaving(false);
    setShowPaymentModal(false);
  }

  async function updateStatus(status: string) {
    const updates: any = { status };
    if (status === "sent") updates.sent_at = new Date().toISOString();
    if (status === "paid") updates.paid_at = new Date().toISOString();
    const { data } = await supabase.from("invoices").update(updates).eq("id", invoice.id).select().single();
    if (data) setInvoice(data);
  }

  function openEdit() {
    setEditItems((invoice.line_items ?? []).map((li: any) => ({ ...li })));
    setEditNotes(invoice.notes ?? "");
    setEditDueAt(invoice.due_at ?? "");
    setShowEditModal(true);
  }
  function updateEditItem(idx: number, field: string, value: string) {
    setEditItems((prev) => prev.map((li, i) => i === idx ? { ...li, [field]: field === "description" ? value : Number(value) } : li));
  }
  async function saveEdit() {
    setEditSaving(true);
    const newTotal = editItems.reduce((s: number, li: any) => s + (li.quantity ?? 0) * (li.unitPrice ?? 0), 0);
    const { data } = await supabase.from("invoices")
      .update({ line_items: editItems, notes: editNotes || null, due_at: editDueAt || null, total: newTotal })
      .eq("id", invoice.id).select().single();
    if (data) setInvoice(data);
    setEditSaving(false);
    setShowEditModal(false);
  }

  async function handleCreatePaymentLink() {
    setCreatingPaymentLink(true);
    setPaymentLinkError(null);
    const { url, error } = await createPaymentSession(invoice.id);
    setCreatingPaymentLink(false);
    if (error) { setPaymentLinkError(error); return; }
    if (url) window.open(url, "_blank");
  }

  async function handleSend() {
    if (!sendTo.trim()) return;
    setSending(true);
    setSendResult(null);

    const { subject, html } = buildInvoiceEmail({
      to: sendTo,
      customerName: customer?.name ?? "Customer",
      invoiceId: invoice.id,
      lineItems: lineItems,
      total: subtotal,
      dueAt: invoice.due_at,
      notes: invoice.notes,
    });

    const result = await sendEmail({ to: sendTo, subject, html, type: "invoice", recordId: invoice.id });

    if (result.success) {
      await updateStatus("sent");
      setSendResult({ success: true, message: `Invoice sent to ${sendTo}` });
      setTimeout(() => { setShowSendModal(false); setSendResult(null); }, 2000);
    } else {
      setSendResult({ success: false, message: result.error ?? "Failed to send email" });
    }
    setSending(false);
  }

  if (loading) return (
    <div className="p-8 flex items-center gap-2 text-ink-quiet">
      <Loader2 className="w-4 h-4 animate-spin" /><span className="text-[14px]">Loading invoice…</span>
    </div>
  );

  if (notFound || !invoice) return (
    <div className="p-8">
      <Link to="/invoices" className="inline-flex items-center gap-1.5 text-[13px] text-ink-quiet hover:text-ink mb-4 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Invoices
      </Link>
      <p className="text-[14px] text-ink-quiet">Invoice not found.</p>
    </div>
  );

  const lineItems: any[] = invoice.line_items ?? [];
  const subtotal = invoice.total ?? lineItems.reduce((s: number, li: any) => s + (li.quantity ?? 0) * (li.unitPrice ?? 0), 0);
  const totalPaid = payments.reduce((s: number, p: any) => s + (p.amount ?? 0), 0);
  const balanceDue = Math.max(0, subtotal - totalPaid);
  const PAYMENT_METHODS = ["cash", "check", "card", "venmo", "zelle", "other"];

  return (
    <div className="p-8 max-w-2xl">
      <Link to="/invoices" className="inline-flex items-center gap-1.5 text-[13px] text-ink-quiet hover:text-ink mb-6 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Invoices
      </Link>

      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-[20px] font-semibold text-ink">Invoice</h1>
          <p className="text-[13px] text-ink-quiet mt-1">{customer?.name}</p>
        </div>
        <Badge variant={invStatusBadge(invoice.status)}>{invoiceStatusLabel(invoice.status)}</Badge>
      </div>

      <div className="flex gap-4 text-[12px] text-ink-quiet mb-6">
        {invoice.sent_at && <span>Sent {invoice.sent_at.split("T")[0]}</span>}
        {invoice.due_at && <span>· Due {invoice.due_at}</span>}
        {invoice.paid_at && <span>· Paid {invoice.paid_at.split("T")[0]}</span>}
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

      {invoice.notes && (
        <div className="bg-paper-warm rounded-xl border border-paper-deep px-5 py-4 mb-5">
          <p className="text-[12px] font-semibold text-ink-quiet uppercase tracking-wide mb-1">Notes</p>
          <p className="text-[13px] text-ink-soft">{invoice.notes}</p>
        </div>
      )}

      {/* Payments section */}
      <div className="bg-white rounded-xl border border-paper-deep overflow-hidden mb-5">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-paper-deep bg-paper-warm">
          <p className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
            <DollarSign className="w-4 h-4 text-ink-quiet" /> Payments
          </p>
          {invoice.status !== "paid" && invoice.status !== "voided" && (
            <button
              onClick={() => { setPaymentError(null); setShowPaymentModal(true); }}
              className="flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> Log Payment
            </button>
          )}
        </div>

        {payments.length > 0 ? (
          <div className="divide-y divide-paper-deep">
            {payments.map((p: any) => (
              <div key={p.id} className="flex items-center gap-4 px-5 py-3">
                <div className="w-7 h-7 rounded-full bg-[#e8f5e9] flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#2e7d32]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-ink capitalize">{p.method}{p.note ? ` — ${p.note}` : ""}</p>
                  <p className="text-[11px] text-ink-quiet">{p.paid_at?.split("T")[0]}</p>
                </div>
                <p className="text-[14px] font-semibold text-[#2e7d32]">+${Number(p.amount).toFixed(2)}</p>
              </div>
            ))}
            <div className="flex items-center justify-between px-5 py-3 bg-paper-warm">
              <p className="text-[13px] font-semibold text-ink">Balance Due</p>
              <p className={`text-[16px] font-bold ${balanceDue === 0 ? "text-[#2e7d32]" : "text-ink"}`}>
                ${balanceDue.toFixed(2)}
              </p>
            </div>
          </div>
        ) : (
          <p className="px-5 py-4 text-[13px] text-ink-quiet">No payments logged yet.</p>
        )}
      </div>

      {invoice.status === "paid" && (
        <div className="bg-[#e8f5e9] border border-[#a5d6a7] rounded-xl px-5 py-4 mb-5 flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4 text-[#2e7d32]" />
          <p className="text-[13px] text-[#1b5e20] font-medium">
            Paid in full{invoice.paid_at ? ` on ${invoice.paid_at.split("T")[0]}` : ""}
            {totalPaid > 0 ? ` · ${payments.length} payment${payments.length !== 1 ? "s" : ""}` : ""}
          </p>
        </div>
      )}

      {paymentLinkError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[#fef2f2] border border-[#fecaca] text-[13px] text-[#dc2626] mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {paymentLinkError}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {invoice.status !== "paid" && invoice.status !== "voided" && (
          <Button size="sm" className="w-auto gap-1.5" onClick={() => setShowSendModal(true)}>
            <Mail className="w-3.5 h-3.5" /> Email to Customer
          </Button>
        )}
        {stripeEnabled && invoice.status !== "paid" && invoice.status !== "voided" && (
          <Button size="sm" variant="secondary" className="w-auto gap-1.5" onClick={handleCreatePaymentLink} disabled={creatingPaymentLink}>
            {creatingPaymentLink ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
            {creatingPaymentLink ? "Creating…" : "Payment Link"}
            {!creatingPaymentLink && <ExternalLink className="w-3 h-3 opacity-50" />}
          </Button>
        )}
        {["sent", "overdue"].includes(invoice.status) && (
          <Button size="sm" className="w-auto gap-1.5 bg-moss hover:bg-moss-dark" onClick={async () => {
            await supabase.from("invoice_payments").insert({
              invoice_id: invoice.id, business_id: businessId, amount: subtotal - totalPaid,
              method: "other", note: "Marked paid manually",
              paid_at: new Date().toISOString(),
            });
            await updateStatus("paid");
            const { data: pmts } = await supabase.from("invoice_payments").select("*").eq("invoice_id", invoice.id).eq("business_id", businessId).order("paid_at");
            if (pmts) setPayments(pmts);
          }}>
            <CheckCircle2 className="w-3.5 h-3.5" /> Mark as Paid
          </Button>
        )}
        {invoice.status !== "paid" && invoice.status !== "voided" && (
          <Button size="sm" variant="ghost" className="w-auto gap-1.5" onClick={openEdit}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        )}
      </div>

      {/* Edit Invoice modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-paper-deep flex-shrink-0">
              <h2 className="text-[15px] font-semibold text-ink">Edit Invoice</h2>
              <button onClick={() => setShowEditModal(false)} className="p-1.5 rounded-lg hover:bg-paper-warm text-ink-quiet"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-5 overflow-y-auto flex-1 space-y-5">
              {/* Due date */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet uppercase tracking-wide mb-1.5">Due Date</label>
                <input type="date" value={editDueAt} onChange={(e) => setEditDueAt(e.target.value)}
                  className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/30" />
              </div>
              {/* Line items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[12px] font-semibold text-ink-quiet uppercase tracking-wide">Line Items</p>
                  <button onClick={() => setEditItems((p) => [...p, { id: crypto.randomUUID(), description: "", type: "service", quantity: 1, unitPrice: 0 }])}
                    className="flex items-center gap-1 text-[12px] font-semibold text-accent hover:text-accent/80">
                    <Plus className="w-3.5 h-3.5" /> Add Item
                  </button>
                </div>
                <div className="space-y-2">
                  {editItems.map((li, idx) => (
                    <div key={li.id ?? idx} className="bg-paper-warm rounded-xl border border-paper-deep p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <input value={li.description} onChange={(e) => updateEditItem(idx, "description", e.target.value)}
                          placeholder="Description"
                          className="flex-1 px-3 py-2 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/30" />
                        <button onClick={() => setEditItems((p) => p.filter((_, i) => i !== idx))}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-ink-quiet hover:text-red-500 flex-shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-ink-quiet uppercase mb-1">Type</label>
                          <select value={li.type} onChange={(e) => updateEditItem(idx, "type", e.target.value)}
                            className="w-full px-2 py-1.5 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none">
                            {["service","material","labor","other"].map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-ink-quiet uppercase mb-1">Qty</label>
                          <input type="number" min="1" value={li.quantity} onChange={(e) => updateEditItem(idx, "quantity", e.target.value)}
                            className="w-full px-2 py-1.5 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-ink-quiet uppercase mb-1">Unit Price</label>
                          <input type="number" min="0" step="0.01" value={li.unitPrice} onChange={(e) => updateEditItem(idx, "unitPrice", e.target.value)}
                            className="w-full px-2 py-1.5 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none" />
                        </div>
                      </div>
                      <p className="text-[12px] text-ink-quiet text-right">Line total: <span className="font-semibold text-ink">${(li.quantity * li.unitPrice).toFixed(2)}</span></p>
                    </div>
                  ))}
                </div>
                {editItems.length > 0 && (
                  <div className="flex items-center justify-between mt-3 px-1">
                    <p className="text-[13px] font-semibold text-ink">Total</p>
                    <p className="text-[18px] font-bold text-ink">${editItems.reduce((s, li) => s + (li.quantity ?? 0) * (li.unitPrice ?? 0), 0).toFixed(2)}</p>
                  </div>
                )}
              </div>
              {/* Notes */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet uppercase tracking-wide mb-1.5">Notes</label>
                <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} placeholder="Optional notes…"
                  className="w-full px-3 py-2.5 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-paper-deep flex gap-2 justify-end flex-shrink-0">
              <Button variant="secondary" size="sm" className="w-auto" onClick={() => setShowEditModal(false)}>Cancel</Button>
              <Button size="sm" className="w-auto gap-1.5" onClick={saveEdit} disabled={editSaving}>
                {editSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {editSaving ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Log Payment modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-paper-deep">
              <h2 className="text-[15px] font-semibold text-ink flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-ink-quiet" /> Log Payment
              </h2>
              <button onClick={() => setShowPaymentModal(false)} className="p-1.5 rounded-lg hover:bg-paper-warm text-ink-quiet">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Amount Received</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-ink-quiet">$</span>
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder={balanceDue > 0 ? balanceDue.toFixed(2) : "0.00"}
                    min="0.01"
                    step="0.01"
                    autoFocus
                    className="w-full pl-7 pr-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors"
                  />
                </div>
                {balanceDue > 0 && (
                  <button
                    onClick={() => setPaymentAmount(balanceDue.toFixed(2))}
                    className="text-[12px] text-accent hover:underline mt-1"
                  >
                    Use balance due (${balanceDue.toFixed(2)})
                  </button>
                )}
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m}
                      onClick={() => setPaymentMethod(m)}
                      className={`py-2 rounded-lg text-[12px] font-medium capitalize border transition-colors ${
                        paymentMethod === m ? "bg-ink text-white border-ink" : "bg-white border-paper-deep text-ink-soft hover:bg-paper-warm"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Note (optional)</label>
                <input
                  type="text"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  placeholder="e.g. check #1042"
                  className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors"
                />
              </div>
              {paymentError && <p className="text-[12px] text-red-500">{paymentError}</p>}
            </div>
            <div className="flex gap-2 px-6 py-4 border-t border-paper-deep">
              <Button variant="secondary" className="flex-1" onClick={() => setShowPaymentModal(false)} disabled={paymentSaving}>Cancel</Button>
              <Button className="flex-1" onClick={handleLogPayment} loading={paymentSaving}>Save Payment</Button>
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
                <div className="w-8 h-8 rounded-full bg-[#dbeafe] flex items-center justify-center">
                  <Send className="w-4 h-4 text-[#1d4ed8]" />
                </div>
                <h2 className="text-[15px] font-semibold text-ink">Send Invoice</h2>
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
                    <p className="text-[12px] text-ink-quiet mt-0.5">
                      {lineItems.length} line item{lineItems.length !== 1 ? "s" : ""}
                      {invoice.due_at ? ` · Due ${invoice.due_at}` : ""}
                    </p>
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
              <div className="bg-[#eff6ff] border border-[#bfdbfe] rounded-xl p-4">
                <p className="text-[12px] font-semibold text-[#1d4ed8] mb-2">What the customer receives</p>
                <ul className="space-y-1.5">
                  {["Professional HTML email with all line items", "Itemized pricing and grand total", `Due date${invoice.due_at ? `: ${invoice.due_at}` : " (if set)"}`, "Any notes you've added"].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-[12px] text-[#1e40af]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#2563eb] flex-shrink-0" />
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
                {sending ? "Sending…" : "Send Invoice"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
