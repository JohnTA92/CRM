import { useState, useEffect } from "react";
import { Button } from "@/design-system/primitives/Button";
import { supabase } from "@/lib/supabase";
import { invalidateServicesCache } from "@/lib/services";
import {
  Plus, X, Loader2, Pencil, Trash2, TriangleAlert, GripVertical,
  Briefcase, CheckCircle2, ChevronRight,
} from "lucide-react";

const PRESET_COLORS = [
  "#e3f2fd", "#fff3e0", "#f3e5f5", "#e8f5e9",
  "#fce4ec", "#fffde7", "#e0f2f1", "#f5f5f5",
];

const TEXT_FOR_BG: Record<string, string> = {
  "#e3f2fd": "#1565c0",
  "#fff3e0": "#e65100",
  "#f3e5f5": "#6a1b9a",
  "#e8f5e9": "#2e7d32",
  "#fce4ec": "#880e4f",
  "#fffde7": "#f57f17",
  "#e0f2f1": "#00695c",
  "#f5f5f5": "#424242",
};

interface Service {
  id: string;
  value: string;
  label: string;
  description: string | null;
  color: string | null;
  active: boolean;
  created_at: string;
}

function slugify(str: string) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          style={{ background: c }}
          className={`w-7 h-7 rounded-lg border-2 transition-all ${value === c ? "border-ink scale-110 shadow-sm" : "border-transparent hover:border-ink/30"}`}
        />
      ))}
    </div>
  );
}

