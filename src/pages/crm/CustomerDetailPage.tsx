import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Badge } from "@/design-system/primitives/Badge";
import { Button } from "@/design-system/primitives/Button";
import { supabase } from "@/lib/supabase";
import { jobStatusLabel, invoiceStatusLabel, estimateStatusLabel } from "@/data/crm";
import { useServices, serviceLabel } from "@/lib/services";
import { ArrowLeft, MapPin, Phone, Mail, Plus, Briefcase, FileText, Receipt, Loader2, Clock, CheckCircle2, AlertCircle, Send } from "lucide-react";

function jobStatusBadge(s: string): "warning" | "success" | "error" | "muted" | "default" | "gold" {
  const m: Record<string, "warning" | "success" | "error" | "muted" | "default" | "gold"> = {
    draft: "muted", quoted: "warning", scheduled: "default",
    "in-progress": "gold", complete: "success", invoiced: "muted",
  };
  return m[s] ?? "default";
}
function invStatusBadge(s: string): "warning" | "success" | "error" | "muted" | "default" {
  const m: Record<string, "warning" | "success" | "error" | "muted" | "default"> = {
    draft: "muted", sent: "warning", paid: "success", overdue: "error", voided: "muted",
  };
  return m[s] ?? "default";
}
function estStatusBadge(s: string): "warning" | "success" | "error" | "muted" | "default" {
  const m: Record<string, "warning" | "success" | "error" | "muted" | "default"> = {
    draft: "muted", sent: "warning", approved: "success", declined: "error", expired: "muted",
  };
  return m[s] ?? "default";
}

