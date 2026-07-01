import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/design-system/primitives/Badge";
import { Button } from "@/design-system/primitives/Button";
import {
  jobs,
  getCustomer,
  getCrewMember,
  jobStatusLabel,
  serviceTypeLabel,
  type JobStatus,
} from "@/data/crm";
import { Plus, Search, Clock, User } from "lucide-react";

const STATUS_FILTERS: { label: string; value: JobStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Quoted", value: "quoted" },
  { label: "Scheduled", value: "scheduled" },
  { label: "In Progress", value: "in-progress" },
  { label: "Complete", value: "complete" },
  { label: "Invoiced", value: "invoiced" },
];

function jobStatusBadge(s: string) {
  const m: Record<string, "warning" | "success" | "error" | "muted" | "default" | "gold"> = {
    draft: "muted", quoted: "warning", scheduled: "default",
    "in-progress": "gold", complete: "success", invoiced: "muted",
  };
  return m[s] ?? "default";
}

export function JobsPage() {
  const [statusFilter, setStatusFilter] = useState<JobStatus | "all">("all");
  const [query, setQuery] = useState("");

  const filtered = jobs.filter((j) => {
    const matchStatus = statusFilter === "all" || j.status === statusFilter;
    const matchQuery =
      query === "" ||
      j.title.toLowerCase().includes(query.toLowerCase()) ||
      (getCustomer(j.customerId)?.name ?? "").toLowerCase().includes(query.toLowerCase());
    return matchStatus && matchQuery;
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-[22px] font-semibold text-ink">Jobs</h1>
          <p className="text-[14px] text-ink-quiet mt-1">{jobs.length} total jobs</p>
        </div>
        <Button size="sm" className="w-auto gap-1.5">
          <Plus className="w-4 h-4" /> New Job
        </Button>
      </div>

      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-quiet" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search jobs or customers…"
            className="w-full pl-9 pr-4 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                statusFilter === f.value
                  ? "bg-ink text-white"
                  : "bg-paper-warm text-ink-soft hover:bg-paper-dark"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-[14px] text-ink-quiet">No jobs found.</div>
        ) : (
          <div className="divide-y divide-paper-deep">
            {filtered.map((job) => {
              const customer = getCustomer(job.customerId);
              const crew = job.assignedTo ? getCrewMember(job.assignedTo) : null;
              return (
                <Link
                  key={job.id}
                  to={`/jobs/${job.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-paper-warm transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-ink truncate">{job.title}</p>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-[12px] text-ink-quiet">{customer?.name}</span>
                      <span className="text-[12px] text-ink-quiet">·</span>
                      <span className="text-[12px] text-ink-quiet">{serviceTypeLabel(job.serviceType)}</span>
                      {job.scheduledDate && (
                        <>
                          <span className="text-[12px] text-ink-quiet">·</span>
                          <span className="flex items-center gap-1 text-[12px] text-ink-quiet">
                            <Clock className="w-3 h-3" /> {job.scheduledDate} {job.scheduledTime}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {crew && (
                      <span className="flex items-center gap-1.5 text-[12px] text-ink-quiet">
                        <div className="w-5 h-5 rounded-full bg-paper-dark flex items-center justify-center text-[9px] font-semibold text-ink-soft">
                          {crew.avatar}
                        </div>
                        {crew.name.split(" ")[0]}
                      </span>
                    )}
                    {job.recurring !== "none" && (
                      <Badge variant="muted">{job.recurring}</Badge>
                    )}
                    <Badge variant={jobStatusBadge(job.status)}>{jobStatusLabel(job.status)}</Badge>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