export function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editService, setEditService] = useState<Service | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // form
  const [fLabel, setFLabel] = useState("");
  const [fValue, setFValue] = useState("");
  const [fValueManual, setFValueManual] = useState(false);
  const [fDescription, setFDescription] = useState("");
  const [fColor, setFColor] = useState(PRESET_COLORS[0]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("services").select("*").order("label");
    if (data) setServices(data);
    setLoading(false);
  }

  function openNew() {
    setEditService(null);
    setFLabel(""); setFValue(""); setFValueManual(false);
    setFDescription(""); setFColor(PRESET_COLORS[0]);
    setFormErrors({}); setSaveError(null);
    setShowModal(true);
  }

  function openEdit(svc: Service) {
    setEditService(svc);
    setFLabel(svc.label);
    setFValue(svc.value);
    setFValueManual(true);
    setFDescription(svc.description ?? "");
    setFColor(svc.color ?? PRESET_COLORS[0]);
    setFormErrors({}); setSaveError(null);
    setShowModal(true);
  }

  function handleLabelChange(v: string) {
    setFLabel(v);
    if (!fValueManual) setFValue(slugify(v));
  }

  async function handleSave() {
    const errs: Record<string, string> = {};
    if (!fLabel.trim()) errs.label = "Required";
    if (!fValue.trim()) errs.value = "Required";
    if (Object.keys(errs).length) { setFormErrors(errs); return; }

    // Slug collision check (exclude self when editing)
    const conflict = services.find(
      (s) => s.value === fValue.trim() && s.id !== editService?.id
    );
    if (conflict) { setFormErrors({ value: "This service key already exists" }); return; }

    setSaving(true); setSaveError(null);

    if (editService) {
      const { data, error } = await supabase.from("services").update({
        label: fLabel.trim(),
        value: fValue.trim(),
        description: fDescription.trim() || null,
        color: fColor,
      }).eq("id", editService.id).select().single();
      if (error) { setSaveError(error.message); setSaving(false); return; }
      if (data) setServices((prev) => prev.map((s) => s.id === data.id ? data : s));
    } else {
      const { data, error } = await supabase.from("services").insert({
        label: fLabel.trim(),
        value: fValue.trim(),
        description: fDescription.trim() || null,
        color: fColor,
        active: true,
      }).select().single();
      if (error) { setSaveError(error.message); setSaving(false); return; }
      if (data) setServices((prev) => [...prev, data].sort((a, b) => a.label.localeCompare(b.label)));
    }

    invalidateServicesCache();
    setSaving(false);
    setShowModal(false);
  }

  async function toggleActive(svc: Service) {
    const { data } = await supabase.from("services").update({ active: !svc.active }).eq("id", svc.id).select().single();
    if (data) { setServices((prev) => prev.map((s) => s.id === data.id ? data : s)); invalidateServicesCache(); }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    await supabase.from("services").delete().eq("id", id);
    setServices((prev) => prev.filter((s) => s.id !== id));
    invalidateServicesCache();
    setDeleteId(null);
    setDeleting(false);
  }

  const activeServices = services.filter((s) => s.active);
  const inactiveServices = services.filter((s) => !s.active);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-[22px] font-semibold text-ink">Services</h1>
          <p className="text-[14px] text-ink-quiet mt-1">
            {loading ? "Loading…" : `${activeServices.length} active service${activeServices.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button size="sm" className="w-auto gap-1.5" onClick={openNew}>
          <Plus className="w-4 h-4" /> Add Service
        </Button>
      </div>

      {/* Info banner */}
      <div className="bg-[#f0f7ff] border border-[#bfdbfe] rounded-xl px-5 py-4 mb-6 flex gap-3">
        <Briefcase className="w-4 h-4 text-[#1d4ed8] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-[#1d4ed8]">Services power your whole CRM</p>
          <p className="text-[13px] text-[#3b5fc0] mt-0.5">
            Services appear in job and estimate forms, dashboard analytics, and customer profiles.
            Add the services your business actually offers and keep this list current.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-16 flex items-center justify-center gap-2 text-ink-quiet">
          <Loader2 className="w-4 h-4 animate-spin" /><span className="text-[14px]">Loading…</span>
        </div>
      ) : (
        <>
          {/* Active services */}
          <div className="bg-white rounded-xl border border-paper-deep overflow-hidden mb-6">
            <div className="px-5 py-3.5 border-b border-paper-deep bg-paper-warm flex items-center justify-between">
              <p className="text-[13px] font-semibold text-ink">Active Services</p>
              <span className="text-[12px] text-ink-quiet">{activeServices.length}</span>
            </div>
            {activeServices.length === 0 ? (
              <p className="px-5 py-8 text-center text-[14px] text-ink-quiet">No active services yet — add one above.</p>
            ) : (
              <div className="divide-y divide-paper-deep">
                {activeServices.map((svc) => (
                  <div key={svc.id} className="flex items-center gap-4 px-5 py-4 hover:bg-paper-warm group transition-colors">
                    <GripVertical className="w-4 h-4 text-ink-quiet/40 flex-shrink-0" />

                    {/* Color chip */}
                    <div
                      className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-[11px] font-bold"
                      style={{
                        background: svc.color ?? "#f5f5f5",
                        color: TEXT_FOR_BG[svc.color ?? "#f5f5f5"] ?? "#424242",
                      }}
                    >
                      {svc.label.slice(0, 2).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-ink">{svc.label}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <code className="text-[11px] font-mono bg-paper-warm border border-paper-deep rounded px-1.5 py-0.5 text-ink-quiet">{svc.value}</code>
                        {svc.description && (
                          <span className="text-[12px] text-ink-quiet truncate max-w-64">{svc.description}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(svc)} className="p-1.5 rounded-lg hover:bg-paper-deep text-ink-quiet transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => toggleActive(svc)} className="p-1.5 rounded-lg hover:bg-paper-deep text-ink-quiet transition-colors" title="Deactivate">
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteId(svc.id)} className="p-1.5 rounded-lg hover:bg-[#ffebee] text-ink-quiet hover:text-[#c62828] transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <ChevronRight className="w-4 h-4 text-ink-quiet/30 flex-shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Inactive services */}
          {inactiveServices.length > 0 && (
            <div className="bg-white rounded-xl border border-paper-deep overflow-hidden opacity-70">
              <div className="px-5 py-3.5 border-b border-paper-deep bg-paper-warm flex items-center justify-between">
                <p className="text-[13px] font-semibold text-ink-quiet">Inactive Services</p>
                <span className="text-[12px] text-ink-quiet">{inactiveServices.length}</span>
              </div>
              <div className="divide-y divide-paper-deep">
                {inactiveServices.map((svc) => (
                  <div key={svc.id} className="flex items-center gap-4 px-5 py-4 hover:bg-paper-warm group transition-colors">
                    <GripVertical className="w-4 h-4 text-ink-quiet/30 flex-shrink-0" />
                    <div className="w-8 h-8 rounded-lg bg-paper-deep flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-ink-quiet">
                      {svc.label.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-ink-soft line-through">{svc.label}</p>
                      <code className="text-[11px] font-mono text-ink-quiet">{svc.value}</code>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => toggleActive(svc)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium hover:bg-[#e8f5e9] text-ink-quiet hover:text-[#2e7d32] transition-colors border border-transparent hover:border-[#a5d6a7]">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Reactivate
                      </button>
                      <button onClick={() => setDeleteId(svc.id)} className="p-1.5 rounded-lg hover:bg-[#ffebee] text-ink-quiet hover:text-[#c62828] transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-paper-deep">
              <h2 className="text-[16px] font-semibold text-ink">{editService ? "Edit Service" : "Add Service"}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-paper-warm text-ink-quiet">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Label */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Service Name <span className="text-accent">*</span></label>
                <input
                  type="text"
                  value={fLabel}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  placeholder="e.g. Gutter Cleaning"
                  autoFocus
                  className={`w-full px-3 py-2.5 text-[14px] border rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none transition-colors ${formErrors.label ? "border-accent" : "border-paper-deep focus:border-ink"}`}
                />
                {formErrors.label && <p className="text-[11px] text-accent mt-1">{formErrors.label}</p>}
              </div>

              {/* Value / slug */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">
                  Service Key <span className="text-ink-quiet font-normal">(used internally)</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={fValue}
                    onChange={(e) => { setFValue(slugify(e.target.value)); setFValueManual(true); }}
                    placeholder="e.g. gutter-cleaning"
                    className={`w-full px-3 py-2.5 text-[14px] font-mono border rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none transition-colors ${formErrors.value ? "border-accent" : "border-paper-deep focus:border-ink"}`}
                  />
                </div>
                {formErrors.value && <p className="text-[11px] text-accent mt-1">{formErrors.value}</p>}
                <p className="text-[11px] text-ink-quiet mt-1">Auto-generated from name. Changing this on an existing service may affect jobs that already use it.</p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Description <span className="text-ink-quiet font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={fDescription}
                  onChange={(e) => setFDescription(e.target.value)}
                  placeholder="Short description for your team"
                  className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors"
                />
              </div>

              {/* Color */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-2">Color</label>
                <ColorPicker value={fColor} onChange={setFColor} />
              </div>

              {/* Preview */}
              {fLabel && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[11px] text-ink-quiet">Preview:</span>
                  <span
                    className="text-[12px] font-semibold px-2.5 py-1 rounded-full"
                    style={{ background: fColor, color: TEXT_FOR_BG[fColor] ?? "#424242" }}
                  >
                    {fLabel}
                  </span>
                </div>
              )}

              {saveError && (
                <div className="bg-[#ffebee] border border-[#ef9a9a] rounded-lg px-4 py-3 text-[13px] text-[#b71c1c]">{saveError}</div>
              )}
            </div>

            <div className="flex gap-2 px-6 py-4 border-t border-paper-deep">
              <Button variant="secondary" className="w-auto flex-1" onClick={() => setShowModal(false)} disabled={saving}>Cancel</Button>
              <Button className="flex-1" onClick={handleSave} loading={saving}>{editService ? "Save Changes" : "Add Service"}</Button>
            </div>
          </div>
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
                <h2 className="text-[16px] font-semibold text-ink">Delete service?</h2>
                <p className="text-[13px] text-ink-quiet mt-1">
                  Existing jobs that reference this service type will still show the old value as text, but it won't appear in new job dropdowns.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setDeleteId(null)} disabled={deleting}>Cancel</Button>
              <Button className="flex-1 bg-[#c62828] hover:bg-[#b71c1c] border-[#c62828]" onClick={() => handleDelete(deleteId!)} loading={deleting}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
