import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Badge } from "@/design-system/primitives/Badge";
import { Button } from "@/design-system/primitives/Button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { jobStatusLabel, type JobStatus, type Job } from "@/data/crm";
import { useServices, serviceLabel } from "@/lib/services";
import { Plus, Search, Clock, ChevronDown, X, Loader2, RefreshCw } from "lucide-react";

const STATUS_FILTERS: { label: string; value: JobStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Quoted", value: "quoted" },
  { label: "Scheduled", value: "scheduled" },
  { label: "In Progress", value: "in-progress" },
  { label: "Complete", value: "complete" },
  { label: "Invoiced", value: "invoiced" },
];

const RECURRING_OPTIONS = [
  { value: "none", label: "One-time" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
];

function jobStatusBadge(s: string): "warning" | "success" | "error" | "muted" | "default" | "gold" {
  const m: Record<string, "warning" | "success" | "error" | "muted" | "default" | "gold"> = {
    draft: "muted", quoted: "warning", scheduled: "default",
    "in-progress": "gold", complete: "success", invoiced: "muted",
  };
  return m[s] ?? "default";
}

function recurringBadgeLabel(r: string) {
  const m: Record<string, string> = { weekly: "Weekly", biweekly: "Bi-weekly", monthly: "Monthly" };
  return m[r];
}

interface Customer { id: string; name: string; }

function Field({ label, value, onChange, placeholder, type = "text", required, error }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; required?: boolean; error?: string;
}) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">
        {label}{required && <span className="text-accent ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-2.5 text-[14px] border rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none transition-colors ${
          error ? "border-accent" : "border-paper-deep focus:border-ink"
        }`}
      />
      {error && <p className="text-[11px] text-accent mt-1">{error}</p>}
    </div>
  );
}

export function JobsPage() {
  const { services } = useServices();
  const { business } = useAuth();
  const businessId = business?.id ?? "";
  const [jobList, setJobList] = useState<Job[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<JobStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [showModal, setShowModal] = useState(false);

  // form
  const [customerId, setCustomerId] = useState("");
  const [serviceType, setServiceType] = useState("lawn");
  const [title, setTitle] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [recurring, setRecurring] = useState<"none" | "weekly" | "biweekly" | "monthly">("none");
  const [notes, setNotes] = useState("");
  const [price, setPrice] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const prefill = (location.state as any)?.prefillCustomerId;
    if (prefill) { setCustomerId(prefill); setShowModal(true); window.history.replaceState({}, ""); }
  }, [location.state]);

  async function loadData() {
    setLoading(true);
    const [jobRes, custRes] = await Promise.all([
      supabase.from("jobs").select("*").eq("business_id", businessId).order("created_at", { ascending: false }),
      supabase.from("customers").select("id, name").eq("business_id", businessId).eq("archived", false).order("name"),
    ]);
    if (jobRes.data) setJobList(jobRes.data.map(rowToJob));
    if (custRes.data) setCustomers(custRes.data);
    setLoading(false);
  }

  function rowToJob(row: any): Job {
    return {
      id: row.id,
      customerId: row.customer_id,
      serviceType: row.service_type,
      title: row.title,
      status: row.status,
      scheduledDate: row.scheduled_date,
      scheduledTime: row.scheduled_time,
      durationMinutes: row.duration_minutes ?? 60,
      assignedTo: row.assigned_to,
      notes: row.notes ?? "",
      estimateId: row.estimate_id,
      invoiceId: row.invoice_id,
      recurring: row.recurring ?? "none",
      createdAt: row.created_at?.split("T")[0] ?? "",
    };
  }

  const validate = () => {
    const e: Record<string, string> = {};
    if (!customerId) e.customerId = "Required";
    if (!title.trim()) e.title = "Required";
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    setSaveError(null);

    const { data, error } = await supabase
      .from("jobs")
      .insert({
        business_id: businessId,
        customer_id: customerId,
        service_type: serviceType,
        title: title.trim(),
        status: scheduledDate ? "scheduled" : "draft",
        scheduled_date: scheduledDate || null,
        scheduled_time: scheduledTime || null,
        duration_minutes: 60,
        assigned_to: null,
        notes: notes.trim() || null,
        price: price ? parseFloat(price) : null,
        estimate_id: null,
        invoice_id: null,
        recurring,
      })
      .select()
      .single();

    setSaving(false);
    if (error) { setSaveError(error.message); return; }
    if (data) setJobList((prev) => [rowToJob(data), ...prev]);

    setShowModal(false);
    resetForm();
  };

  const resetForm = () => {
    setCustomerId(""); setServiceType(services[0]?.value ?? ""); setTitle("");
    setScheduledDate(""); setScheduledTime(""); setRecurring("none");
    setNotes(""); setPrice(""); setErrors({});
  };

  const getCustomerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "Unknown";

  const filtered = jobList.filter((j) => {
    const matchStatus = statusFilter === "all" || j.status === statusFilter;
    const matchQuery =
      query === "" ||
      j.title.toLowerCase().includes(query.toLowerCase()) ||
      getCustomerName(j.customerId).toLowerCase().includes(query.toLowerCase());
    return matchStatus && matchQuery;
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-[22px] font-semibold text-ink">Jobs</h1>
          <p className="text-[14px] text-ink-quiet mt-1">
            {loading ? "Loading…" : `${jobList.length} total job${jobList.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button size="sm" className="w-auto gap-1.5" onClick={() => setShowModal(true)}>
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
                statusFilter === f.value ? "bg-ink text-white" : "bg-paper-warm text-ink-soft hover:bg-paper-dark"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
        {loading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-ink-quiet">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-[14px]">Loading jobs…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-[14px] text-ink-quiet">No jobs found.</div>
        ) : (
          <div className="divide-y divide-paper-deep">
            {filtered.map((job) => (
              <Link
                key={job.id}
                to={`/jobs/${job.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-paper-warm transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-ink truncate">{job.title}</p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-[12px] text-ink-quiet">{getCustomerName(job.customerId)}</span>
                    <span className="text-[12px] text-ink-quiet">·</span>
                    <span className="text-[12px] text-ink-quiet">{serviceLabel(job.serviceType, services)}</span>
                    {job.scheduledDate && (
                      <>
                        <span className="text-[12px] text-ink-quiet">·</span>
                        <span className="flex items-center gap-1 text-[12px] text-ink-quiet">
                          <Clock className="w-3 h-3" /> {job.scheduledDate}{job.scheduledTime ? ` ${job.scheduledTime}` : ""}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {(job as any).price != null && (
                    <span className="text-[14px] font-semibold text-ink">${Number((job as any).price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  )}
                  {job.recurring !== "none" && (
                    <span className="flex items-center gap-1 text-[11px] text-ink-quiet bg-paper-warm border border-paper-deep rounded-full px-2 py-0.5">
                      <RefreshCw className="w-3 h-3" />
                      {recurringBadgeLabel(job.recurring)}
                    </span>
                  )}
                  <Badge variant={jobStatusBadge(job.status)}>{jobStatusLabel(job.status)}</Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* New Job Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setShowModal(false); resetForm(); }} />
          <div className="relative bg-white rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-paper-deep">
              <h2 className="text-[16px] font-semibold text-ink">New Job</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="p-1.5 rounded-lg hover:bg-paper-warm text-ink-quiet">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Customer */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">
                  Customer <span className="text-accent">*</span>
                </label>
                <div className="relative">
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className={`w-full px-3 py-2.5 text-[14px] border rounded-lg bg-white appearance-none focus:outline-none transition-colors ${
                      errors.customerId ? "border-accent" : "border-paper-deep focus:border-ink"
                    }`}
                  >
                    <option value="">Select a customer…</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-quiet pointer-events-none" />
                </div>
                {errors.customerId && <p className="text-[11px] text-accent mt-1">{errors.customerId}</p>}
              </div>

              <Field label="Job Title" value={title} onChange={setTitle} placeholder="e.g. Weekly Lawn Mow" required error={errors.title} />

              <Field label="Job Price ($)" value={price} onChange={setPrice} placeholder="0.00" type="number" />

              {/* Service type */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Service Type</label>
                <div className="relative">
                  <select
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white appearance-none focus:outline-none focus:border-ink transition-colors"
                  >
                    {services.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-quiet pointer-events-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Date" value={scheduledDate} onChange={setScheduledDate} type="date" />
                <Field label="Time" value={scheduledTime} onChange={setScheduledTime} type="time" />
              </div>

              {/* Recurring */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">
                  <RefreshCw className="w-3 h-3 inline mr-1" />
                  Recurring Schedule
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {RECURRING_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setRecurring(opt.value as any)}
                      className={`px-3 py-2.5 rounded-lg text-[13px] font-medium text-left transition-colors border ${
                        recurring === opt.value
                          ? "bg-ink text-white border-ink"
                          : "bg-white border-paper-deep text-ink-soft hover:border-ink"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any special instructions…"
                  rows={2}
                  className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors resize-none"
                />
              </div>

              {saveError && (
                <div className="bg-[#ffebee] border border-[#ef9a9a] rounded-lg px-4 py-3 text-[13px] text-[#b71c1c]">
                  {saveError}
                </div>
              )}
            </div>

            <div className="flex gap-2 px-6 py-4 border-t border-paper-deep">
              <Button variant="secondary" className="w-auto flex-1" onClick={() => { setShowModal(false); resetForm(); }} disabled={saving}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleSubmit} loading={saving}>
                Save Job
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
