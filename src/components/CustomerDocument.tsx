import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lineAmount } from "@/lib/money";

const money = (value: number) => Number(value).toLocaleString("en-US", { style: "currency", currency: "USD" });
const date = (value?: string) => value ? value.slice(0, 10) : "—";
const button = "border rounded-lg px-3 py-2 text-sm bg-white disabled:opacity-40";

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
  return createPortal(<div id="crm-customer-document" className="fixed inset-0 z-[100] bg-black/50 p-3 sm:p-6 overflow-y-auto" role="dialog" aria-modal="true" aria-label={`${kind} document`}
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
    <article className="max-w-3xl mx-auto bg-white rounded-xl shadow-xl p-5 sm:p-8 text-ink">
      <div className="document-controls flex flex-wrap gap-2 justify-between mb-5">
        <button ref={closeRef} className={button} disabled={busy} onClick={onClose}>Close document</button>
        {doc && <div className="flex flex-wrap gap-2"><button className={button} disabled={downloading} onClick={download}>{downloading ? "Preparing PDF…" : "Prepare PDF"}</button>{pdfUrl && <><a className={button} href={pdfUrl} download={`${kind}-${id}.pdf`}>Save PDF file</a><a className={button} href={pdfUrl} target="_blank" rel="noopener noreferrer">Open PDF</a></>}<button className={button} onClick={() => window.print()}>Print / Save PDF</button></div>}
      </div>
      {error && <div role="alert" className="document-controls text-red-700 mb-4">{error} {!doc && <button className={button} onClick={() => setAttempt(v => v + 1)}>Retry</button>}</div>}
      {!doc && !error && <p role="status">Loading document…</p>}
      {doc && <>
        <header className="border-b pb-5 mb-5 space-y-2">
          <h1 className="text-2xl font-semibold capitalize">{kind}{doc.status === "draft" ? " — DRAFT" : ""}</h1>
          <p className="font-semibold">{doc.business_name}</p>
          <p className="text-sm">{[doc.contact_email, doc.contact_phone].filter(Boolean).join(" · ")}</p>
          <p className="text-xs break-all">Reference: {doc.id}</p>
          <p className="text-sm capitalize">Status: {doc.status}</p>
          <p className="text-sm">Created: {date(doc.created_at)}{doc.expires_at ? ` · Expires: ${date(doc.expires_at)}` : ""}{doc.due_at ? ` · Due: ${date(doc.due_at)}` : ""}</p>
        </header>
        <section className="mb-5 space-y-1">
          <h2 className="text-sm font-semibold">Prepared for</h2>
          <p>{doc.customer_name}</p><p className="text-sm break-words">{doc.customer_address}</p>
          {doc.service_address && <p className="text-sm break-words">Service address: {doc.service_address}</p>}
        </section>
        <table className="w-full text-sm table-fixed">
          <thead><tr className="border-b text-left"><th className="w-[46%] py-2">Description</th><th className="w-[12%] text-right">Qty</th><th className="w-[21%] text-right">Unit price</th><th className="w-[21%] text-right">Amount</th></tr></thead>
          <tbody>{doc.line_items.map((item: any, index: number) => <tr key={index} className="border-b align-top">
            <td className="py-3 pr-2 whitespace-pre-wrap break-words">{item.description}</td><td className="py-3 text-right break-words">{item.quantity}</td>
            <td className="py-3 text-right break-words">{money(item.unitPrice)}</td><td className="py-3 text-right break-words">{money(lineAmount(item.quantity,item.unitPrice))}</td>
          </tr>)}</tbody>
        </table>
        <section className="document-totals ml-auto max-w-xs space-y-2 py-5">
          <p className="flex justify-between font-semibold"><span>Total</span><span>{money(doc.total)}</span></p>
          {kind === "invoice" && <><p className="flex justify-between"><span>Payments recorded</span><span>{money(doc.paid_total)}</span></p><p className="flex justify-between font-semibold"><span>Balance due</span><span>{money(doc.balance_due)}</span></p></>}
        </section>
        {doc.notes && <section className="mb-5"><h2 className="font-semibold mb-2">Notes</h2><p className="whitespace-pre-wrap break-words text-sm">{doc.notes}</p></section>}
        {doc.decision && <section className="border-t pt-4 text-sm"><h2 className="font-semibold">Customer decision recorded</h2><p className="capitalize">{doc.decision.decision} by {doc.decision.signer_name}</p><p>{new Date(doc.decision.decided_at).toLocaleString()}</p></section>}
        <div className="document-controls mt-5 border-t pt-4 space-y-3">
          <p className="text-xs text-ink-quiet">Prepare your PDF, then choose Save PDF file or Open PDF. You can also print a copy.</p>
          {kind === "estimate" && doc.status === "sent" && readOnly && <p className="text-sm">Customer decisions are available through the customer’s own portal login.</p>}
          {kind === "estimate" && !readOnly && doc.can_decide && <>
            <h2 className="font-semibold">Respond to this estimate</h2>
            <div className="flex gap-2"><button className={button} aria-pressed={choice === "approved"} disabled={busy} onClick={() => { setChoice("approved"); setConfirmed(false); }}>Approve estimate</button><button className={button} aria-pressed={choice === "declined"} disabled={busy} onClick={() => { setChoice("declined"); setConfirmed(false); }}>Decline estimate</button></div>
            {choice && <div className="space-y-3">
              <label className="block text-sm">Your full name<input className="border rounded p-2 w-full mt-1" maxLength={200} value={name} disabled={busy} onChange={e => setName(e.target.value)} /></label>
              <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />I have reviewed this estimate for {money(doc.total)} and want to {choice === "approved" ? "approve" : "decline"} it.</label>
              <p className="text-xs">Your name, decision, time, and the reviewed estimate are saved. Contact the business if you need to change your response.</p>
              <button className={button} disabled={busy || !confirmed || !name.trim()} onClick={decide}>{busy ? "Saving…" : `Confirm ${choice === "approved" ? "approval" : "decline"}`}</button>
            </div>}
          </>}
          {kind === "estimate" && !readOnly && !doc.can_decide && !doc.decision && <p className="text-sm">This estimate is not open for a response. Contact the business with questions.</p>}
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
    <button className="border rounded-lg px-3 py-2 text-xs bg-white" onClick={() => setOpen(true)}>{readOnly ? "View / Save PDF" : kind === "estimate" ? "Review estimate / PDF" : "View invoice / PDF"}</button>
    {open && <CustomerDocument client={client} kind={kind} id={id} readOnly={readOnly} onClose={() => setOpen(false)} onDecision={onDecision} />}
  </>;
}
