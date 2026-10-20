import { JobPropertySelect } from "@/components/JobPropertySelect";
import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { Badge } from "@/design-system/primitives/Badge";
import { Button } from "@/design-system/primitives/Button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { jobStatusLabel, type JobStatus, type Job } from "@/data/crm";
import { useServices, serviceLabel } from "@/lib/services";
import {
  computeDateRange, isJobInDateRange, matchesStatusTab, matchesJobType,
  matchesEmployeeFilter, matchesJobQuery, formatJobIdRef, todayUTC,
  type DateRangePreset, type StatusTab, type JobTypeFilter,
} from "@/lib/jobFilters";
import {
  Plus, Search, Clock, ChevronDown, X, Loader2, RefreshCw, MapPin, Users, Check,
} from "lucide-react";

const STATUS_FILTERS: { label: string; value: JobStatus | "all" }[] = [
  { label: "All statuses", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Quoted", value: "quoted" },
  { label: "Scheduled", value: "scheduled" },
  { label: "In Progress", value: "in-progress" },
  { label: "Complete", value: "complete" },
  { label: "Invoiced", value: "invoiced" },
];

const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "overdue", label: "Overdue" },
  { value: "upcoming", label: "Upcoming" },
  { value: "done", label: "Done" },
  { value: "paid", label: "Paid" },
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
interface CrewMemberLite { id: string; name: string; }
type JobRow = Job & { serviceAddress: string };

// List-level filter/search state, preserved across a visit to a job's detail page
// and Back. Mirrors the exact sessionStorage pattern established in CustomersPage.tsx.
interface ListState {
  query: string;
  tab: StatusTab;
  status: JobStatus | "all";
  dateRangePreset: DateRangePreset;
  customStart: string;
  customEnd: string;
  jobType: JobTypeFilter;
  employeeIds: string[];
  includeUnassigned: boolean;
}
const LIST_STATE_KEY = "crm-jobs-list-state";
const DEFAULT_LIST_STATE: ListState = {
  query: "", tab: "all", status: "all", dateRangePreset: "all",
  customStart: "", customEnd: "", jobType: "all", employeeIds: [], includeUnassigned: false,
};
const STATUS_TAB_VALUES = new Set(["all", "overdue", "upcoming", "done", "paid"]);
const DATE_PRESET_VALUES = new Set(["all", "last30", "last90", "thisYear", "lastYear", "custom"]);
const JOB_TYPE_VALUES = new Set(["all", "recurring", "oneoff"]);

