import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/design-system/primitives/Button";
import { supabase } from "@/lib/supabase";
import { Plus, Search, Loader2, X, ChevronDown, Trash2, TriangleAlert, ImagePlus, ZoomIn } from "lucide-react";

// ─── types ───────────────────────────────────────────────────────────────────

export type ExpenseCategory =
  | "materials"
  | "fuel"
  | "labor"
  | "equipment"
  | "overhead"
  | "other";

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string; color: string }[] = [
  { value: "materials",  label: "Materials",  color: "bg-[#e3f2fd] text-[#1565c0]" },
  { value: "fuel",       label: "Fuel",       color: "bg-[#fff3e0] text-[#e65100]" },
  { value: "labor",      label: "Labor",      color: "bg-[#f3e5f5] text-[#6a1b9a]" },
  { value: "equipment",  label: "Equipment",  color: "bg-[#e8f5e9] text-[#2e7d32]" },
  { value: "overhead",   label: "Overhead",   color: "bg-[#fce4ec] text-[#880e4f]" },
  { value: "other",      label: "Other",      color: "bg-paper-warm text-ink-soft" },
];

function categoryStyle(cat: string) {
  return EXPENSE_CATEGORIES.find((c) => c.value === cat)?.color ?? "bg-paper-warm text-ink-soft";
}
function categoryLabel(cat: string) {
  return EXPENSE_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}

// ─── component ───────────────────────────────────────────────────────────────

