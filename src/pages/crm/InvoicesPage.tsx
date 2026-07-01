import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/design-system/primitives/Badge";
import { Button } from "@/design-system/primitives/Button";
import { supabase } from "@/lib/supabase";
import { invoiceStatusLabel, type InvoiceStatus, type Invoice, type LineItem } from "@/data/crm";
import { Plus, FileText, X, Trash2, ChevronDown, Loader2, CreditCard, CheckCircle, AlertCircle } from "lucide-react";

const STATUS_FILTERS: { label: string; value: InvoiceStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Paid", value: "paid" },
  { label: "Overdue", value: "overdue" },
];

function invStatusBadge(s: string): "warning" | "success" | "error" | "muted" | "default" {
  const m: Record<string, "warning" | "success" | "error" | "muted" | "default"> = {
    draft: "muted", sent: "warning", paid: "success", overdue: "error", voided: "muted",
  };
  return m[s] ?? "default";
}

interface Customer { id: string; name: string; email: string; }

export function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");
  const [showModal, setShowModal] = useState(false);

  const [customerId, setCustomerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saveCard, setSaveCard] = useState(false);
  const [lineItems, setLineItems] = useState<{ description: string; quantity: string; unitPrice: string; type: "labor" | "material" | "service" }[]>([
    { description: "", quantity: "1", unitPrice: "", type: "service" },
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [invRes, custRes] = await Promise.all([
      supabase.from("invoices").select("*").order("created_at", { ascending: false }),
      supabase.from("customers").select("id, name, email").eq("archived", false).order("name"),
    ]);
    if (invRes.data) setInvoices(invRes.data.map(rowToInvoice));
    if (custRes.data) setCustomers(custRes.data);
    setLoading(false);
  }

  function rowToInvoice(row: any): Invoice {
    return {
      id: row.id,
      jobId: row.job_id ?? "",
      customerId: row.customer_id,
      estimateId: row.estimate_id,
      status: row.status,
      lineItems: row.line_items ?? [],
      notes: row.notes ?? "",
      createdAt: row.created_at?.split("T")[0] ?? "",
      sentAt: row.sent_at,
      dueAt: row.due_at,
      paidAt: row.paid_at,
      total: row.total ?? 0,
    };
  }

  const lineTotal = lineItems.reduce((sum, li) =>
    sum + (parseFloat(li.quantity) || 0) * (parseFloat(li.unitPrice) || 0), 0);

  const addLineItem = () =>
    setLineItems((prev) => [...prev, { description: "", quantity: "1", unitPrice: "", type: "service" }]);
  const removeLineItem = (i: number) =>
    setLineItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateLineItem = (i: number, field: string, value: string) =>
    setLineItems((prev) => prev.map((li, idx) => idx === i ? { ...li, [field]: value } : li));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!customerId) e.customerId = "Required";
    lineItems.forEach((li, i) => {
      if (!li.description.trim()) e[`li_desc_${i}`] = "Required";
      if (!li.unitPrice || parseFloat(li.unitPrice) <= 0) e[`li_price_${i}`] = "Required";
    });
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    setSaveError(null);

    const items: LineItem[] = lineItems.map((li, i) => ({
      id: `li-${Date.now()}-${i}`,
      description: li.description.trim(),
      quantity: parseFloat(li.quantity) || 1,
      unitPrice: parseFloat(li.unitPrice) || 0,
      type: li.type,
    }));

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        customer_id: customerId,
        status: "draft",
        line_items: items,
        notes: notes.trim() || null,
        total: lineTotal,
        due_at: dueDate || null,
        sent_at: null,
        paid_at: null,
        job_id: null,
        estimate_id: null,
        card_on_file: saveCard,
      })
      .select()
      .single();

    setSaving(false);
    if (error) { setSaveError(error.message); return; }
    if (data) setInvoices((prev) => [rowToInvoice(data), ...prev]);
    setShowModal(false);
    resetForm();
  };

  const resetForm = () => {
    setCustomerId(""); setDueDate(""); setNotes(""); setSaveCard(false); setErrors({});
    setLineItems([{ description: "", quantity: "1", unitPrice: "", type: "service" }]);
  };

  const getCustomerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "Unknown";
  const filtered = invoices.filter((i) => statusFilter === "all" || i.status === statusFilter);
  const totalUnpaid = invoices.filter((i) => ["sent", "overdue"].includes(i.status)).reduce((s, i) => s + i.total, 0);
  const totalPaid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.total, 0);
  const overdue = invoices.filter((i) => i.status === "overdue");

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-[22px] font-semibold text-ink">Invoices</h1>
          <p className="text-[14px] text-ink-quiet mt-1">
            {loading ? "Loading…" : `$${totalUnpaid.toLocaleString()} unpaid · $${totalPaid.toLocaleString()} collected`}
          </p>
        </div>
        <Button size="sm" className="w-auto gap-1.5" onClick={() => setShowModal(true)}>
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
        {loading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-ink-quiet">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-[14px]">Loading invoices…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="w-8 h-8 text-ink-quiet mx-auto mb-3" />
            <p className="text-[14px] text-ink-quiet">No invoices yet. Create your first one.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-2.5 border-b border-paper-deep bg-paper-warm">
              <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide">Customer</p>
              <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide">Payment</p>
              <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide text-right">Total</p>
              <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide text-right">Due</p>
              <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide text-right">Status</p>
            </div>
            <div className="divide-y divide-paper-deep">
              {filtered.map((inv) => (
                <Link
                  key={inv.id}
                  to={`/invoices/${inv.id}`}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center px-5 py-4 hover:bg-paper-warm transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-ink truncate">{getCustomerName(inv.customerId)}</p>
                    <p className="text-[12px] text-ink-quiet">{inv.lineItems.length} item{inv.lineItems.length !== 1 ? "s" : ""}</p>
                  </div>
                  <div>
                    {inv.status === "paid" ? (
                      <span className="flex items-center gap-1 text-[11px] text-moss font-medium">
                        <CheckCircle className="w-3.5 h-3.5" /> Paid online
                      </span>
                    ) : inv.status === "sent" ? (
                      <span className="flex items-center gap-1 text-[11px] text-ink-quiet">
                        <CreditCard className="w-3.5 h-3.5" /> Pay now link
                      </span>
                    ) : (
                      <span className="text-[11px] text-ink-quiet">—</span>
                    )}
                  </div>
                  <p className="text-[14px] font-semibold text-ink text-right">${inv.total.toLocaleString()}</p>
                  <p className="text-[12px] text-ink-quiet text-right">{inv.dueAt ?? "—"}</p>
                  <Badge variant={invStatusBadge(inv.status)}>{invoiceStatusLabel(inv.status)}</Badge>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      {/* New Invoice Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setShowModal(false); resetForm(); }} />
          <div className="relative bg-white rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-paper-deep">
              <h2 className="text-[16px] font-semibold text-ink">New Invoice</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="p-1.5 rounded-lg hover:bg-paper-warm text-ink-quiet">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">
                  Customer <span className="text-accent">*</span>
                </label>
                <div className="relative">
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className={`w-full px-3 py-2.5 text-[14px] border rounded-lg bg-white appearance-none focus:outline-none transition-colors ${
                      errors.customerId ? "border-accent" : "border-paper-deep focus:border-ink"
                    }`}
                  >
                    <option value="">Select a customer…</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-quiet pointer-events-none" />
                </div>
                {errors.customerId && <p className="text-[11px] text-accent mt-1">{errors.customerId}</p>}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[12px] font-semibold text-ink-quiet">Line Items</label>
                  <button onClick={addLineItem} className="text-[12px] text-accent font-medium hover:underline">+ Add item</button>
                </div>
                <div className="space-y-2">
                  {lineItems.map((li, i) => (
                    <div key={i} className="grid grid-cols-[1fr_60px_80px_auto] gap-2 items-start">
                      <input
                        value={li.description}
                        onChange={(e) => updateLineItem(i, "description", e.target.value)}
                        placeholder="Description"
                        className={`w-full px-3 py-2 text-[13px] border rounded-lg bg-white focus:outline-none focus:border-ink transition-colors ${errors[`li_desc_${i}`] ? "border-accent" : "border-paper-deep"}`}
                      />
                      <input
                        value={li.quantity}
                        onChange={(e) => updateLineItem(i, "quantity", e.target.value)}
                        placeholder="Qty"
                        type="number"
                        min="1"
                        className="w-full px-2 py-2 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors text-center"
                      />
                      <input
                        value={li.unitPrice}
                        onChange={(e) => updateLineItem(i, "unitPrice", e.target.value)}
                        placeholder="$0.00"
                        type="number"
                        min="0"
                        step="0.01"
                        className={`w-full px-2 py-2 text-[13px] border rounded-lg bg-white focus:outline-none focus:border-ink transition-colors ${errors[`li_price_${i}`] ? "border-accent" : "border-paper-deep"}`}
                      />
                      <button onClick={() => removeLineItem(i)} disabled={lineItems.length === 1} className="p-2 text-ink-quiet hover:text-accent disabled:opacity-30 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end mt-3 pt-3 border-t border-paper-deep">
                  <p className="text-[14px] font-semibold text-ink">Total: ${lineTotal.toFixed(2)}</p>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors"
                />
              </div>

              <div
                onClick={() => setSaveCard(!saveCard)}
                className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                  saveCard ? "border-accent bg-accent/5" : "border-paper-deep hover:border-ink bg-paper-warm"
                }`}
              >
                <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${saveCard ? "border-accent bg-accent" : "border-paper-deep"}`}>
                  {saveCard && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4" /> Save card on file
                  </p>
                  <p className="text-[12px] text-ink-quiet mt-0.5">
                    Customer's card will be saved for future auto-charging on recurring jobs.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Payment terms, thank you note…"
                  rows={2}
                  className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors resize-none"
                />
              </div>

              {saveError && (
                <div className="bg-[#ffebee] border border-[#ef9a9a] rounded-lg px-4 py-3 text-[13px] text-[#b71c1c]">
                  {saveError}
                </div>
              )}
            </div>

            <div className="flex gap-2 px-6 py-4 border-t border-paper-deep">
              <Button variant="secondary" className="w-auto flex-1" onClick={() => { setShowModal(false); resetForm(); }} disabled={saving}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleSubmit} loading={saving}>
                Save Invoice
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