function readListState(): ListState {
  try {
    const raw = sessionStorage.getItem(LIST_STATE_KEY);
    if (!raw) return DEFAULT_LIST_STATE;
    const p = JSON.parse(raw);
    return {
      query: typeof p.query === "string" ? p.query : "",
      tab: STATUS_TAB_VALUES.has(p.tab) ? p.tab : "all",
      status: typeof p.status === "string" ? p.status : "all",
      dateRangePreset: DATE_PRESET_VALUES.has(p.dateRangePreset) ? p.dateRangePreset : "all",
      customStart: typeof p.customStart === "string" ? p.customStart : "",
      customEnd: typeof p.customEnd === "string" ? p.customEnd : "",
      jobType: JOB_TYPE_VALUES.has(p.jobType) ? p.jobType : "all",
      employeeIds: Array.isArray(p.employeeIds) ? p.employeeIds.filter((x: unknown) => typeof x === "string") : [],
      includeUnassigned: !!p.includeUnassigned,
    };
  } catch {
    return DEFAULT_LIST_STATE;
  }
}

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
  const location = useLocation();
  const { business } = useAuth();
  const businessId = business?.id ?? "";
  const [jobList, setJobList] = useState<JobRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [crewMembers, setCrewMembers] = useState<CrewMemberLite[]>([]);
  const [invoiceStatusById, setInvoiceStatusById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [listState, setListState] = useState<ListState>(readListState);
  const [showModal, setShowModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [employeePopoverOpen, setEmployeePopoverOpen] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState("");

  // form
  const [customerId, setCustomerId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [serviceType, setServiceType] = useState("lawn");
  const [title, setTitle] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [recurring, setRecurring] = useState<"none" | "weekly" | "biweekly" | "monthly">("none");
  const [notes, setNotes] = useState("");
  const [price, setPrice] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    try { sessionStorage.setItem(LIST_STATE_KEY, JSON.stringify(listState)); } catch { /* storage unavailable: just won't survive Back */ }
  }, [listState]);

  useEffect(() => { if (businessId) loadData(); }, [businessId]);

  useEffect(() => {
    const prefill = (location.state as any)?.prefillCustomerId;
    const day = (location.state as any)?.prefillDate;
    if (prefill || day) { if (prefill) setCustomerId(prefill); if (day) setScheduledDate(day); setShowModal(true); window.history.replaceState({}, ""); }
  }, [location.state]);

  async function loadData() {
    setLoading(true);
    // Only filter by business_id for a real, authenticated tenant — an empty string
    // is not a valid uuid, so filtering on it with no session errored these queries
    // out silently (empty job list, empty customer dropdown).
    let jobQ = supabase.from("jobs").select("*").order("created_at", { ascending: false });
    let custQ = supabase.from("customers").select("id, name").eq("archived", false).order("name");
    // Read-only: only used to determine the Paid tab (invoice.status === 'paid'),
    // never to mutate or conflate with job status.
    let invQ = supabase.from("invoices").select("id, status");
    let crewQ = supabase.from("crew_members").select("id, name").eq("active", true).order("name");
    if (businessId) {
      jobQ = jobQ.eq("business_id", businessId);
      custQ = custQ.eq("business_id", businessId);
      invQ = invQ.eq("business_id", businessId);
      crewQ = crewQ.eq("business_id", businessId);
    }
    const [jobRes, custRes, invRes, crewRes] = await Promise.all([jobQ, custQ, invQ, crewQ]);
    const error = jobRes.error || custRes.error || invRes.error || crewRes.error;
    setLoadError(error?.message ?? null);
    if (error) { setLoading(false); return; }
    if (jobRes.data) setJobList(jobRes.data.map(rowToJob));
    if (custRes.data) setCustomers(custRes.data);
    if (invRes.data) setInvoiceStatusById(Object.fromEntries(invRes.data.map((i: any) => [i.id, i.status])));
    if (crewRes.data) setCrewMembers(crewRes.data);
    setLoading(false);
  }

  function rowToJob(row: any): JobRow {
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
      crewMemberIds: row.crew_member_ids ?? [],
      serviceAddress: row.service_address ?? "",
    };
  }

  const validate = () => {
    const e: Record<string, string> = {};
    if (!customerId) e.customerId = "Required";
    if (!title.trim()) e.title = "Required";
    if (scheduledTime && !scheduledDate) e.date = "Choose a date before setting a time.";
    if (recurring !== "none" && !scheduledDate) e.date = "Repeating jobs need a starting date.";
    return e;
  };

  const handleSubmit = async () => {
    if (saving || !businessId) return;
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); setSaveError(Object.values(e).join(" ")); return; }
    setSaving(true);
    setSaveError(null);

    const { data, error } = await supabase
      .from("jobs")
      .insert({
        business_id: businessId || null,
        customer_id: customerId,
        property_id: propertyId || null,
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
    setCustomerId(""); setPropertyId(""); setServiceType(services[0]?.value ?? ""); setTitle("");
    setScheduledDate(""); setScheduledTime(""); setRecurring("none");
    setNotes(""); setPrice(""); setErrors({});
  };

  const getCustomerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "Unknown";
  const getCrewName = (id: string) => crewMembers.find((c) => c.id === id)?.name ?? "Former crew member";

  function copyJobId(e: React.MouseEvent, jobId: string) {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(jobId).then(
      () => {
        setCopiedId(jobId);
        setTimeout(() => setCopiedId((c) => (c === jobId ? null : c)), 2000);
      },
      () => { /* clipboard unavailable: control simply doesn't confirm */ },
    );
  }

  function toggleEmployee(id: string) {
    setListState((s) => ({
      ...s,
      employeeIds: s.employeeIds.includes(id) ? s.employeeIds.filter((x) => x !== id) : [...s.employeeIds, id],
    }));
  }

  function clearFilters() {
    setListState(DEFAULT_LIST_STATE);
    setEmployeeSearch("");
  }

  const filtersActive = useMemo(
    () => JSON.stringify(listState) !== JSON.stringify(DEFAULT_LIST_STATE),
    [listState],
  );

  const today = todayUTC();
  const dateRange = useMemo(
    () => computeDateRange(listState.dateRangePreset, { start: listState.customStart, end: listState.customEnd }),
    [listState.dateRangePreset, listState.customStart, listState.customEnd],
  );

  // Every filter except the status TAB — this is the shared base that both the
  // visible list and every tab's count are computed from, so counts always use
  // the same rules as what's actually displayed.
  const baseFiltered = useMemo(() => jobList.filter((j) => {
    if (listState.status !== "all" && j.status !== listState.status) return false;
    if (!matchesJobType(j.recurring, listState.jobType)) return false;
    if (!isJobInDateRange(j.scheduledDate, dateRange)) return false;
    if (!matchesEmployeeFilter(j.crewMemberIds, listState.employeeIds, listState.includeUnassigned)) return false;
    if (!matchesJobQuery({ idRef: formatJobIdRef(j.id), title: j.title, serviceAddress: j.serviceAddress }, listState.query, getCustomerName(j.customerId))) return false;
    return true;
  }), [jobList, listState.status, listState.jobType, listState.employeeIds, listState.includeUnassigned, listState.query, dateRange, customers]);

  const tabCounts = useMemo(() => {
    const counts: Record<StatusTab, number> = { all: 0, overdue: 0, upcoming: 0, done: 0, paid: 0 };
    for (const tab of STATUS_TABS) {
      counts[tab.value] = baseFiltered.filter((j) =>
        matchesStatusTab(j, tab.value, today, j.invoiceId ? invoiceStatusById[j.invoiceId] : null),
      ).length;
    }
    return counts;
  }, [baseFiltered, invoiceStatusById, today]);

  const filtered = useMemo(
    () => baseFiltered.filter((j) => matchesStatusTab(j, listState.tab, today, j.invoiceId ? invoiceStatusById[j.invoiceId] : null)),
    [baseFiltered, listState.tab, invoiceStatusById, today],
  );

  const filteredEmployees = crewMembers.filter((c) => c.name.toLowerCase().includes(employeeSearch.toLowerCase()));
  const employeeFilterCount = listState.employeeIds.length + (listState.includeUnassigned ? 1 : 0);

  return (
    <div className="p-4 sm:p-8">
      {loadError && <p role="alert" className="text-red-700">Could not load jobs: {loadError} <button onClick={loadData}>Retry</button></p>}
      <div className="flex items-center justify-between mb-7 flex-wrap gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-ink">Jobs</h1>
          <p className="text-[14px] text-ink-quiet mt-1">
            {loading ? "Loading…" : `${filtered.length} of ${jobList.length} job${jobList.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button size="sm" className="w-auto gap-1.5" onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4" /> New Job
        </Button>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 bg-paper-warm border border-paper-deep rounded-lg p-1 w-fit mb-4 flex-wrap">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setListState((s) => ({ ...s, tab: t.value }))}
            className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
              listState.tab === t.value ? "bg-white text-ink shadow-sm" : "text-ink-quiet hover:text-ink"
            }`}
          >
            {t.label} <span className="opacity-60">({tabCounts[t.value]})</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-quiet" />
          <input
            value={listState.query}
            onChange={(e) => setListState((s) => ({ ...s, query: e.target.value }))}
            placeholder="Search by job ID, customer, title, or address…"
            className="w-full pl-9 pr-9 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors"
          />
          {listState.query && (
            <button
              onClick={() => setListState((s) => ({ ...s, query: "" }))}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded text-ink-quiet hover:text-ink transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filters row */}
      <div className="flex gap-2 mb-1 flex-wrap items-start">
        <div className="relative">
          <select
            value={listState.status}
            onChange={(e) => setListState((s) => ({ ...s, status: e.target.value as JobStatus | "all" }))}
            className="pl-3 pr-8 py-2 text-[13px] border border-paper-deep rounded-lg bg-white appearance-none focus:outline-none focus:border-ink transition-colors"
          >
            {STATUS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-quiet pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={listState.dateRangePreset}
            onChange={(e) => setListState((s) => ({ ...s, dateRangePreset: e.target.value as DateRangePreset }))}
            className="pl-3 pr-8 py-2 text-[13px] border border-paper-deep rounded-lg bg-white appearance-none focus:outline-none focus:border-ink transition-colors"
          >
            <option value="all">All dates</option>
            <option value="last30">Last 30 Days</option>
            <option value="last90">Last 90 Days</option>
            <option value="thisYear">This Year</option>
            <option value="lastYear">Last Year</option>
            <option value="custom">Custom range…</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-quiet pointer-events-none" />
        </div>

        {listState.dateRangePreset === "custom" && (
          <div className="flex items-center gap-1.5">
            <input type="date" value={listState.customStart} onChange={(e) => setListState((s) => ({ ...s, customStart: e.target.value }))}
              className="px-2.5 py-2 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors" />
            <span className="text-ink-quiet text-[12px]">to</span>
            <input type="date" value={listState.customEnd} onChange={(e) => setListState((s) => ({ ...s, customEnd: e.target.value }))}
              className="px-2.5 py-2 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors" />
          </div>
        )}

        <div className="relative">
          <select
            value={listState.jobType}
            onChange={(e) => setListState((s) => ({ ...s, jobType: e.target.value as JobTypeFilter }))}
            className="pl-3 pr-8 py-2 text-[13px] border border-paper-deep rounded-lg bg-white appearance-none focus:outline-none focus:border-ink transition-colors"
          >
            <option value="all">All job types</option>
            <option value="recurring">Recurring</option>
            <option value="oneoff">One-off</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-quiet pointer-events-none" />
        </div>

        {/* Employee filter popover */}
        <div className="relative">
          <button
            onClick={() => setEmployeePopoverOpen((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 text-[13px] border border-paper-deep rounded-lg bg-white hover:bg-paper-warm transition-colors text-ink-soft"
          >
            <Users className="w-3.5 h-3.5" />
            {employeeFilterCount === 0 ? "Employee: All" : `Employee: ${employeeFilterCount} selected`}
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {employeePopoverOpen && (
            <div className="absolute z-20 mt-2 w-64 bg-white border border-paper-deep rounded-xl shadow-[var(--shadow-modal)] p-3">
              <input
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                placeholder="Search employees…"
                className="w-full px-2.5 py-1.5 mb-2 text-[13px] border border-paper-deep rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors"
              />
              <label className="flex items-center gap-2 px-1 py-1.5 text-[13px] text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={listState.includeUnassigned}
                  onChange={(e) => setListState((s) => ({ ...s, includeUnassigned: e.target.checked }))}
                  className="w-4 h-4 rounded border-paper-deep accent-ink"
                />
                Unassigned
              </label>
              {crewMembers.length === 0 ? (
                <p className="text-[12px] text-ink-quiet px-1 py-2">No active crew members yet.</p>
              ) : (
                <div className="max-h-44 overflow-y-auto space-y-0.5">
                  {filteredEmployees.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 px-1 py-1.5 text-[13px] text-ink cursor-pointer hover:bg-paper-warm rounded-lg">
                      <input
                        type="checkbox"
                        checked={listState.employeeIds.includes(c.id)}
                        onChange={() => toggleEmployee(c.id)}
                        className="w-4 h-4 rounded border-paper-deep accent-ink"
                      />
                      {c.name}
                    </label>
                  ))}
                  {filteredEmployees.length === 0 && (
                    <p className="text-[12px] text-ink-quiet px-1 py-2">No employees match "{employeeSearch}".</p>
                  )}
                </div>
              )}
              <div className="flex gap-2 mt-2 pt-2 border-t border-paper-deep">
                <button
                  onClick={() => setListState((s) => ({ ...s, employeeIds: [], includeUnassigned: false }))}
                  className="flex-1 px-2 py-1.5 text-[12px] font-medium text-ink-quiet hover:text-ink border border-paper-deep rounded-lg hover:bg-paper-warm transition-colors"
                >
                  Clear
                </button>
                <button
                  onClick={() => setEmployeePopoverOpen(false)}
                  className="flex-1 px-2 py-1.5 text-[12px] font-semibold bg-ink text-white rounded-lg hover:bg-ink/80 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {filtersActive && (
          <button
            onClick={clearFilters}
            className="px-3 py-2 text-[13px] font-medium text-accent hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>
      <p className="text-[11px] text-ink-quiet mb-5">
        Scheduled date (UTC) — filters when the job is scheduled, not when it was created or completed.
      </p>

      <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
        {loading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-ink-quiet">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-[14px]">Loading jobs…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[14px] text-ink-quiet mb-2">
              {jobList.length === 0 ? "No jobs yet." : "No jobs match your filters."}
            </p>
            {jobList.length > 0 && filtersActive && (
              <button onClick={clearFilters} className="text-[13px] text-accent hover:underline">Clear filters</button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-paper-deep">
            {filtered.map((job) => (
              <Link
                key={job.id}
                to={`/jobs/${job.id}`}
                className="flex items-start gap-4 px-5 py-4 hover:bg-paper-warm transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <button
                      onClick={(e) => copyJobId(e, job.id)}
                      title="Copy full job ID"
                      className="group/jobid relative inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold border border-paper-deep bg-paper-warm text-ink-soft hover:bg-paper-dark transition-colors flex-shrink-0"
                    >
                      {copiedId === job.id ? (
                        <span className="text-[#16a34a] flex items-center gap-1"><Check className="w-3 h-3" /> Job ID copied</span>
                      ) : (
                        `#${formatJobIdRef(job.id)}`
                      )}
                      <span className="pointer-events-none absolute left-0 top-full mt-1 z-10 hidden group-hover/jobid:block group-focus/jobid:block whitespace-nowrap rounded-md bg-ink text-white text-[10px] px-2 py-1">
                        {job.id}
                      </span>
                    </button>
                    <p className="text-[14px] font-semibold text-ink truncate">{job.title}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-[12px] text-ink-quiet">{getCustomerName(job.customerId)}</span>
                    <span className="text-[12px] text-ink-quiet">·</span>
                    <span className="text-[12px] text-ink-quiet">{serviceLabel(job.serviceType, services)}</span>
                    <span className="text-[12px] text-ink-quiet">·</span>
                    {job.serviceAddress ? (
                      <span className="flex items-center gap-1 text-[12px] text-ink-quiet">
                        <MapPin className="w-3 h-3" /> {job.serviceAddress}
                      </span>
                    ) : (
                      <span className="text-[12px] text-ink-quiet italic">No address on file</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {job.scheduledDate ? (
                      <span className="flex items-center gap-1 text-[12px] text-ink-quiet">
                        <Clock className="w-3 h-3" /> {job.scheduledDate}{job.scheduledTime ? ` ${job.scheduledTime}` : ""}
                      </span>
                    ) : (
                      <Badge variant="muted">Unscheduled</Badge>
                    )}
                    <span className="text-[12px] text-ink-quiet flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {job.crewMemberIds?.length ? job.crewMemberIds.map(getCrewName).join(", ") : "Unassigned"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
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
                    onChange={(e) => { setCustomerId(e.target.value); setPropertyId(""); }}
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

              <JobPropertySelect businessId={businessId} customerId={customerId} value={propertyId} onChange={setPropertyId} />

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
