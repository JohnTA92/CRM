import { Link } from "react-router-dom";
import { Badge } from "@/design-system/primitives/Badge";
import { cn } from "@/lib/utils";
import {
  jobs,
  invoices,
  customers,
  estimates,
  getCustomer,
  jobStatusLabel,
  invoiceStatusLabel,
  serviceTypeLabel,
} from "@/data/crm";
import {
  Briefcase,
  Users,
  DollarSign,
  AlertCircle,
  ArrowRight,
  Clock,
} from "lucide-react";

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-paper-deep p-5 flex items-start gap-4">
      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", accent ?? "bg-paper-warm")}>
        <Icon className="w-5 h-5 text-ink-soft" />
      </div>
      <div>
        <p className="text-[13px] text-ink-quiet font-medium">{label}</p>
        <p className="text-[24px] font-semibold text-ink leading-tight mt-0.5">{value}</p>
        {sub && <p className="text-[12px] text-ink-quiet mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function jobStatusBadge(status: string) {
  const map: Record<string, "warning" | "success" | "error" | "muted" | "default" | "gold"> = {
    draft: "muted",
    quoted: "warning",
    scheduled: "default",
    "in-progress": "gold",
    complete: "success",
    invoiced: "muted",
  };
  return map[status] ?? "default";
}

function invoiceStatusBadge(status: string) {
  const map: Record<string, "warning" | "success" | "error" | "muted" | "default"> = {
    draft: "muted",
    sent: "warning",
    paid: "success",
    overdue: "error",
    voided: "muted",
  };
  return map[status] ?? "default";
}

export function DashboardPage() {
  const today = new Date().toISOString().split("T")[0];
  const todayJobs = jobs.filter((j) => j.scheduledDate === today);
  const activeJobs = jobs.filter((j) => ["scheduled", "in-progress", "quoted"].includes(j.status));
  const unpaidInvoices = invoices.filter((i) => i.status === "sent" || i.status === "overdue");
  const pendingEstimates = estimates.filter((e) => e.status === "sent");
  const totalRevenue = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.total, 0);

  const recentJobs = [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const recentInvoices = [...invoices].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);

  return (
    <div className="p-8">
      <div className="mb-7">
        <h1 className="text-[22px] font-semibold text-ink">Dashboard</h1>
        <p className="text-[14px] text-ink-quiet mt-1">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Today's Jobs"
          value={todayJobs.length || "—"}
          sub={todayJobs.length ? "scheduled today" : "nothing scheduled"}
          icon={Clock}
          accent="bg-[#e8f5e9]"
        />
        <StatCard
          label="Active Jobs"
          value={activeJobs.length}
          sub="in pipeline"
          icon={Briefcase}
          accent="bg-[#e3f2fd]"
        />
        <StatCard
          label="Unpaid Invoices"
          value={unpaidInvoices.length}
          sub={`$${unpaidInvoices.reduce((s, i) => s + i.total, 0).toLocaleString()} outstanding`}
          icon={AlertCircle}
          accent={unpaidInvoices.length > 0 ? "bg-[#fff3e0]" : "bg-paper-warm"}
        />
        <StatCard
          label="Revenue Collected"
          value={`$${totalRevenue.toLocaleString()}`}
          sub="this month (paid)"
          icon={DollarSign}
          accent="bg-[#e8f5e9]"
        />
      </div>

      {pendingEstimates.length > 0 && (
        <div className="bg-[#fff8e1] border border-[#ffe082] rounded-xl px-5 py-4 mb-6 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-[#e65100] flex-shrink-0" />
          <p className="text-[13px] text-[#5d3a00] font-medium">
            {pendingEstimates.length} estimate{pendingEstimates.length > 1 ? "s" : ""} awaiting customer approval
          </p>
          <Link to="/estimates" className="ml-auto text-[13px] text-[#e65100] font-semibold flex items-center gap-1 hover:underline">
            View <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-paper-deep">
          <div className="flex items-center justify-between px-5 py-4 border-b border-paper-deep">
            <h2 className="text-[14px] font-semibold text-ink">Recent Jobs</h2>
            <Link to="/jobs" className="text-[13px] text-accent font-medium hover:underline flex items-center gap-1">
              All jobs <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-paper-deep">
            {recentJobs.map((job) => {
              const customer = getCustomer(job.customerId);
              return (
                <Link
                  key={job.id}
                  to={`/jobs/${job.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-paper-warm transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-ink truncate">{job.title}</p>
                    <p className="text-[12px] text-ink-quiet truncate">
                      {customer?.name} · {serviceTypeLabel(job.serviceType)}
                    </p>
                  </div>
                  <Badge variant={jobStatusBadge(job.status)}>{jobStatusLabel(job.status)}</Badge>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-paper-deep">
          <div className="flex items-center justify-between px-5 py-4 border-b border-paper-deep">
            <h2 className="text-[14px] font-semibold text-ink">Invoices</h2>
            <Link to="/invoices" className="text-[13px] text-accent font-medium hover:underline flex items-center gap-1">
              All invoices <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-paper-deep">
            {recentInvoices.map((inv) => {
              const customer = getCustomer(inv.customerId);
              return (
                <Link
                  key={inv.id}
                  to={`/invoices/${inv.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-paper-warm transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-ink truncate">{customer?.name}</p>
                    <p className="text-[12px] text-ink-quiet">
                      ${inv.total.toLocaleString()} · {inv.sentAt ? `Sent ${inv.sentAt}` : "Draft"}
                    </p>
                  </div>
                  <Badge variant={invoiceStatusBadge(inv.status)}>{invoiceStatusLabel(inv.status)}</Badge>
                </Link>
              );
            })}
            {recentInvoices.length === 0 && (
              <div className="px-5 py-8 text-center text-[13px] text-ink-quiet">No invoices yet</div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-paper-deep mt-6">
        <div className="flex items-center justify-between px-5 py-4 border-b border-paper-deep">
          <h2 className="text-[14px] font-semibold text-ink">Customers</h2>
          <Link to="/customers" className="text-[13px] text-accent font-medium hover:underline flex items-center gap-1">
            All customers <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="flex items-center divide-x divide-paper-deep">
          {[
            { label: "Total customers", value: customers.filter((c) => !c.archived).length },
            { label: "Active jobs", value: activeJobs.length },
            { label: "Pending estimates", value: pendingEstimates.length },
          ].map(({ label, value }) => (
            <div key={label} className="flex-1 px-5 py-4 text-center">
              <p className="text-[22px] font-semibold text-ink">{value}</p>
              <p className="text-[12px] text-ink-quiet mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
