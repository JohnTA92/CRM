import { PrivateImage, newFilePath } from "@/lib/privateStorage";
import { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { MediaModal } from "./MediaModal";
import { Badge } from "@/design-system/primitives/Badge";
import { Button } from "@/design-system/primitives/Button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { jobStatusLabel, estimateStatusLabel, invoiceStatusLabel } from "@/data/crm";
import { useServices, serviceLabel } from "@/lib/services";
import {
  ArrowLeft, Clock, Repeat, StickyNote, FileText, Receipt,
  CheckCircle2, Loader2, X, ChevronDown, RefreshCw, Trash2,
  DollarSign, TrendingUp, Zap, Camera, Play, Plus, ListChecks, Users,
} from "lucide-react";

function jobStatusBadge(s: string): "warning" | "success" | "error" | "muted" | "default" | "gold" {
  const m: Record<string, "warning" | "success" | "error" | "muted" | "default" | "gold"> = {
    draft: "muted", quoted: "warning", scheduled: "default",
    "in-progress": "gold", complete: "success", invoiced: "muted",
  };
  return m[s] ?? "default";
}

const STATUS_STEPS = ["draft", "quoted", "scheduled", "in-progress", "complete", "invoiced"];

const RECURRING_OPTIONS = [
  { value: "none", label: "One-time" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
];

const JOB_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "quoted", label: "Quoted" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in-progress", label: "In Progress" },
  { value: "complete", label: "Complete" },
  { value: "invoiced", label: "Invoiced" },
  { value: "cancelled", label: "Cancelled" },
];

interface Customer { id: string; name: string; }

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { services } = useServices();
  const { business } = useAuth();
  const businessId = business?.id ?? "";
  const [job, setJob] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [estimate, setEstimate] = useState<any>(null);
  const [invoice, setInvoice] = useState<any>(null);
  const [jobExpenses, setJobExpenses] = useState<any[]>([]);
  const [jobMedia, setJobMedia] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [notFound, setNotFound] = useState(false);
  const [conversionError, setConversionError] = useState<string | null>(null);
  const [convertingInvoice, setConvertingInvoice] = useState(false);

  // delete confirm
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // edit modal
  const [showEdit, setShowEdit] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const [actionError, setActionError] = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  // crew
  const [allCrew, setAllCrew] = useState<{id:string; name:string; role:string}[]>([]);
  const [crewIds, setCrewIds] = useState<string[]>([]);
  const [crewSaving, setCrewSaving] = useState(false);
  const [timeEntries, setTimeEntries] = useState<any[]>([]);

  // checklist
  const [checklist, setChecklist] = useState<{ id: string; text: string; done: boolean }[]>([]);
  const [newTaskText, setNewTaskText] = useState("");
  const [checklistSaving, setChecklistSaving] = useState(false);

  async function saveCrew(ids: string[]) {
    if (crewSaving) return;
    setCrewSaving(true); setActionError(null);
    const { error } = await supabase.from("jobs").update({ crew_member_ids: ids }).eq("id", job.id).select().single();
    if (error) setActionError(error.message); else setCrewIds(ids);
    setCrewSaving(false);
  }

  function formatDuration(ms: number): string {
    const totalMins = Math.floor(ms / 60000);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  async function saveChecklist(updated: { id: string; text: string; done: boolean }[]) {
    if (checklistSaving) return false;
    setChecklistSaving(true); setActionError(null);
    const { error } = await supabase.from("jobs").update({ checklist: updated }).eq("id", job?.id ?? "").select().single();
    if (error) setActionError(error.message); else setChecklist(updated);
    setChecklistSaving(false);
    return !error;
  }

  async function addChecklistTask() {
    if (!newTaskText.trim() || checklistSaving) return;
    const item = { id: crypto.randomUUID(), text: newTaskText.trim(), done: false };
    const updated = [...checklist, item];
    if (await saveChecklist(updated)) setNewTaskText("");
  }

  async function toggleChecklistItem(itemId: string) {
    if (checklistSaving) return;
    const updated = checklist.map((i) => i.id === itemId ? { ...i, done: !i.done } : i);
    await saveChecklist(updated);
  }

  async function removeChecklistItem(itemId: string) {
    if (checklistSaving) return;
    const updated = checklist.filter((i) => i.id !== itemId);
    await saveChecklist(updated);
  }

  // edit form fields
  const [editCustomerId, setEditCustomerId] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editServiceType, setEditServiceType] = useState("lawn");
  const [editScheduledDate, setEditScheduledDate] = useState("");
  const [editScheduledTime, setEditScheduledTime] = useState("");
  const [editRecurring, setEditRecurring] = useState("none");
  const [editStatus, setEditStatus] = useState("scheduled");
  const [editNotes, setEditNotes] = useState("");
  const [editDuration, setEditDuration] = useState("60");
  const [editPrice, setEditPrice] = useState("");

  useEffect(() => {
    if (id && businessId) loadJob(id);
  }, [id, businessId]);

  async function loadJob(jobId: string) {
    setLoading(true); setNotFound(false);
    const { data, error } = await supabase.from("jobs").select("*").eq("id", jobId).single();

    if (error || !data) { setNotFound(true); setLoading(false); return; }

    const row = data;
    const mapped = {
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
      price: row.price ?? null,
      createdAt: row.created_at?.split("T")[0] ?? "",
      crewMemberIds: Array.isArray(row.crew_member_ids) ? row.crew_member_ids : [],
    };
    setJob(mapped);
    setChecklist(Array.isArray(row.checklist) ? row.checklist : []);
    setCrewIds(Array.isArray(row.crew_member_ids) ? row.crew_member_ids : []);

    const [custRes, estRes, invRes, expRes, mediaRes, crewRes, timeRes] = await Promise.all([
      supabase.from("customers").select("*").eq("id", row.customer_id).single(),
      row.estimate_id ? supabase.from("estimates").select("*").eq("id", row.estimate_id).single() : Promise.resolve({ data: null }),
      row.invoice_id ? supabase.from("invoices").select("*").eq("id", row.invoice_id).single() : Promise.resolve({ data: null }),
      supabase.from("expenses").select("*").eq("job_id", jobId).eq("business_id", businessId),
      supabase.from("job_media").select("*").eq("job_id", jobId).eq("business_id", businessId).order("created_at", { ascending: true }),
      supabase.from("crew_members").select("id, name, role").eq("active", true).eq("business_id", businessId).order("name"),
      supabase.from("time_entries").select("*").eq("job_id", jobId).eq("business_id", businessId),
    ]);

    if (custRes.data) setCustomer(custRes.data);
    if (estRes.data) setEstimate(estRes.data);
    if (invRes.data) setInvoice(invRes.data);
    if (expRes.data) setJobExpenses(expRes.data);
    if (mediaRes.data) setJobMedia(mediaRes.data);
    if (crewRes.data) setAllCrew(crewRes.data);
    setTimeEntries(timeRes.data ?? []);
    setLoading(false);
  }

  async function updateStatus(newStatus: string) {
    if (!job || statusSaving) return;
    setStatusSaving(true); setActionError(null);
    const { error } = await supabase.from("jobs").update({ status: newStatus }).eq("id", job.id).eq("business_id", businessId).select().single();
    setStatusSaving(false);
    if (error) { setActionError(error.message); return; }
    await loadJob(job.id);
  }

  async function handleConvertToInvoice() {
    if (convertingInvoice || !job) return;
    setConvertingInvoice(true); setConversionError(null);
    const { data, error } = await supabase.rpc("convert_job_to_invoice", { _job_id: job.id }).single<{ id: string }>();
    setConvertingInvoice(false);
    if (error || !data) { setConversionError(error?.message ?? "Could not create the invoice. Please retry."); return; }
    navigate(`/invoices/${data.id}`);
  }

  async function handleQuickMediaUpload(e: React.ChangeEvent<HTMLInputElement>, tag: "before" | "after") {
    if (!e.target.files || !job) return;
    const files = Array.from(e.target.files);
    setMediaUploading(true);
    setMediaError(null);

    for (const file of files) {
      const path = newFilePath(businessId, job.id, file);

      const { error: storageErr } = await supabase.storage
        .from("job-media")
        .upload(path, file, { contentType: file.type });

      if (storageErr) {
        setMediaError(`Storage error: ${storageErr.message} — please retry or contact your administrator.`);
        setMediaUploading(false);
        e.target.value = "";
        return;
      }


      const { error: dbErr } = await supabase.from("job_media").insert({
        business_id: businessId,
        job_id: job.id,
        customer_id: job.customerId,
        tag,
        url: path,
        file_name: file.name,
        file_type: file.type,
        notes: null,
      });

      if (dbErr) {
        await supabase.storage.from("job-media").remove([path]);
        setMediaError(`Database error: ${dbErr.message} — make sure the "job_media" table exists in Supabase.`);
        setMediaUploading(false);
        e.target.value = "";
        return;
      }
    }

    const { data } = await supabase.from("job_media").select("*").eq("job_id", job.id).eq("business_id", businessId).order("created_at", { ascending: true });
    if (data) setJobMedia(data);
    setMediaUploading(false);
    e.target.value = "";
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    const { error } = await supabase.from("jobs").delete().eq("id", job.id);
    if (error) { setDeleteError(error.message); setDeleting(false); return; }
    navigate("/jobs");
  }

  function openEdit() {
    setEditCustomerId(job.customerId);
    setEditTitle(job.title);
    setEditDuration(String(job.durationMinutes));
    setEditServiceType(job.serviceType);
    setEditScheduledDate(job.scheduledDate ?? "");
    setEditScheduledTime(job.scheduledTime ?? "");
    setEditRecurring(job.recurring ?? "none");
    setEditStatus(job.status);
    setEditNotes(job.notes ?? "");
    setEditPrice(job.price != null ? String(job.price) : "");
    setSaveError(null);
    setEditErrors({});
    setShowEdit(true);

    if (customers.length === 0) {
      supabase.from("customers").select("id, name").eq("archived", false).eq("business_id", businessId).order("name")
        .then(({ data }) => { if (data) setCustomers(data); });
    }
  }

  async function handleSave() {
    if (saving) return;
    const errs: Record<string, string> = {};
    if (!editCustomerId) errs.customerId = "Required";
    if (!editTitle.trim()) errs.title = "Required";
    if (!Number.isInteger(Number(editDuration)) || Number(editDuration)<1 || Number(editDuration)>1440) errs.duration = "Duration must be 1–1440 whole minutes.";
    if (Object.keys(errs).length) { setEditErrors(errs); setSaveError(Object.values(errs).join(" ")); return; }

    setSaving(true);
    setSaveError(null);

    const { data, error } = await supabase
      .from("jobs")
      .update({
        customer_id: editCustomerId,
        title: editTitle.trim(),
        service_type: editServiceType,
        scheduled_date: editScheduledDate || null,
        scheduled_time: editScheduledTime || null,
        recurring: editRecurring,
        duration_minutes: Number(editDuration),
        status: editStatus,
        notes: editNotes.trim() || null,
        price: editPrice ? parseFloat(editPrice) : null,
      })
      .eq("id", job.id)
      .select()
      .single();

    setSaving(false);
    if (error) { setSaveError(error.message); return; }
    if (data) {
      const row = data;
      const updated = {
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
        price: row.price ?? null,
        createdAt: row.created_at?.split("T")[0] ?? "",
        crewMemberIds: Array.isArray(row.crew_member_ids) ? row.crew_member_ids : crewIds,
      };
      setJob(updated);
      if (row.customer_id !== job.customerId) {
        const { data: cust } = await supabase.from("customers").select("*").eq("id", row.customer_id).single();
        if (cust) setCustomer(cust);
      }
    }
    setShowEdit(false);
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-ink-quiet">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-[14px]">Loading job…</span>
      </div>
    );
  }

  if (notFound || !job) {
    return (
      <div className="p-8">
        <Link to="/jobs" className="inline-flex items-center gap-1.5 text-[13px] text-ink-quiet hover:text-ink mb-4 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Jobs
        </Link>
        <p className="text-[14px] text-ink-quiet">Job not found.</p>
      </div>
    );
  }

  // ── Profit calculations ──
  const jobRevenue = invoice?.total ?? estimate?.total ?? 0;
  const totalJobExpenses = jobExpenses.reduce((s: number, e: any) => s + (e.amount ?? 0), 0);
  const jobGrossProfit = jobRevenue - totalJobExpenses;
  const jobMarginPct = jobRevenue > 0 ? Math.round((jobGrossProfit / jobRevenue) * 100) : null;
  const jobExpensePct = jobRevenue > 0 ? Math.min(100, Math.round((totalJobExpenses / jobRevenue) * 100)) : 0;
  const showEconomics = jobRevenue > 0 || jobExpenses.length > 0;

  const currentStep = STATUS_STEPS.indexOf(job.status);

  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      {actionError && <p role="alert" className="mb-4 text-red-700">{actionError}</p>}
      <Link to="/jobs" className="inline-flex items-center gap-1.5 text-[13px] text-ink-quiet hover:text-ink mb-6 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Jobs
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-semibold text-ink">{job.title}</h1>
          <p className="text-[13px] text-ink-quiet mt-1">{serviceLabel(job.serviceType, services)}</p>
        </div>
        <div className="flex items-center gap-3">
          {job.price != null && (
            <span className="text-[20px] font-bold text-ink">${Number(job.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          )}
          <Badge variant={jobStatusBadge(job.status)} className="mt-1">{jobStatusLabel(job.status)}</Badge>
        </div>
      </div>

      {/* Progress tracker */}
      <div className="bg-white rounded-xl border border-paper-deep mb-5 overflow-hidden">
        <div className="px-5 py-3.5 bg-paper-warm border-b border-paper-deep">
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
                    <span className={`text-[10px] font-medium whitespace-nowrap ${active ? "text-ink" : done ? "text-moss-dark" : "text-ink-quiet"}`}>
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

      {/* ── Job Economics (Profit Bar) ── */}
      {showEconomics && (
        <div className="bg-white rounded-xl border border-paper-deep mb-5 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 bg-paper-warm border-b border-paper-deep">
            <p className="text-[12px] font-semibold text-ink-quiet uppercase tracking-wide flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" /> Job Economics
            </p>
            {jobMarginPct !== null && (
              <span className={`text-[12px] font-bold px-2.5 py-0.5 rounded-full ${
                jobMarginPct >= 50 ? "bg-[#e8f5e9] text-[#2e7d32]"
                : jobMarginPct >= 20 ? "bg-[#fff3e0] text-[#e65100]"
                : "bg-[#ffebee] text-[#c62828]"
              }`}>
                {jobMarginPct}% margin
              </span>
            )}
          </div>

          <div className="px-5 py-4">
            {/* Three columns */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-[11px] text-ink-quiet mb-0.5 uppercase tracking-wide font-semibold">Revenue</p>
                <p className="text-[20px] font-bold text-[#2e7d32]">${jobRevenue.toLocaleString()}</p>
                <p className="text-[11px] text-ink-quiet mt-0.5">
                  {invoice ? "invoiced" : estimate ? "estimated" : ""}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-ink-quiet mb-0.5 uppercase tracking-wide font-semibold">Expenses</p>
                <p className="text-[20px] font-bold text-[#c62828]">${totalJobExpenses.toLocaleString()}</p>
                <p className="text-[11px] text-ink-quiet mt-0.5">{jobExpenses.length} entr{jobExpenses.length === 1 ? "y" : "ies"}</p>
              </div>
              <div>
                <p className="text-[11px] text-ink-quiet mb-0.5 uppercase tracking-wide font-semibold">Gross Profit</p>
                <p className={`text-[20px] font-bold ${jobGrossProfit >= 0 ? "text-[#1565c0]" : "text-[#c62828]"}`}>
                  {jobGrossProfit < 0 ? "-" : ""}${Math.abs(jobGrossProfit).toLocaleString()}
                </p>
                <p className="text-[11px] text-ink-quiet mt-0.5">
                  {jobMarginPct !== null ? `${jobMarginPct}% margin` : "—"}
                </p>
              </div>
            </div>

            {/* Profit bar */}
            {jobRevenue > 0 && (
              <>
                <div className="w-full h-3 bg-paper-dark rounded-full overflow-hidden flex mb-1.5">
                  <div
                    className="h-full bg-[#ef9a9a] rounded-l-full transition-all"
                    style={{ width: `${jobExpensePct}%` }}
                  />
                  {jobGrossProfit > 0 && (
                    <div
                      className="h-full bg-[#a5d6a7] transition-all"
                      style={{ width: `${Math.max(0, 100 - jobExpensePct)}%` }}
                    />
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5 text-[11px] text-ink-quiet">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#ef9a9a] inline-block" />
                    Expenses ({jobExpensePct}%)
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] text-ink-quiet">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#a5d6a7] inline-block" />
                    Profit ({jobMarginPct ?? 0}%)
                  </span>
                </div>
              </>
            )}

            {/* Expense line items */}
            {jobExpenses.length > 0 && (
              <div className="mt-4 pt-4 border-t border-paper-deep space-y-1.5">
                <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide mb-2">Logged Expenses</p>
                {jobExpenses.map((exp: any) => (
                  <div key={exp.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-ink">{exp.description}</span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-paper-warm text-ink-quiet capitalize">{exp.category}</span>
                    </div>
                    <span className="text-[12px] font-semibold text-ink">${Number(exp.amount).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}

            {jobExpenses.length === 0 && (
              <Link to="/expenses" className="text-[12px] text-accent hover:underline mt-3 inline-flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> Log an expense for this job
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        {/* Customer */}
        <div className="bg-white rounded-xl border border-paper-deep p-5">
          <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide mb-3">Customer</p>
          {customer ? (
            <Link to={`/customers/${customer.id}`} className="hover:underline">
              <p className="text-[14px] font-semibold text-ink">{customer.name}</p>
              {customer.phone && <p className="text-[12px] text-ink-quiet mt-0.5">{customer.phone}</p>}
              {customer.address && <p className="text-[12px] text-ink-quiet">{customer.address}{customer.city ? `, ${customer.city}` : ""}</p>}
            </Link>
          ) : (
            <p className="text-[13px] text-ink-quiet">No customer assigned</p>
          )}
        </div>

        {/* Schedule */}
        <div className="bg-white rounded-xl border border-paper-deep p-5">
          <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide mb-3">Schedule</p>
          <div className="space-y-1.5">
            {job.scheduledDate ? (
              <div className="flex items-center gap-2 text-[13px] text-ink">
                <Clock className="w-3.5 h-3.5 text-ink-quiet" />
                {job.scheduledDate}{job.scheduledTime ? ` at ${job.scheduledTime}` : ""}
              </div>
            ) : (
              <p className="text-[13px] text-ink-quiet">Not scheduled</p>
            )}
            {job.durationMinutes > 0 && (
              <p className="text-[12px] text-ink-quiet ml-5">
                {Math.floor(job.durationMinutes / 60) > 0 ? `${Math.floor(job.durationMinutes / 60)}h ` : ""}
                {job.durationMinutes % 60 > 0 ? `${job.durationMinutes % 60}m ` : ""}
                estimated
              </p>
            )}
            {job.recurring !== "none" && (
              <div className="flex items-center gap-2 text-[12px] text-ink-quiet">
                <Repeat className="w-3.5 h-3.5" /> Repeats {job.recurring}
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        {job.notes && (
          <div className="bg-white rounded-xl border border-paper-deep p-5 col-span-2">
            <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <StickyNote className="w-3.5 h-3.5" /> Notes
            </p>
            <p className="text-[13px] text-ink-soft leading-relaxed">{job.notes}</p>
          </div>
        )}
      </div>

      {/* Estimate & Invoice */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-paper-deep p-5">
          <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Estimate
          </p>
          {estimate ? (
            <Link to={`/estimates/${estimate.id}`} className="block hover:bg-paper-warm -mx-2 px-2 py-2 rounded-lg transition-colors">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold text-ink">${estimate.total?.toLocaleString()}</p>
                <Badge variant={estimate.status === "approved" ? "success" : estimate.status === "sent" ? "warning" : "muted"}>
                  {estimateStatusLabel(estimate.status)}
                </Badge>
              </div>
              <p className="text-[11px] text-ink-quiet mt-0.5">{estimate.line_items?.length ?? 0} line items</p>
            </Link>
          ) : (
            <div>
              <p className="text-[13px] text-ink-quiet mb-2">No estimate yet</p>
              <Button size="sm" variant="secondary" className="w-auto text-[12px] h-8" onClick={() => navigate("/estimates", { state: { prefillCustomerId: job.customerId, prefillJobId: job.id } })}>Create estimate</Button>
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
                <p className="text-[13px] font-semibold text-ink">${invoice.total?.toLocaleString()}</p>
                <Badge variant={invoice.status === "paid" ? "success" : invoice.status === "overdue" ? "error" : invoice.status === "sent" ? "warning" : "muted"}>
                  {invoiceStatusLabel(invoice.status)}
                </Badge>
              </div>
              <p className="text-[11px] text-ink-quiet mt-0.5">{invoice.due_at ? `Due ${invoice.due_at}` : "No due date"}</p>
            </Link>
          ) : (
            <div>
              <p className="text-[13px] text-ink-quiet mb-3">No invoice yet</p>
              {conversionError && <p role="alert" className="mb-2 text-red-700 text-sm">{conversionError}</p>}
              <Button
                size="sm"
                className="w-auto text-[12px] h-8 gap-1.5"
                onClick={handleConvertToInvoice}
                loading={convertingInvoice}
              >
                <Zap className="w-3.5 h-3.5" />
                {estimate ? "Convert to Invoice" : "Create Invoice"}
              </Button>
              {estimate && (
                <p className="text-[11px] text-ink-quiet mt-1.5">Copies estimate line items automatically</p>
              )}
              {!estimate && (
                <p className="text-[11px] text-ink-quiet mt-1.5">Uses the job price. Set a price before creating the invoice.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Crew Assignment ── */}
      <div className="bg-white rounded-xl border border-paper-deep mb-5 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-paper-warm border-b border-paper-deep">
          <p className="text-[12px] font-semibold text-ink-quiet uppercase tracking-wide flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Crew Assigned
            {crewIds.length > 0 && <span className="font-normal ml-1">{crewIds.length}</span>}
          </p>
          <Link to="/scheduling" className="text-sm underline">Review crew schedule</Link>
          {crewSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-quiet" />}
        </div>
        <div className="px-5 py-4">
          {allCrew.length === 0 ? (
            <p className="text-[13px] text-ink-quiet">No crew members added yet. <a href="/crew" className="text-accent hover:underline">Add crew →</a></p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allCrew.map((m) => {
                const assigned = crewIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => saveCrew(assigned ? crewIds.filter(i => i !== m.id) : [...crewIds, m.id])}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[13px] font-medium transition-colors ${
                      assigned ? "bg-ink text-white border-ink" : "bg-white text-ink-soft border-paper-deep hover:bg-paper-warm"
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${assigned ? "bg-white/20 text-white" : "bg-paper-dark text-ink-soft"}`}>
                      {m.name.split(" ").map((n:string) => n[0]).join("").slice(0,2).toUpperCase()}
                    </div>
                    {m.name}
                    {assigned && <CheckCircle2 className="w-3.5 h-3.5 opacity-70" />}
                  </button>
                );
              })}
            </div>
          )}
          {timeEntries.length > 0 && (() => {
            // group entries by crew_member_id
            const byMember: Record<string, number> = {};
            timeEntries.forEach((e) => {
              if (!e.clocked_out_at) return; // skip active (no end time)
              const ms = new Date(e.clocked_out_at).getTime() - new Date(e.clocked_in_at).getTime();
              byMember[e.crew_member_id] = (byMember[e.crew_member_id] ?? 0) + ms;
            });
            const activeEntry = timeEntries.find((e) => !e.clocked_out_at);
            const entries = Object.entries(byMember);
            if (entries.length === 0 && !activeEntry) return null;
            return (
              <div className="mt-3 pt-3 border-t border-paper-deep">
                <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide mb-2">Time Logged</p>
                <div className="flex flex-wrap gap-2">
                  {entries.map(([memberId, ms]) => {
                    const m = allCrew.find((c) => c.id === memberId);
                    return (
                      <span key={memberId} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-paper-warm border border-paper-deep rounded-lg text-[12px] font-medium text-ink">
                        <span className="text-[10px] font-bold">{(m?.name ?? "Unknown").split(" ").map((n:string) => n[0]).join("").slice(0,2).toUpperCase()}</span>
                        {formatDuration(ms)}
                      </span>
                    );
                  })}
                  {activeEntry && (() => {
                    const m = allCrew.find((c) => c.id === activeEntry.crew_member_id);
                    const elapsed = Date.now() - new Date(activeEntry.clocked_in_at).getTime();
                    return (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[#e8f5e9] border border-[#a5d6a7] rounded-lg text-[12px] font-medium text-[#2e7d32]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#4caf50] animate-pulse" />
                        <span className="text-[10px] font-bold">{(m?.name ?? "Unknown").split(" ").map((n:string) => n[0]).join("").slice(0,2).toUpperCase()}</span>
                        {formatDuration(elapsed)} (active)
                      </span>
                    );
                  })()}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── Checklist ── */}
      <div className="bg-white rounded-xl border border-paper-deep mb-5 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-paper-warm border-b border-paper-deep">
          <p className="text-[12px] font-semibold text-ink-quiet uppercase tracking-wide flex items-center gap-1.5">
            <ListChecks className="w-3.5 h-3.5" /> Checklist
            {checklist.length > 0 && (
              <span className="ml-1 text-[11px] text-ink-quiet font-normal">
                {checklist.filter((i) => i.done).length}/{checklist.length}
              </span>
            )}
          </p>
          {checklistSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-quiet" />}
        </div>
        <div className="px-5 py-4">
          {checklist.length > 0 && (
            <div className="space-y-1.5 mb-4">
              {checklist.map((item) => (
                <div key={item.id} className="flex items-center gap-3 group">
                  <button
                    onClick={() => toggleChecklistItem(item.id)}
                    className={`w-4.5 h-4.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                      item.done ? "bg-moss border-moss text-white" : "border-paper-deep bg-white hover:border-ink/30"
                    }`}
                  >
                    {item.done && <CheckCircle2 className="w-3 h-3" />}
                  </button>
                  <span className={`flex-1 text-[13px] transition-colors ${item.done ? "line-through text-ink-quiet" : "text-ink"}`}>
                    {item.text}
                  </span>
                  <button
                    onClick={() => removeChecklistItem(item.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-paper-warm text-ink-quiet transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addChecklistTask(); }}
              placeholder="Add a task…"
              className="flex-1 px-3 py-2 text-[13px] border border-paper-deep rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors"
            />
            <button
              onClick={addChecklistTask}
              disabled={!newTaskText.trim()}
              className="px-3 py-2 rounded-lg bg-ink text-white text-[13px] font-medium disabled:opacity-40 hover:bg-ink/90 transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
        </div>
      </div>

      {/* ── Job Media button ── */}
      {(() => {
        const beforeCount = jobMedia.filter((m) => m.tag === "before").length;
        const afterCount = jobMedia.filter((m) => m.tag === "after").length;
        const totalCount = jobMedia.length;
        return (
          <div className="flex items-center gap-2 mb-5">
            <button
              onClick={() => setLightboxIdx(jobMedia.length > 0 ? 0 : null)}
              className="flex items-center gap-2.5 px-4 py-2.5 bg-white border border-paper-deep rounded-xl hover:border-ink/20 hover:shadow-sm transition-all group"
            >
              {/* Thumbnail stack preview */}
              {totalCount > 0 ? (
                <div className="flex -space-x-2">
                  {jobMedia.slice(0, 3).map((m, i) => (
                    <div key={m.id} className="w-8 h-8 rounded-lg overflow-hidden border-2 border-white flex-shrink-0" style={{ zIndex: 3 - i }}>
                      {m.file_type?.startsWith("video/")
                        ? <div className="w-full h-full bg-paper-dark flex items-center justify-center"><Play className="w-3 h-3 text-ink-quiet" /></div>
                        : <PrivateImage src={m.url} alt="" className="w-full h-full object-cover" />}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-paper-dark flex items-center justify-center">
                  <Camera className="w-4 h-4 text-ink-quiet" />
                </div>
              )}
              <div className="text-left">
                <p className="text-[13px] font-semibold text-ink group-hover:text-accent transition-colors">
                  {totalCount === 0 ? "Before & After Photos" : `${totalCount} Photo${totalCount !== 1 ? "s" : ""}`}
                </p>
                <p className="text-[11px] text-ink-quiet">
                  {totalCount === 0
                    ? "None added yet"
                    : `${beforeCount} before · ${afterCount} after`}
                </p>
              </div>
              <Camera className="w-4 h-4 text-ink-quiet ml-1 group-hover:text-accent transition-colors" />
            </button>

            {/* Upload buttons always visible */}
            {mediaUploading && <Loader2 className="w-4 h-4 animate-spin text-ink-quiet" />}
            <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold cursor-pointer bg-[#fff3e0] text-[#e65100] hover:bg-[#ffe0b2] transition-colors border border-[#ffcc80]">
              <input type="file" accept="image/*,video/*" multiple capture="environment" className="hidden"
                onChange={(e) => handleQuickMediaUpload(e, "before")} />
              + Before
            </label>
            <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold cursor-pointer bg-[#e8f5e9] text-[#2e7d32] hover:bg-[#c8e6c9] transition-colors border border-[#a5d6a7]">
              <input type="file" accept="image/*,video/*" multiple capture="environment" className="hidden"
                onChange={(e) => handleQuickMediaUpload(e, "after")} />
              + After
            </label>
          </div>
        );
      })()}

      {mediaError && (
        <div className="mb-5 bg-[#fef2f2] border border-[#fecaca] rounded-xl px-4 py-3 text-[13px] text-[#dc2626] flex items-start gap-2">
          <span className="flex-1">{mediaError}</span>
          <button onClick={() => setMediaError(null)} className="text-[#dc2626]/60 hover:text-[#dc2626] flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Media modal */}
      {lightboxIdx !== null && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setLightboxIdx(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <MediaModal
              media={jobMedia}
              initialIdx={lightboxIdx}
              onClose={() => setLightboxIdx(null)}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        {job.status === "scheduled" && (
          <Button size="sm" className="w-auto gap-1.5" disabled={statusSaving} onClick={() => updateStatus("in-progress")}>
            Start Job
          </Button>
        )}
        {job.status === "in-progress" && (
          <Button size="sm" className="w-auto gap-1.5 bg-moss hover:bg-moss-dark" disabled={statusSaving} onClick={() => updateStatus("complete")}>
            <CheckCircle2 className="w-4 h-4" /> Mark Complete
          </Button>
        )}
        <Button size="sm" variant="secondary" className="w-auto" onClick={openEdit}>
          Edit Job
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="w-auto gap-1.5 text-[#c62828] hover:bg-[#ffebee] hover:text-[#b71c1c]"
          onClick={() => { setDeleteError(null); setShowDeleteConfirm(true); }}
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </Button>
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-sm p-6">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 rounded-full bg-[#ffebee] flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-[#c62828]" />
              </div>
              <div>
                <h2 className="text-[16px] font-semibold text-ink">Delete this job?</h2>
                <p className="text-[13px] text-ink-quiet mt-1">
                  <span className="font-medium text-ink">"{job.title}"</span> will be permanently deleted. This cannot be undone.
                </p>
              </div>
            </div>
            {deleteError && (
              <div className="bg-[#ffebee] border border-[#ef9a9a] rounded-lg px-4 py-3 text-[13px] text-[#b71c1c] mb-4">
                {deleteError}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>Cancel</Button>
              <Button className="flex-1 bg-[#c62828] hover:bg-[#b71c1c] border-[#c62828]" onClick={handleDelete} loading={deleting}>Delete Job</Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Job Modal */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowEdit(false)} />
          <div className="relative bg-white rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-paper-deep">
              <h2 className="text-[16px] font-semibold text-ink">Edit Job</h2>
              <button onClick={() => setShowEdit(false)} className="p-1.5 rounded-lg hover:bg-paper-warm text-ink-quiet">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Customer */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Customer <span className="text-accent">*</span></label>
                <div className="relative">
                  <select value={editCustomerId} onChange={(e) => setEditCustomerId(e.target.value)}
                    className={`w-full px-3 py-2.5 text-[14px] border rounded-lg bg-white appearance-none focus:outline-none transition-colors ${
                      editErrors.customerId ? "border-accent" : "border-paper-deep focus:border-ink"
                    }`}>
                    <option value="">Select a customer…</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-quiet pointer-events-none" />
                </div>
                {editErrors.customerId && <p className="text-[11px] text-accent mt-1">{editErrors.customerId}</p>}
              </div>

              {/* Title */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Job Title <span className="text-accent">*</span></label>
                <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="e.g. Weekly Lawn Mow"
                  className={`w-full px-3 py-2.5 text-[14px] border rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none transition-colors ${
                    editErrors.title ? "border-accent" : "border-paper-deep focus:border-ink"
                  }`} />
                {editErrors.title && <p className="text-[11px] text-accent mt-1">{editErrors.title}</p>}
              </div>

              {/* Price */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Job Price ($)</label>
                <input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} placeholder="0.00" min="0" step="0.01"
                  className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors" />
              </div>

              {/* Service type */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Service Type</label>
                <div className="relative">
                  <select value={editServiceType} onChange={(e) => setEditServiceType(e.target.value)}
                    className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white appearance-none focus:outline-none focus:border-ink transition-colors">
                    {services.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-quiet pointer-events-none" />
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Status</label>
                <div className="relative">
                  <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white appearance-none focus:outline-none focus:border-ink transition-colors">
                    {JOB_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-quiet pointer-events-none" />
                </div>
              </div>

              {/* Date / Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Date</label>
                  <input type="date" value={editScheduledDate} onChange={(e) => setEditScheduledDate(e.target.value)}
                    className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors" />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Time</label>
                  <input type="time" value={editScheduledTime} onChange={(e) => setEditScheduledTime(e.target.value)}
                    className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors" />
                </div>
              </div>

              <label className="block text-sm">Duration (minutes)<input aria-label="Duration (minutes)" type="number" min="1" max="1440" value={editDuration} onChange={e=>setEditDuration(e.target.value)} className="block w-full border rounded p-2" /></label>
              {/* Recurring */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">
                  <RefreshCw className="w-3 h-3 inline mr-1" /> Recurring Schedule
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {RECURRING_OPTIONS.map((opt) => (
                    <button key={opt.value} type="button" onClick={() => setEditRecurring(opt.value)}
                      className={`px-3 py-2.5 rounded-lg text-[13px] font-medium text-left transition-colors border ${
                        editRecurring === opt.value ? "bg-ink text-white border-ink" : "bg-white border-paper-deep text-ink-soft hover:border-ink"
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Notes</label>
                <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Any special instructions…" rows={3}
                  className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors resize-none" />
              </div>

              {saveError && (
                <div className="bg-[#ffebee] border border-[#ef9a9a] rounded-lg px-4 py-3 text-[13px] text-[#b71c1c]">{saveError}</div>
              )}
            </div>

            <div className="flex gap-2 px-6 py-4 border-t border-paper-deep">
              <Button variant="secondary" className="w-auto flex-1" onClick={() => setShowEdit(false)} disabled={saving}>Cancel</Button>
              <Button className="flex-1" onClick={handleSave} loading={saving}>Save Changes</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
