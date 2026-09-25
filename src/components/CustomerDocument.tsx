import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lineAmount } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  X, Download, Printer, FileText, ExternalLink, CheckCircle2, XCircle,
  AlertCircle, Loader2,
} from "lucide-react";

const money = (value: number) => Number(value).toLocaleString("en-US", { style: "currency", currency: "USD" });
const date = (value?: string) => value ? value.slice(0, 10) : "—";

// Matches the app's standard secondary/utility button (see e.g. CustomerDetailPage's
// "Open Portal" / "Copy Portal Link" actions) — kept as one constant since this
// document view repeats the same small button many times.
const button = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-paper-deep bg-white text-ink-soft hover:bg-paper-warm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export function CustomerDocument({ client, kind, id, readOnly = true, onClose, onDecision }: {
  client: SupabaseClient; kind: "estimate" | "invoice"; id: string; readOnly?: boolean;
  onClose: () => void; onDecision?: () => void;
}) {
  const [doc, setDoc] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);
  const [name, setName] = useState("");
  const [choice, setChoice] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let current = true;
    setDoc(null); setError(""); setChoice(""); setConfirmed(false);
    client.rpc("get_customer_document", { _kind: kind, _id: id }).then(({ data, error }) => {
      if (!current) return;
      if (error) setError(error.message); else setDoc(data);
    });
    return () => { current = false; };
  }, [client, kind, id, attempt]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  async function decide() {
    if (readOnly || busy || !doc?.can_decide || !confirmed || !name.trim() || !choice) return;
    setBusy(true); setError("");
    const { data, error } = await client.rpc("decide_customer_estimate", {
      _estimate_id: id, _decision: choice, _signer_name: name.trim(), _revision: doc.revision,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setDoc(data); setPdfUrl(""); setChoice(""); setConfirmed(false); onDecision?.();
  }
  async function download() {
    if (!doc || downloading) return;
    setDownloading(true); setError("");
    try {
      const { createDocumentPdf } = await import("@/lib/customerDocumentPdf");
      const pdf = await createDocumentPdf(doc);
      setPdfUrl(URL.createObjectURL(await pdf.getBlob()));
    } catch { setError("Could not download the PDF. Please try again or use Print / Save PDF."); }
    finally { setDownloading(false); }
  }
  return createPortal(<div id="crm-customer-document" className="fixed inset-0 z-[100] bg-black/40 p-3 sm:p-6 overflow-y-auto" role="dialog" aria-modal="true" aria-label={`${kind} document`}
    onKeyDown={event => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key === "Tab") {
        const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]'));
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
    <style>{`@media print {
      @page { size: auto; margin: 16mm; }
      body { overflow: visible !important; background: white !important; }
      body > *:not(#crm-customer-document) { display: none !important; }
      #crm-customer-document { position: static !important; overflow: visible !important; padding: 0 !important; background: white !important; }
      #crm-customer-document .document-controls { display: none !important; }
      #crm-customer-document article { box-shadow: none; border: 0; padding: 0; max-width: none; }
      #crm-customer-document thead { display: table-header-group; }
      #crm-customer-document tr, #crm-customer-document .document-totals { break-inside: avoid; }
    }`}</style>
    <article className="max-w-3xl mx-auto bg-white rounded-2xl shadow-[var(--shadow-modal)] p-5 sm:p-8 text-ink">
      <div className="document-controls flex flex-wrap gap-2 justify-between mb-5">
        <button ref={closeRef} className={button} disabled={busy} onClick={onClose}><X className="w-3.5 h-3.5" /> Close document</button>
        {doc && <div className="flex flex-wrap gap-2">
          <button className={button} disabled={downloading} onClick={download}>
            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            {downloading ? "Preparing PDF…" : "Prepare PDF"}
          </button>
          {pdfUrl && <>
            <a className={button} href={pdfUrl} download={`${kind}-${id}.pdf`}><Download className="w-3.5 h-3.5" /> Save PDF file</a>
            <a className={button} href={pdfUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3.5 h-3.5" /> Open PDF</a>
          </>}
          <button className={button} onClick={() => window.print()}><Printer className="w-3.5 h-3.5" /> Print / Save PDF</button>
        </div>}
      </div>
      {error && (
        <div role="alert" className="document-controls bg-[#fef2f2] border border-[#fecaca] rounded-lg px-4 py-3 mb-5 flex items-center gap-2 text-[13px] text-[#dc2626]">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          {!doc && <button className={cn(button, "flex-shrink-0")} onClick={() => setAttempt(v => v + 1)}>Retry</button>}
        </div>
      )}
      {!doc && !error && (
        <p role="status" className="flex items-center gap-2 text-[13px] text-ink-quiet py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading document…
        </p>
      )}
      {doc && <>
        <header className="border-b border-paper-deep pb-5 mb-5 space-y-1.5">
          <h1 className="text-[20px] font-semibold text-ink capitalize">{kind}{doc.status === "draft" ? " — DRAFT" : ""}</h1>
          <p className="text-[14px] font-semibold text-ink">{doc.business_name}</p>
          <p className="text-[13px] text-ink-quiet">{[doc.contact_email, doc.contact_phone].filter(Boolean).join(" · ")}</p>
          <p className="text-[11px] text-ink-quiet break-all">Reference: {doc.id}</p>
          <p className="text-[13px] text-ink-soft capitalize">Status: {doc.status}</p>
          <p className="text-[13px] text-ink-quiet">Created: {date(doc.created_at)}{doc.expires_at ? ` · Expires: ${date(doc.expires_at)}` : ""}{doc.due_at ? ` · Due: ${date(doc.due_at)}` : ""}</p>
        </header>
        <section className="mb-5 space-y-1">
          <h2 className="text-[12px] font-semibold text-ink-quiet uppercase tracking-wide">Prepared for</h2>
          <p className="text-[14px] text-ink">{doc.customer_name}</p>
          <p className="text-[13px] text-ink-quiet break-words">{doc.customer_address}</p>
          {doc.service_address && <p className="text-[13px] text-ink-quiet break-words">Service address: {doc.service_address}</p>}
        </section>
        <div className="rounded-xl border border-paper-deep overflow-hidden">
          <table className="w-full text-[13px] table-fixed">
            <thead className="bg-paper-warm"><tr className="border-b border-paper-deep text-left"><th className="w-[46%] py-2.5 px-3 font-semibold text-ink-quiet text-[11px] uppercase tracking-wide">Description</th><th className="w-[12%] text-right py-2.5 px-3 font-semibold text-ink-quiet text-[11px] uppercase tracking-wide">Qty</th><th className="w-[21%] text-right py-2.5 px-3 font-semibold text-ink-quiet text-[11px] uppercase tracking-wide">Unit price</th><th className="w-[21%] text-right py-2.5 px-3 font-semibold text-ink-quiet text-[11px] uppercase tracking-wide">Amount</th></tr></thead>
            <tbody className="divide-y divide-paper-deep">{doc.line_items.map((item: any, index: number) => <tr key={index} className="align-top">
              <td className="py-3 px-3 pr-2 whitespace-pre-wrap break-words text-ink">{item.description}</td><td className="py-3 px-3 text-right break-words text-ink-soft">{item.quantity}</td>
              <td className="py-3 px-3 text-right break-words text-ink-soft">{money(item.unitPrice)}</td><td className="py-3 px-3 text-right break-words font-medium text-ink">{money(lineAmount(item.quantity,item.unitPrice))}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <section className="document-totals ml-auto max-w-xs space-y-2 py-5 text-[13px]">
          <p className="flex justify-between font-semibold text-ink"><span>Total</span><span>{money(doc.total)}</span></p>
          {kind === "invoice" && <><p className="flex justify-between text-ink-soft"><span>Payments recorded</span><span>{money(doc.paid_total)}</span></p><p className="flex justify-between font-semibold text-ink border-t border-paper-deep pt-2"><span>Balance due</span><span>{money(doc.balance_due)}</span></p></>}
        </section>
        {doc.notes && <section className="mb-5"><h2 className="text-[12px] font-semibold text-ink-quiet uppercase tracking-wide mb-2">Notes</h2><p className="whitespace-pre-wrap break-words text-[13px] text-ink-soft">{doc.notes}</p></section>}
        {doc.decision && (
          <section className="border-t border-paper-deep pt-4 text-[13px] flex items-start gap-2.5">
            {doc.decision.decision === "approved"
              ? <CheckCircle2 className="w-4 h-4 text-[#16a34a] flex-shrink-0 mt-0.5" />
              : <XCircle className="w-4 h-4 text-[#dc2626] flex-shrink-0 mt-0.5" />}
            <div>
              <h2 className="text-[12px] font-semibold text-ink-quiet uppercase tracking-wide mb-1">Customer decision recorded</h2>
              <p className="capitalize text-ink font-medium">{doc.decision.decision} by {doc.decision.signer_name}</p>
              <p className="text-ink-quiet">{new Date(doc.decision.decided_at).toLocaleString()}</p>
            </div>
          </section>
        )}
        <div className="document-controls mt-5 border-t border-paper-deep pt-4 space-y-3">
          <p className="text-[11px] text-ink-quiet">Prepare your PDF, then choose Save PDF file or Open PDF. You can also print a copy.</p>
          {kind === "estimate" && doc.status === "sent" && readOnly && <p className="text-[13px] text-ink-soft">Customer decisions are available through the customer's own portal login.</p>}
          {kind === "estimate" && !readOnly && doc.can_decide && <>
            <h2 className="text-[13px] font-semibold text-ink">Respond to this estimate</h2>
            <div className="flex gap-2">
              <button
                className={cn(
                  "text-[12px] font-medium px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5",
                  choice === "approved" ? "bg-ink text-white border-ink" : "border-paper-deep text-ink-quiet hover:bg-paper-warm",
                )}
                aria-pressed={choice === "approved"} disabled={busy}
                onClick={() => { setChoice("approved"); setConfirmed(false); }}
              ><CheckCircle2 className="w-3.5 h-3.5" /> Approve estimate</button>
              <button
                className={cn(
                  "text-[12px] font-medium px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5",
                  choice === "declined" ? "bg-ink text-white border-ink" : "border-paper-deep text-ink-quiet hover:bg-paper-warm",
                )}
                aria-pressed={choice === "declined"} disabled={busy}
                onClick={() => { setChoice("declined"); setConfirmed(false); }}
              ><XCircle className="w-3.5 h-3.5" /> Decline estimate</button>
            </div>
            {choice && <div className="space-y-3 bg-paper-warm rounded-lg p-4">
              <label className="block text-[13px] text-ink">
                Your full name
                <input
                  className="w-full px-3 py-2 mt-1 text-[13px] border border-paper-deep rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors"
                  maxLength={200} value={name} disabled={busy} onChange={e => setName(e.target.value)}
                />
              </label>
              <label className="flex gap-2 text-[13px] text-ink items-start">
                <input type="checkbox" className="mt-0.5" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />
                <span>I have reviewed this estimate for {money(doc.total)} and want to {choice === "approved" ? "approve" : "decline"} it.</span>
              </label>
              <p className="text-[11px] text-ink-quiet">Your name, decision, time, and the reviewed estimate are saved. Contact the business if you need to change your response.</p>
              <button
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-ink text-white hover:bg-ink/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                disabled={busy || !confirmed || !name.trim()} onClick={decide}
              >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {busy ? "Saving…" : `Confirm ${choice === "approved" ? "approval" : "decline"}`}
              </button>
            </div>}
          </>}
          {kind === "estimate" && !readOnly && !doc.can_decide && !doc.decision && <p className="text-[13px] text-ink-soft">This estimate is not open for a response. Contact the business with questions.</p>}
        </div>
      </>}
    </article>
  </div>, document.body);
}

export function DocumentButton({ client, kind, id, readOnly = true, onDecision }: {
  client: SupabaseClient; kind: "estimate" | "invoice"; id: string; readOnly?: boolean; onDecision?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <button
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border border-paper-deep bg-white text-ink-soft hover:bg-paper-warm transition-colors"
      onClick={() => setOpen(true)}
    >
      <FileText className="w-3 h-3" />
      {readOnly ? "View / Save PDF" : kind === "estimate" ? "Review estimate / PDF" : "View invoice / PDF"}
    </button>
    {open && <CustomerDocument client={client} kind={kind} id={id} readOnly={readOnly} onClose={() => setOpen(false)} onDecision={onDecision} />}
  </>;
}
