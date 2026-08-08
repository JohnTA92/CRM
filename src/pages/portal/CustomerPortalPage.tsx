import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Loader2, CheckCircle2, Clock, FileText, Receipt, Leaf, AlertCircle } from "lucide-react";

function statusColor(s: string) {
  const m: Record<string, string> = {
    draft: "bg-paper-warm text-ink-soft",
    quoted: "bg-[#fff3e0] text-[#e65100]",
    scheduled: "bg-[#e3f2fd] text-[#1565c0]",
    "in-progress": "bg-[#fff8e1] text-[#f57f17]",
    complete: "bg-[#e8f5e9] text-[#2e7d32]",
    invoiced: "bg-paper-warm text-ink-soft",
    sent: "bg-[#fff3e0] text-[#e65100]",
    approved: "bg-[#e8f5e9] text-[#2e7d32]",
    paid: "bg-[#e8f5e9] text-[#2e7d32]",
    overdue: "bg-[#ffebee] text-[#c62828]",
    declined: "bg-[#ffebee] text-[#c62828]",
  };
  return m[s] ?? "bg-paper-warm text-ink-soft";
}

export function CustomerPortalPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const [customer, setCustomer] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [estimates, setEstimates] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => { if (customerId) load(customerId); }, [customerId]);

  async function load(id: string) {
    setLoading(true);
    const { data: cust } = await supabase.from("customers").select("*").eq("id", id).single();
    if (!cust) { setNotFound(true); setLoading(false); return; }
    setCustomer(cust);

    const [jobRes, estRes, invRes] = await Promise.all([
      supabase.from("jobs").select("id, title, status, scheduled_date, scheduled_time").eq("customer_id", id).order("scheduled_date", { ascending: false }),
      supabase.from("estimates").select("id, total, status, created_at, notes").eq("customer_id", id).order("created_at", { ascending: false }),
      supabase.from("invoices").select("id, total, status, due_at, created_at, notes").eq("customer_id", id).order("created_at", { ascending: false }),
    ]);
    if (jobRes.data) setJobs(jobRes.data);
    if (estRes.data) setEstimates(estRes.data);
    if (invRes.data) setInvoices(invRes.data);
    setLoading(false);
  }

  if (loading) return (
    <div className="min-h-screen bg-paper-warm flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-ink-quiet" />
    </div>
  );

  if (notFound || !customer) return (
    <div className="min-h-screen bg-paper-warm flex flex-col items-center justify-center text-center px-6">
      <AlertCircle className="w-10 h-10 text-ink-quiet opacity-30 mb-3" />
      <p className="text-[16px] font-semibold text-ink">Portal not found</p>
      <p className="text-[13px] text-ink-quiet mt-1">This link may be invalid or expired.</p>
    </div>
  );

  const unpaidInvoices = invoices.filter((i) => i.status !== "paid" && i.status !== "voided");
  const totalOwed = unpaidInvoices.reduce((s, i) => s + (i.total ?? 0), 0);

  return (
    <div className="min-h-screen bg-paper-warm">
      {/* Header */}
      <div className="bg-white border-b border-paper-deep">
        <div className="max-w-2xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-moss flex items-center justify-center flex-shrink-0">
            <Leaf className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-ink">My Business</p>
            <p className="text-[12px] text-ink-quiet">Customer Portal</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Welcome */}
        <div className="bg-white rounded-xl border border-paper-deep p-5">
          <h1 className="text-[20px] font-semibold text-ink">Hi, {customer.name.split(" ")[0]}!</h1>
          <p className="text-[13px] text-ink-quiet mt-1">Here's a summary of your account.</p>
          {totalOwed > 0 && (
            <div className="mt-4 bg-[#fff3e0] border border-[#ffcc80] rounded-lg px-4 py-3 flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-[#e65100] flex-shrink-0" />
              <p className="text-[13px] text-[#e65100] font-medium">
                You have ${totalOwed.toLocaleString(undefined, { minimumFractionDigits: 2 })} outstanding on {unpaidInvoices.length} invoice{unpaidInvoices.length !== 1 ? "s" : ""}.
              </p>
            </div>
          )}
        </div>

        {/* Jobs */}
        {jobs.length > 0 && (
          <div>
            <h2 className="text-[14px] font-semibold text-ink mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-ink-quiet" /> Jobs
            </h2>
            <div className="bg-white rounded-xl border border-paper-deep divide-y divide-paper-deep overflow-hidden">
              {jobs.map((j) => (
                <div key={j.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-ink">{j.title}</p>
                    {j.scheduled_date && (
                      <p className="text-[12px] text-ink-quiet flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" /> {j.scheduled_date}{j.scheduled_time ? ` at ${j.scheduled_time}` : ""}
                      </p>
                    )}
                  </div>
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${statusColor(j.status)}`}>
                    {j.status.replace("-", " ")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Estimates */}
        {estimates.length > 0 && (
          <div>
            <h2 className="text-[14px] font-semibold text-ink mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-ink-quiet" /> Estimates
            </h2>
            <div className="bg-white rounded-xl border border-paper-deep divide-y divide-paper-deep overflow-hidden">
              {estimates.map((e) => (
                <div key={e.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-ink">${Number(e.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-[12px] text-ink-quiet">Sent {e.created_at?.split("T")[0]}</p>
                    {e.notes && <p className="text-[12px] text-ink-quiet mt-0.5">{e.notes}</p>}
                  </div>
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${statusColor(e.status)}`}>
                    {e.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Invoices */}
        {invoices.length > 0 && (
          <div>
            <h2 className="text-[14px] font-semibold text-ink mb-3 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-ink-quiet" /> Invoices
            </h2>
            <div className="bg-white rounded-xl border border-paper-deep divide-y divide-paper-deep overflow-hidden">
              {invoices.map((inv) => (
                <div key={inv.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-ink">${Number(inv.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    {inv.due_at && <p className="text-[12px] text-ink-quiet">Due {inv.due_at}</p>}
                    {inv.notes && <p className="text-[12px] text-ink-quiet mt-0.5">{inv.notes}</p>}
                  </div>
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${statusColor(inv.status)}`}>
                    {inv.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-ink-quiet text-center pb-4">
          Questions? Contact us directly.
        </p>
      </div>
    </div>
  );
}