export function ExpensesPage() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState<ExpenseCategory | "all">("all");

  // delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // form
  const [fAmount, setFAmount] = useState("");
  const [fCategory, setFCategory] = useState<ExpenseCategory>("materials");
  const [fDescription, setFDescription] = useState("");
  const [fDate, setFDate] = useState(new Date().toISOString().split("T")[0]);
  const [fJobId, setFJobId] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [fPhoto, setFPhoto] = useState<File | null>(null);
  const [fPhotoPreview, setFPhotoPreview] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [expRes, jobRes] = await Promise.all([
      supabase.from("expenses").select("*").order("date", { ascending: false }),
      supabase.from("jobs").select("id, title").order("created_at", { ascending: false }),
    ]);
    if (expRes.data) setExpenses(expRes.data);
    if (jobRes.data) setJobs(jobRes.data);
    setLoading(false);
  }

  function resetForm() {
    setFAmount(""); setFCategory("materials"); setFDescription("");
    setFDate(new Date().toISOString().split("T")[0]);
    setFJobId(""); setFNotes(""); setFormErrors({});
    setSaveError(null);
    setFPhoto(null);
    setFPhotoPreview(null);
  }

  function handlePhotoChange(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setSaveError("Only image files are supported."); return; }
    if (file.size > 10 * 1024 * 1024) { setSaveError("Photo must be under 10 MB."); return; }
    setFPhoto(file);
    const reader = new FileReader();
    reader.onload = (e) => setFPhotoPreview(e.target?.result as string);
    reader.readAsDataURL(file);
    setSaveError(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handlePhotoChange(file);
  }

  async function uploadPhoto(file: File, expenseId: string): Promise<string | null> {
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${expenseId}.${ext}`;
    const { error } = await supabase.storage.from("expense-receipts").upload(path, file, { upsert: true });
    if (error) return null;
    const { data } = supabase.storage.from("expense-receipts").getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSubmit() {
    const errs: Record<string, string> = {};
    if (!fAmount || isNaN(parseFloat(fAmount)) || parseFloat(fAmount) <= 0) errs.amount = "Enter a valid amount";
    if (!fDescription.trim()) errs.description = "Required";
    if (!fDate) errs.date = "Required";
    if (Object.keys(errs).length) { setFormErrors(errs); return; }

    setSaving(true);
    setSaveError(null);

    // Insert first to get the ID, then upload photo
    const { data, error } = await supabase.from("expenses").insert({
      amount: parseFloat(fAmount),
      category: fCategory,
      description: fDescription.trim(),
      date: fDate,
      job_id: fJobId || null,
      notes: fNotes.trim() || null,
      receipt_url: null,
    }).select().single();

    if (error) { setSaveError(error.message); setSaving(false); return; }

    let receipt_url: string | null = null;
    if (fPhoto && data) {
      receipt_url = await uploadPhoto(fPhoto, data.id);
      if (receipt_url) {
        await supabase.from("expenses").update({ receipt_url }).eq("id", data.id);
      }
    }

    if (data) setExpenses((prev) => [{ ...data, receipt_url }, ...prev]);
    setSaving(false);
    setShowModal(false);
    resetForm();
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    // also remove storage file if exists
    const exp = expenses.find((e) => e.id === id);
    if (exp?.receipt_url) {
      const path = exp.receipt_url.split("/expense-receipts/")[1];
      if (path) await supabase.storage.from("expense-receipts").remove([path]);
    }
    await supabase.from("expenses").delete().eq("id", id);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    setDeleteId(null);
    setDeleting(false);
  }

  const filtered = expenses.filter((e) => {
    const matchCat = catFilter === "all" || e.category === catFilter;
    const matchQ = query === "" || e.description.toLowerCase().includes(query.toLowerCase());
    return matchCat && matchQ;
  });

  const totalFiltered = filtered.reduce((s, e) => s + (e.amount ?? 0), 0);
  const totalAll = expenses.reduce((s, e) => s + (e.amount ?? 0), 0);
  const mtdPrefix = new Date().toISOString().slice(0, 7);
  const mtdTotal = expenses.filter((e) => e.date?.startsWith(mtdPrefix)).reduce((s, e) => s + (e.amount ?? 0), 0);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-[22px] font-semibold text-ink">Expenses</h1>
          <p className="text-[14px] text-ink-quiet mt-1">
            {loading ? "Loading…" : `${expenses.length} total · $${totalAll.toLocaleString()} · $${mtdTotal.toLocaleString()} this month`}
          </p>
        </div>
        <Button size="sm" className="w-auto gap-1.5" onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4" /> Add Expense
        </Button>
      </div>

      {/* Summary by category */}
      {!loading && expenses.length > 0 && (
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {EXPENSE_CATEGORIES.map((cat) => {
            const catTotal = expenses.filter((e) => e.category === cat.value).reduce((s, e) => s + (e.amount ?? 0), 0);
            return (
              <button
                key={cat.value}
                onClick={() => setCatFilter(catFilter === cat.value ? "all" : cat.value)}
                className={`bg-white rounded-xl border p-3 text-left transition-colors ${
                  catFilter === cat.value ? "border-ink ring-2 ring-ink/10" : "border-paper-deep hover:border-ink/30"
                }`}
              >
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cat.color}`}>{cat.label}</span>
                <p className="text-[16px] font-bold text-ink mt-2">${catTotal.toLocaleString()}</p>
                <p className="text-[11px] text-ink-quiet mt-0.5">{expenses.filter((e) => e.category === cat.value).length} entries</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-quiet" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search expenses…"
            className="w-full pl-9 pr-4 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setCatFilter("all")} className={`px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${catFilter === "all" ? "bg-ink text-white" : "bg-paper-warm text-ink-soft hover:bg-paper-dark"}`}>All</button>
          {EXPENSE_CATEGORIES.map((c) => (
            <button key={c.value} onClick={() => setCatFilter(catFilter === c.value ? "all" : c.value)}
              className={`px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${catFilter === c.value ? "bg-ink text-white" : "bg-paper-warm text-ink-soft hover:bg-paper-dark"}`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
        {loading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-ink-quiet">
            <Loader2 className="w-4 h-4 animate-spin" /><span className="text-[14px]">Loading expenses…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-[14px] text-ink-quiet">
            {expenses.length === 0 ? "No expenses logged yet." : "No expenses match your filter."}
          </div>
        ) : (
          <>
            <div className="divide-y divide-paper-deep">
              {filtered.map((exp) => {
                const job = jobs.find((j) => j.id === exp.job_id);
                return (
                  <div key={exp.id} className="flex items-center gap-4 px-5 py-4 hover:bg-paper-warm group transition-colors">
                    {/* Receipt thumbnail */}
                    <div className="w-10 h-10 flex-shrink-0">
                      {exp.receipt_url ? (
                        <button
                          onClick={() => setLightboxUrl(exp.receipt_url)}
                          className="w-10 h-10 rounded-lg overflow-hidden border border-paper-deep hover:border-accent transition-colors relative group/thumb"
                        >
                          <img src={exp.receipt_url} alt="receipt" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/20 flex items-center justify-center transition-colors">
                            <ZoomIn className="w-3.5 h-3.5 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity" />
                          </div>
                        </button>
                      ) : (
                        <div className="w-10 h-10 rounded-lg border border-dashed border-paper-deep bg-paper-warm flex items-center justify-center">
                          <ImagePlus className="w-4 h-4 text-ink-quiet/40" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-ink truncate">{exp.description}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${categoryStyle(exp.category)}`}>
                          {categoryLabel(exp.category)}
                        </span>
                        <span className="text-[12px] text-ink-quiet">{exp.date}</span>
                        {job && (
                          <>
                            <span className="text-[12px] text-ink-quiet">·</span>
                            <Link to={`/jobs/${job.id}`} className="text-[12px] text-accent hover:underline">{job.title}</Link>
                          </>
                        )}
                        {exp.notes && (
                          <>
                            <span className="text-[12px] text-ink-quiet">·</span>
                            <span className="text-[12px] text-ink-quiet italic truncate max-w-48">{exp.notes}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <p className="text-[16px] font-bold text-ink flex-shrink-0">${Number(exp.amount).toLocaleString()}</p>
                    <button
                      onClick={() => setDeleteId(exp.id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-[#ffebee] text-ink-quiet hover:text-[#c62828] transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-paper-deep bg-paper-warm">
              <p className="text-[13px] text-ink-quiet">{filtered.length} expense{filtered.length !== 1 ? "s" : ""} shown</p>
              <p className="text-[15px] font-bold text-ink">${totalFiltered.toLocaleString()}</p>
            </div>
          </>
        )}
      </div>

      {/* ── Add Expense Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setShowModal(false); resetForm(); }} />
          <div className="relative bg-white rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-paper-deep">
              <h2 className="text-[16px] font-semibold text-ink">Add Expense</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="p-1.5 rounded-lg hover:bg-paper-warm text-ink-quiet">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Amount */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Amount <span className="text-accent">*</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-ink-quiet">$</span>
                  <input type="number" step="0.01" min="0" value={fAmount} onChange={(e) => setFAmount(e.target.value)}
                    placeholder="0.00"
                    className={`w-full pl-7 pr-4 py-2.5 text-[14px] border rounded-lg bg-white focus:outline-none transition-colors ${formErrors.amount ? "border-accent" : "border-paper-deep focus:border-ink"}`} />
                </div>
                {formErrors.amount && <p className="text-[11px] text-accent mt-1">{formErrors.amount}</p>}
              </div>

              {/* Description */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Description <span className="text-accent">*</span></label>
                <input type="text" value={fDescription} onChange={(e) => setFDescription(e.target.value)}
                  placeholder="e.g. Mulch bags, Gas fill-up"
                  className={`w-full px-3 py-2.5 text-[14px] border rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none transition-colors ${formErrors.description ? "border-accent" : "border-paper-deep focus:border-ink"}`} />
                {formErrors.description && <p className="text-[11px] text-accent mt-1">{formErrors.description}</p>}
              </div>

              {/* Category */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Category</label>
                <div className="grid grid-cols-3 gap-2">
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <button key={cat.value} type="button" onClick={() => setFCategory(cat.value)}
                      className={`px-3 py-2 rounded-lg text-[12px] font-semibold transition-colors border ${fCategory === cat.value ? "bg-ink text-white border-ink" : "bg-white border-paper-deep text-ink-soft hover:border-ink"}`}>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Date <span className="text-accent">*</span></label>
                <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)}
                  className={`w-full px-3 py-2.5 text-[14px] border rounded-lg bg-white focus:outline-none transition-colors ${formErrors.date ? "border-accent" : "border-paper-deep focus:border-ink"}`} />
              </div>

              {/* Receipt Photo */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">
                  Receipt Photo <span className="text-ink-quiet font-normal">(optional)</span>
                </label>
                {fPhotoPreview ? (
                  <div className="relative">
                    <img src={fPhotoPreview} alt="receipt preview" className="w-full max-h-48 object-contain rounded-xl border border-paper-deep bg-paper-warm" />
                    <button
                      type="button"
                      onClick={() => { setFPhoto(null); setFPhotoPreview(null); }}
                      className="absolute top-2 right-2 w-7 h-7 bg-white rounded-full shadow border border-paper-deep flex items-center justify-center hover:bg-[#ffebee] hover:text-[#c62828] transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-paper-deep rounded-xl px-4 py-8 flex flex-col items-center gap-2 cursor-pointer hover:border-accent hover:bg-[#f5f9ff] transition-colors"
                  >
                    <ImagePlus className="w-6 h-6 text-ink-quiet" />
                    <p className="text-[13px] font-medium text-ink-soft">Click to upload or drag & drop</p>
                    <p className="text-[11px] text-ink-quiet">JPG, PNG, HEIC — max 10 MB</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
                />
              </div>

              {/* Link to job */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Link to Job (optional)</label>
                <div className="relative">
                  <select value={fJobId} onChange={(e) => setFJobId(e.target.value)}
                    className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white appearance-none focus:outline-none focus:border-ink transition-colors">
                    <option value="">No job attached</option>
                    {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-quiet pointer-events-none" />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Notes (optional)</label>
                <textarea value={fNotes} onChange={(e) => setFNotes(e.target.value)} placeholder="Any additional details…" rows={2}
                  className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors resize-none" />
              </div>

              {saveError && (
                <div className="bg-[#ffebee] border border-[#ef9a9a] rounded-lg px-4 py-3 text-[13px] text-[#b71c1c]">{saveError}</div>
              )}
            </div>

            <div className="flex gap-2 px-6 py-4 border-t border-paper-deep">
              <Button variant="secondary" className="w-auto flex-1" onClick={() => { setShowModal(false); resetForm(); }} disabled={saving}>Cancel</Button>
              <Button className="flex-1" onClick={handleSubmit} loading={saving}>
                {fPhoto ? "Save & Upload Receipt" : "Save Expense"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Receipt Lightbox ── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button className="absolute top-4 right-4 w-9 h-9 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors">
            <X className="w-5 h-5 text-white" />
          </button>
          <img
            src={lightboxUrl}
            alt="receipt"
            className="max-w-full max-h-full rounded-xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* ── Delete confirm ── */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteId(null)} />
          <div className="relative bg-white rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-sm p-6">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 rounded-full bg-[#ffebee] flex items-center justify-center flex-shrink-0">
                <TriangleAlert className="w-5 h-5 text-[#c62828]" />
              </div>
              <div>
                <h2 className="text-[16px] font-semibold text-ink">Delete expense?</h2>
                <p className="text-[13px] text-ink-quiet mt-1">This cannot be undone. Any attached receipt photo will also be deleted.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setDeleteId(null)} disabled={deleting}>Cancel</Button>
              <Button className="flex-1 bg-[#c62828] hover:bg-[#b71c1c] border-[#c62828]" onClick={() => handleDelete(deleteId)} loading={deleting}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
