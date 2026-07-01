import { useParams, Link } from "react-router-dom";
import { Badge } from "@/design-system/primitives/Badge";
import { Button } from "@/design-system/primitives/Button";
import { invoices, getCustomer, invoiceStatusLabel } from "@/data/crm";
import { ArrowLeft, Send, CheckCircle2, CreditCard } from "lucide-react";

function invStatusBadge(s: string) {
  const m: Record<string, "warning" | "success" | "error" | "muted" | "default"> = {
    draft: "muted", sent: "warning", paid: "success", overdue: "error", voided: "muted",
  };
  return m[s] ?? "default";
}

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const invoice = invoices.find((i) => i.id === id);

  if (!invoice) return <div className="p-8 text-ink-quiet">Invoice not found.</div>;

  const customer = getCustomer(invoice.customerId);
  const subtotal = invoice.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);

  return (
    <div className="p-8 max-w-2xl">
      <Link to="/invoices" className="inline-flex items-center gap-1.5 text-[13px] text-ink-quiet hover:text-ink mb-6 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Invoices
      </Link>

      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-[20px] font-semibold text-ink">Invoice #{invoice.id}</h1>
          <p className="text-[13px] text-ink-quiet mt-1">
            {customer?.name}
          </p>
        </div>
        <Badge variant={invStatusBadge(invoice.status)}>{invoiceStatusLabel(invoice.status)}</Badge>
      </div>

      <div className="flex gap-4 text-[12px] text-ink-quiet mb-6">
        {invoice.sentAt && <span>Sent {invoice.sentAt}</span>}
        {invoice.dueAt && <span>· Due {invoice.dueAt}</span>}
        {invoice.paidAt && <span>· Paid {invoice.paidAt}</span>}
      </div>

      <div className="bg-white rounded-xl border border-paper-deep overflow-hidden mb-5">
        <div className="px-5 py-3.5 border-b border-paper-deep bg-paper-warm">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4">
            <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide">Description</p>
            <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide text-right">Qty</p>
            <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide text-right">Unit Price</p>
            <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide text-right">Total</p>
          </div>
        </div>
        <div className="divide-y divide-paper-deep">
          {invoice.lineItems.map((li) => (
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
            Payment received{invoice.paidAt ? ` on ${invoice.paidAt}` : ""}
          </p>
        </div>
      )}

      <div className="flex gap-2">
        {invoice.status === "draft" && (
          <Button size="sm" className="w-auto gap-1.5">
            <Send className="w-3.5 h-3.5" /> Send Invoice
          </Button>
        )}
        {["sent", "overdue"].includes(invoice.status) && (
          <>
            <Button size="sm" className="w-auto gap-1.5 bg-moss hover:bg-moss-dark">
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
