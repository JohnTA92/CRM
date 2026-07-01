import { useParams, Link } from "react-router-dom";
import { Badge } from "@/design-system/primitives/Badge";
import { Button } from "@/design-system/primitives/Button";
import {
  getCustomer,
  getJobsForCustomer,
  getInvoicesForCustomer,
  getEstimatesForCustomer,
  serviceTypeLabel,
  jobStatusLabel,
  invoiceStatusLabel,
  estimateStatusLabel,
} from "@/data/crm";
import { ArrowLeft, MapPin, Phone, Mail, Plus, Briefcase, FileText, Receipt } from "lucide-react";

function jobStatusBadge(s: string) {
  const m: Record<string, "warning" | "success" | "error" | "muted" | "default" | "gold"> = {
    draft: "muted", quoted: "warning", scheduled: "default",
    "in-progress": "gold", complete: "success", invoiced: "muted",
  };
  return m[s] ?? "default";
}
function invStatusBadge(s: string) {
  const m: Record<string, "warning" | "success" | "error" | "muted" | "default"> = {
    draft: "muted", sent: "warning", paid: "success", overdue: "error", voided: "muted",
  };
  return m[s] ?? "default";
}
function estStatusBadge(s: string) {
  const m: Record<string, "warning" | "success" | "error" | "muted" | "default"> = {
    draft: "muted", sent: "warning", approved: "success", declined: "error", expired: "muted",
  };
  return m[s] ?? "default";
}

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const customer = getCustomer(id!);

  if (!customer) {
    return (
      <div className="p-8 text-center text-ink-quiet">Customer not found.</div>
    );
  }

  const customerJobs = getJobsForCustomer(customer.id);
  const customerInvoices = getInvoicesForCustomer(customer.id);
  const customerEstimates = getEstimatesForCustomer(customer.id);
  const totalSpend = customerInvoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.total, 0);

  return (
    <div className="p-8 max-w-4xl">
      <Link to="/customers" className="inline-flex items-center gap-1.5 text-[13px] text-ink-quiet hover:text-ink mb-6 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Customers
      </Link>

      <div className="bg-white rounded-xl border border-paper-deep p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-paper-dark flex items-center justify-center text-[18px] font-semibold text-ink-soft flex-shrink-0">
            {customer.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[20px] font-semibold text-ink">{customer.name}</h1>
            <div className="flex flex-wrap gap-3 mt-1.5">
              <span className="flex items-center gap-1.5 text-[13px] text-ink-quiet">
                <MapPin className="w-3.5 h-3.5" /> {customer.address}, {customer.city}, {customer.state} {customer.zip}
              </span>
              <span className="flex items-center gap-1.5 text-[13px] text-ink-quiet">
                <Phone className="w-3.5 h-3.5" /> {customer.phone}
              </span>
              <span className="flex items-center gap-1.5 text-[13px] text-ink-quiet">
                <Mail className="w-3.5 h-3.5" /> {customer.email}
              </span>
            </div>
            <div className="flex gap-2 mt-2">
              {customer.serviceTypes.map((t) => (
                <Badge key={t} variant="default">{serviceTypeLabel(t)}</Badge>
              ))}
            </div>
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
          <Button size="sm" className="w-auto gap-1.5">
            <Plus className="w-3.5 h-3.5" /> New Job
          </Button>
          <Button size="sm" variant="secondary" className="w-auto gap-1.5">
            <FileText className="w-3.5 h-3.5" /> New Estimate
          </Button>
        </div>
      </div>

      <section className="mb-6">
        <h2 className="text-[15px] font-semibold text-ink mb-3 flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-ink-quiet" /> Jobs ({customerJobs.length})
        </h2>
        <div className="bg-white rounded-xl border border-paper-deep divide-y divide-paper-deep overflow-hidden">
          {customerJobs.length === 0 ? (
            <p className="text-[13px] text-ink-quiet px-5 py-4">No jobs yet.</p>
          ) : customerJobs.map((job) => (
            <Link key={job.id} to={`/jobs/${job.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-paper-warm transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-ink truncate">{job.title}</p>
                <p className="text-[12px] text-ink-quiet">{job.scheduledDate ?? "Not scheduled"}{job.recurring !== "none" ? ` · ${job.recurring}` : ""}</p>
              </div>
              <Badge variant={jobStatusBadge(job.status)}>{jobStatusLabel(job.status)}</Badge>
            </Link>
          ))}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="text-[15px] font-semibold text-ink mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4 text-ink-quiet" /> Estimates ({customerEstimates.length})
        </h2>
        <div className="bg-white rounded-xl border border-paper-deep divide-y divide-paper-deep overflow-hidden">
          {customerEstimates.length === 0 ? (
            <p className="text-[13px] text-ink-quiet px-5 py-4">No estimates yet.</p>
          ) : customerEstimates.map((est) => (
            <Link key={est.id} to={`/estimates/${est.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-paper-warm transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-ink">Estimate #{est.id}</p>
                <p className="text-[12px] text-ink-quiet">Created {est.createdAt}</p>
              </div>
              <p className="text-[13px] font-semibold text-ink mr-3">${est.total.toLocaleString()}</p>
              <Badge variant={estStatusBadge(est.status)}>{estimateStatusLabel(est.status)}</Badge>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-[15px] font-semibold text-ink mb-3 flex items-center gap-2">
          <Receipt className="w-4 h-4 text-ink-quiet" /> Invoices ({customerInvoices.length})
        </h2>
        <div className="bg-white rounded-xl border border-paper-deep divide-y divide-paper-deep overflow-hidden">
          {customerInvoices.length === 0 ? (
            <p className="text-[13px] text-ink-quiet px-5 py-4">No invoices yet.</p>
          ) : customerInvoices.map((inv) => (
            <Link key={inv.id} to={`/invoices/${inv.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-paper-warm transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-ink">Invoice #{inv.id}</p>
                <p className="text-[12px] text-ink-quiet">{inv.sentAt ? `Sent ${inv.sentAt}` : "Draft"}{inv.dueAt ? ` · Due ${inv.dueAt}` : ""}</p>
              </div>
              <p className="text-[13px] font-semibold text-ink mr-3">${inv.total.toLocaleString()}</p>
              <Badge variant={invStatusBadge(inv.status)}>{invoiceStatusLabel(inv.status)}</Badge>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
