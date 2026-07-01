import { useParams, Link } from "react-router-dom";
import { Badge } from "@/design-system/primitives/Badge";
import { Button } from "@/design-system/primitives/Button";
import {
  jobs,
  estimates,
  invoices,
  getCustomer,
  getCrewMember,
  jobStatusLabel,
  serviceTypeLabel,
  estimateStatusLabel,
  invoiceStatusLabel,
} from "@/data/crm";
import { ArrowLeft, Clock, User, Repeat, StickyNote, FileText, Receipt, CheckCircle2 } from "lucide-react";

function jobStatusBadge(s: string) {
  const m: Record<string, "warning" | "success" | "error" | "muted" | "default" | "gold"> = {
    draft: "muted", quoted: "warning", scheduled: "default",
    "in-progress": "gold", complete: "success", invoiced: "muted",
  };
  return m[s] ?? "default";
}

const STATUS_STEPS = ["draft", "quoted", "scheduled", "in-progress", "complete", "invoiced"];

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const job = jobs.find((j) => j.id === id);

  if (!job) return <div className="p-8 text-ink-quiet">Job not found.</div>;

  const customer = getCustomer(job.customerId);
  const crew = job.assignedTo ? getCrewMember(job.assignedTo) : null;
  const estimate = job.estimateId ? estimates.find((e) => e.id === job.estimateId) : null;
  const invoice = job.invoiceId ? invoices.find((i) => i.id === job.invoiceId) : null;
  const currentStep = STATUS_STEPS.indexOf(job.status);

  return (
    <div className="p-8 max-w-3xl">
      <Link to="/jobs" className="inline-flex items-center gap-1.5 text-[13px] text-ink-quiet hover:text-ink mb-6 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Jobs
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-semibold text-ink">{job.title}</h1>
          <p className="text-[13px] text-ink-quiet mt-1">{serviceTypeLabel(job.serviceType)}</p>
        </div>
        <Badge variant={jobStatusBadge(job.status)} className="mt-1">{jobStatusLabel(job.status)}</Badge>
      </div>

      <div className="bg-white rounded-xl border border-paper-deep mb-5 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-paper-warm border-b border-paper-deep">
          <p className="text-[12px] font-semibold text-ink-quiet uppercase tracking-wide">Progress</p>
        </div>
        <div className="px-5 py-4">
          <div className="flex items-center gap-0">
            {STATUS_STEPS.map((step, i) => {
              const done = i <= currentStep;
              const active = i === currentStep;
              return (
                <div key={step} className="flex items-center flex-1 last:flex-none">
                  <div className={`flex flex-col items-center gap-1 ${i < STATUS_STEPS.length - 1 ? "flex-1" : ""}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                      active ? "bg-ink text-white" : done ? "bg-moss text-white" : "bg-paper-dark text-ink-quiet"
                    }`}>
                      {done && !active ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                    </div>
                    <span className={`text-[10px] font-medium ${active ? "text-ink" : done ? "text-moss-dark" : "text-ink-quiet"} whitespace-nowrap`}>
                      {jobStatusLabel(step as any)}
                    </span>
                  </div>
                  {i < STATUS_STEPS.length - 1 && (
                    <div className={`h-0.5 flex-1 mx-1 mb-3.5 transition-colors ${i < currentStep ? "bg-moss" : "bg-paper-dark"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="bg-white rounded-xl border border-paper-deep p-5">
          <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide mb-3">Customer</p>
          {customer ? (
            <Link to={`/customers/${customer.id}`} className="hover:underline">
              <p className="text-[14px] font-semibold text-ink">{customer.name}</p>
              <p className="text-[12px] text-ink-quiet mt-0.5">{customer.phone}</p>
              <p className="text-[12px] text-ink-quiet">{customer.address}, {customer.city}</p>
            </Link>
          ) : (
            <p className="text-[13px] text-ink-quiet">No customer assigned</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-paper-deep p-5">
          <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide mb-3">Schedule</p>
          <div className="space-y-1.5">
            {job.scheduledDate ? (
              <div className="flex items-center gap-2 text-[13px] text-ink">
                <Clock className="w-3.5 h-3.5 text-ink-quiet" />
                {job.scheduledDate} {job.scheduledTime && `at ${job.scheduledTime}`}
              </div>
            ) : (
              <p className="text-[13px] text-ink-quiet">Not scheduled</p>
            )}
            {job.durationMinutes > 0 && (
              <p className="text-[12px] text-ink-quiet ml-5">{Math.round(job.durationMinutes / 60)}h {job.durationMinutes % 60 > 0 ? `${job.durationMinutes % 60}m` : ""} estimated</p>
            )}
            {job.recurring !== "none" && (
              <div className="flex items-center gap-2 text-[12px] text-ink-quiet">
                <Repeat className="w-3.5 h-3.5" /> Repeats {job.recurring}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-paper-deep p-5">
          <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide mb-3">Assigned To</p>
          {crew ? (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-paper-dark flex items-center justify-center text-[11px] font-semibold text-ink-soft">
                {crew.avatar}
              </div>
              <div>
                <p className="text-[13px] font-medium text-ink">{crew.name}</p>
                <p className="text-[11px] text-ink-quiet capitalize">{crew.role}</p>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-ink-quiet">Unassigned</p>
          )}
        </div>

        {job.notes && (
          <div className="bg-white rounded-xl border border-paper-deep p-5">
            <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <StickyNote className="w-3.5 h-3.5" /> Notes
            </p>
            <p className="text-[13px] text-ink-soft leading-relaxed">{job.notes}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-paper-deep p-5">
          <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Estimate
          </p>
          {estimate ? (
            <Link to={`/estimates/${estimate.id}`} className="block hover:bg-paper-warm -mx-2 px-2 py-2 rounded-lg transition-colors">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold text-ink">${estimate.total.toLocaleString()}</p>
                <Badge variant={estimate.status === "approved" ? "success" : estimate.status === "sent" ? "warning" : "muted"}>
                  {estimateStatusLabel(estimate.status)}
                </Badge>
              </div>
              <p className="text-[11px] text-ink-quiet mt-0.5">{estimate.lineItems.length} line items</p>
            </Link>
          ) : (
            <div>
              <p className="text-[13px] text-ink-quiet mb-2">No estimate yet</p>
              <Button size="sm" variant="secondary" className="w-auto text-[12px] h-8">Create estimate</Button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-paper-deep p-5">
          <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Receipt className="w-3.5 h-3.5" /> Invoice
          </p>
          {invoice ? (
            <Link to={`/invoices/${invoice.id}`} className="block hover:bg-paper-warm -mx-2 px-2 py-2 rounded-lg transition-colors">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold text-ink">${invoice.total.toLocaleString()}</p>
                <Badge variant={invoice.status === "paid" ? "success" : invoice.status === "overdue" ? "error" : invoice.status === "sent" ? "warning" : "muted"}>
                  {invoiceStatusLabel(invoice.status)}
                </Badge>
              </div>
              <p className="text-[11px] text-ink-quiet mt-0.5">{invoice.dueAt ? `Due ${invoice.dueAt}` : "No due date"}</p>
            </Link>
          ) : (
            <div>
              <p className="text-[13px] text-ink-quiet mb-2">
                {job.status === "complete" ? "Ready to invoice" : "Complete the job to invoice"}
              </p>
              {job.status === "complete" && (
                <Button size="sm" className="w-auto text-[12px] h-8">Generate invoice</Button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        {job.status === "in-progress" && (
          <Button size="sm" className="w-auto gap-1.5 bg-moss hover:bg-moss-dark">
            <CheckCircle2 className="w-4 h-4" /> Mark Complete
          </Button>
        )}
        {job.status === "scheduled" && (
          <Button size="sm" className="w-auto gap-1.5">Start Job</Button>
        )}
        <Button size="sm" variant="secondary" className="w-auto">Edit Job</Button>
      </div>
    </div>
  );
}