export function CustomerDetailPage() {
  const { services } = useServices();
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [estimates, setEstimates] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => { if (id) load(id); }, [id]);

  async function load(custId: string) {
    setLoading(true);
    const { data, error } = await supabase.from("customers").select("*").eq("id", custId).single();
    if (error || !data) { setNotFound(true); setLoading(false); return; }
    setCustomer(data);

    const [jobRes, estRes, invRes] = await Promise.all([
      supabase.from("jobs").select("*").eq("customer_id", custId).order("created_at", { ascending: false }),
      supabase.from("estimates").select("*").eq("customer_id", custId).order("created_at", { ascending: false }),
      supabase.from("invoices").select("*").eq("customer_id", custId).order("created_at", { ascending: false }),
    ]);
    if (jobRes.data) setJobs(jobRes.data);
    if (estRes.data) setEstimates(estRes.data);
    if (invRes.data) setInvoices(invRes.data);
    setLoading(false);
  }

  if (loading) return (
    <div className="p-8 flex items-center gap-2 text-ink-quiet">
      <Loader2 className="w-4 h-4 animate-spin" /><span className="text-[14px]">Loading customer…</span>
    </div>
  );

  if (notFound || !customer) return (
    <div className="p-8">
      <Link to="/customers" className="inline-flex items-center gap-1.5 text-[13px] text-ink-quiet hover:text-ink mb-4 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Customers
      </Link>
      <p className="text-[14px] text-ink-quiet">Customer not found.</p>
    </div>
  );

  const totalSpend = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + (i.total ?? 0), 0);
  const serviceTypes: string[] = customer.service_types ?? [];

  return (
    <div className="p-8 max-w-4xl">
      <Link to="/customers" className="inline-flex items-center gap-1.5 text-[13px] text-ink-quiet hover:text-ink mb-6 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Customers
      </Link>

      <div className="bg-white rounded-xl border border-paper-deep p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-paper-dark flex items-center justify-center text-[18px] font-semibold text-ink-soft flex-shrink-0">
            {customer.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[20px] font-semibold text-ink">{customer.name}</h1>
            <div className="flex flex-wrap gap-3 mt-1.5">
              {customer.address && (
                <span className="flex items-center gap-1.5 text-[13px] text-ink-quiet">
                  <MapPin className="w-3.5 h-3.5" />
                  {customer.address}{customer.city ? `, ${customer.city}` : ""}{customer.state ? `, ${customer.state}` : ""} {customer.zip ?? ""}
                </span>
              )}
              {customer.phone && (
                <span className="flex items-center gap-1.5 text-[13px] text-ink-quiet">
                  <Phone className="w-3.5 h-3.5" /> {customer.phone}
                </span>
              )}
              {customer.email && (
                <span className="flex items-center gap-1.5 text-[13px] text-ink-quiet">
                  <Mail className="w-3.5 h-3.5" /> {customer.email}
                </span>
              )}
            </div>
            {serviceTypes.length > 0 && (
              <div className="flex gap-2 mt-2">
                {serviceTypes.map((t: string) => (
                  <Badge key={t} variant="default">{serviceLabel(t, services)}</Badge>
                ))}
              </div>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[22px] font-semibold text-ink">${totalSpend.toLocaleString()}</p>
            <p className="text-[12px] text-ink-quiet">total spend</p>
          </div>
        </div>
        {customer.notes && (
          <div className="mt-4 pt-4 border-t border-paper-deep">
            <p className="text-[12px] text-ink-quiet font-medium uppercase tracking-wide mb-1">Notes</p>
            <p className="text-[13px] text-ink-soft">{customer.notes}</p>
          </div>
        )}
        <div className="flex gap-2 mt-4 pt-4 border-t border-paper-deep">
          <Button size="sm" className="w-auto gap-1.5"><Plus className="w-3.5 h-3.5" /> New Job</Button>
          <Button size="sm" variant="secondary" className="w-auto gap-1.5"><FileText className="w-3.5 h-3.5" /> New Estimate</Button>
        </div>
      </div>

      <section className="mb-6">
        <h2 className="text-[15px] font-semibold text-ink mb-3 flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-ink-quiet" /> Jobs ({jobs.length})
        </h2>
        <div className="bg-white rounded-xl border border-paper-deep divide-y divide-paper-deep overflow-hidden">
          {jobs.length === 0 ? (
            <p className="text-[13px] text-ink-quiet px-5 py-4">No jobs yet.</p>
          ) : jobs.map((job) => (
            <Link key={job.id} to={`/jobs/${job.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-paper-warm transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-ink truncate">{job.title}</p>
                <p className="text-[12px] text-ink-quiet">
                  {job.scheduled_date ?? "Not scheduled"}{job.recurring !== "none" ? ` · ${job.recurring}` : ""}
                </p>
              </div>
              <Badge variant={jobStatusBadge(job.status)}>{jobStatusLabel(job.status)}</Badge>
            </Link>
          ))}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="text-[15px] font-semibold text-ink mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4 text-ink-quiet" /> Estimates ({estimates.length})
        </h2>
        <div className="bg-white rounded-xl border border-paper-deep divide-y divide-paper-deep overflow-hidden">
          {estimates.length === 0 ? (
            <p className="text-[13px] text-ink-quiet px-5 py-4">No estimates yet.</p>
          ) : estimates.map((est) => (
            <Link key={est.id} to={`/estimates/${est.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-paper-warm transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-ink">Estimate</p>
                <p className="text-[12px] text-ink-quiet">Created {est.created_at?.split("T")[0]}</p>
              </div>
              <p className="text-[13px] font-semibold text-ink mr-3">${Number(est.total).toLocaleString()}</p>
              <Badge variant={estStatusBadge(est.status)}>{estimateStatusLabel(est.status)}</Badge>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Communication Timeline ── */}
      {(() => {
        type TimelineEvent = { date: string; label: string; sub: string; icon: React.ElementType; color: string; link: string };
        const events: TimelineEvent[] = [];
        jobs.forEach((j) => {
          if (j.created_at) events.push({ date: j.created_at.split("T")[0], label: `Job created: ${j.title}`, sub: j.status, icon: Briefcase, color: "bg-[#e3f2fd] text-[#1565c0]", link: `/jobs/${j.id}` });
          if (j.scheduled_date) events.push({ date: j.scheduled_date, label: `Job scheduled: ${j.title}`, sub: j.scheduled_time ?? "No time set", icon: Clock, color: "bg-[#e8f5e9] text-[#2e7d32]", link: `/jobs/${j.id}` });
        });
        estimates.forEach((e) => {
          if (e.created_at) events.push({ date: e.created_at.split("T")[0], label: "Estimate created", sub: `$${Number(e.total).toLocaleString()}`, icon: FileText, color: "bg-[#f3e5f5] text-[#6a1b9a]", link: `/estimates/${e.id}` });
          if (e.sent_at) events.push({ date: e.sent_at.split("T")[0], label: "Estimate sent to customer", sub: `$${Number(e.total).toLocaleString()}`, icon: Send, color: "bg-[#fff3e0] text-[#e65100]", link: `/estimates/${e.id}` });
        });
        invoices.forEach((i) => {
          if (i.created_at) events.push({ date: i.created_at.split("T")[0], label: "Invoice created", sub: `$${Number(i.total).toLocaleString()}`, icon: Receipt, color: "bg-paper-warm text-ink-soft", link: `/invoices/${i.id}` });
          if (i.sent_at) events.push({ date: i.sent_at.split("T")[0], label: "Invoice sent", sub: `$${Number(i.total).toLocaleString()} · due ${i.due_at ?? "—"}`, icon: Send, color: "bg-[#fff3e0] text-[#e65100]", link: `/invoices/${i.id}` });
          if (i.paid_at) events.push({ date: i.paid_at.split("T")[0], label: "Payment received", sub: `$${Number(i.total).toLocaleString()}`, icon: CheckCircle2, color: "bg-[#e8f5e9] text-[#2e7d32]", link: `/invoices/${i.id}` });
          if (i.status === "overdue") events.push({ date: i.due_at ?? i.created_at?.split("T")[0] ?? "", label: "Invoice overdue", sub: `$${Number(i.total).toLocaleString()} unpaid`, icon: AlertCircle, color: "bg-[#ffebee] text-[#c62828]", link: `/invoices/${i.id}` });
        });

        const sorted = events.filter((e) => e.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
        if (sorted.length === 0) return null;

        return (
          <section className="mb-6">
            <h2 className="text-[15px] font-semibold text-ink mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-ink-quiet" /> Activity Timeline
            </h2>
            <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
              <div className="divide-y divide-paper-deep">
                {sorted.map((ev, idx) => {
                  const Icon = ev.icon;
                  return (
                    <Link key={idx} to={ev.link} className="flex items-center gap-4 px-5 py-3.5 hover:bg-paper-warm transition-colors">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${ev.color}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-ink">{ev.label}</p>
                        <p className="text-[11px] text-ink-quiet">{ev.sub}</p>
                      </div>
                      <span className="text-[12px] text-ink-quiet flex-shrink-0">{ev.date}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })()}

      <section>
        <h2 className="text-[15px] font-semibold text-ink mb-3 flex items-center gap-2">
          <Receipt className="w-4 h-4 text-ink-quiet" /> Invoices ({invoices.length})
        </h2>
        <div className="bg-white rounded-xl border border-paper-deep divide-y divide-paper-deep overflow-hidden">
          {invoices.length === 0 ? (
            <p className="text-[13px] text-ink-quiet px-5 py-4">No invoices yet.</p>
          ) : invoices.map((inv) => (
            <Link key={inv.id} to={`/invoices/${inv.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-paper-warm transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-ink">Invoice</p>
                <p className="text-[12px] text-ink-quiet">
                  {inv.sent_at ? `Sent ${inv.sent_at.split("T")[0]}` : "Draft"}
                  {inv.due_at ? ` · Due ${inv.due_at}` : ""}
                </p>
              </div>
              <p className="text-[13px] font-semibold text-ink mr-3">${Number(inv.total).toLocaleString()}</p>
              <Badge variant={invStatusBadge(inv.status)}>{invoiceStatusLabel(inv.status)}</Badge>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
