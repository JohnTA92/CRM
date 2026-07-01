import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Badge } from "@/design-system/primitives/Badge";
import { Button } from "@/design-system/primitives/Button";
import { supabase } from "@/lib/supabase";
import { invoiceStatusLabel } from "@/data/crm";
import { ArrowLeft, Send, CheckCircle2, CreditCard, Loader2 } from "lucide-react";

function invStatusBadge(s: string): "warning" | "success" | "error" | "muted" | "default" {
  const m: Record<string, "warning" | "success" | "error" | "muted" | "default"> = {
    draft: "muted", sent: "warning", paid: "success", overdue: "error", voided: "muted",
  };
  return m[s] ?? "default";
}

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => { if (id) load(id); }, [id]);

  async function load(invId: string) {
    setLoading(true);
    const { data, error } = await supabase.from("invoices").select("*").eq("id", invId).single();
    if (error || !data) { setNotFound(true); setLoading(false); return; }
    setInvoice(data);
    const { data: cust } = await supabase.from("customers").select("*").eq("id", data.customer_id).single();
    if (cust) setCustomer(cust);
    setLoading(false);
  }

  async function updateStatus(status: string) {
    const updates: any = { status };
    if (status === "sent") updates.sent_at = new Date().toISOString();
    if (status === "paid") updates.paid_at = new Date().toISOString();
    const { data } = await supabase.from("invoices").update(updates).eq("id", invoice.id).select().single();
    if (data) setInvoice(data);
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
  const subtotal = lineItems.reduce((s: number, li: any) => s + (li.quantity ?? 0) * (li.unitPrice ?? 0), 0);

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

      {invoice.status === "paid" && (
        <div className="bg-[#e8f5e9] border border-[#a5d6a7] rounded-xl px-5 py-4 mb-5 flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4 text-[#2e7d32]" />
          <p className="text-[13px] text-[#1b5e20] font-medium">
            Payment received{invoice.paid_at ? ` on ${invoice.paid_at.split("T")[0]}` : ""}
          </p>
        </div>
      )}

      <div className="flex gap-2">
        {invoice.status === "draft" && (
          <Button size="sm" className="w-auto gap-1.5" onClick={() => updateStatus("sent")}>
            <Send className="w-3.5 h-3.5" /> Send Invoice
          </Button>
        )}
        {["sent", "overdue"].includes(invoice.status) && (
          <>
            <Button size="sm" className="w-auto gap-1.5 bg-moss hover:bg-moss-dark" onClick={() => updateStatus("paid")}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Mark as Paid
            </Button>
            <Button size="sm" variant="secondary" className="w-auto gap-1.5">
              <CreditCard className="w-3.5 h-3.5" /> Send Payment Link
            </Button>
          </>
        )}
        {invoice.status !== "paid" && invoice.status !== "voided" && (
          <Button size="sm" variant="ghost" className="w-auto">Edit</Button>
        )}
      </div>
    </div>
  );
}
