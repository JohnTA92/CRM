import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/design-system/primitives/Button";
import { Users, Plus, X, Phone, Mail, Pencil, Loader2, User, CheckCircle2, Link2 } from "lucide-react";

type CrewMember = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: string;
  active: boolean;
};

const ROLES = ["crew", "lead", "supervisor", "admin"];

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-ink-quiet mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors" />
    </div>
  );
}

const EMPTY = { name: "", phone: "", email: "", role: "crew" };

export function CrewPage() {
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function copyPortalLink(m: CrewMember) {
    const url = `${window.location.origin}/crew-portal/${m.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(m.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("crew_members").select("*").order("name");
    if (data) setCrew(data);
    setLoading(false);
  }

  const set = (f: string) => (v: string) => setForm((p) => ({ ...p, [f]: v }));

  function openNew() {
    setForm(EMPTY);
    setEditingId(null);
    setSaveError(null);
    setShowModal(true);
  }

  function openEdit(m: CrewMember) {
    setForm({ name: m.name, phone: m.phone ?? "", email: m.email ?? "", role: m.role });
    setEditingId(m.id);
    setSaveError(null);
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setSaveError("Name is required."); return; }
    setSaving(true);
    setSaveError(null);
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      role: form.role,
    };
    if (editingId) {
      const { data, error } = await supabase.from("crew_members").update(payload).eq("id", editingId).select().single();
      if (error) { setSaveError(error.message); setSaving(false); return; }
      setCrew((prev) => prev.map((m) => m.id === editingId ? data : m));
    } else {
      const { data, error } = await supabase.from("crew_members").insert({ ...payload, active: true }).select().single();
      if (error) { setSaveError(error.message); setSaving(false); return; }
      setCrew((prev) => [...prev, data]);
    }
    setSaving(false);
    setShowModal(false);
  }

  async function toggleActive(m: CrewMember) {
    await supabase.from("crew_members").update({ active: !m.active }).eq("id", m.id);
    setCrew((prev) => prev.map((c) => c.id === m.id ? { ...c, active: !m.active } : c));
  }

  const active = crew.filter((m) => m.active);
  const inactive = crew.filter((m) => !m.active);

  const roleColor: Record<string, string> = {
    crew: "bg-paper-warm text-ink-soft border-paper-deep",
    lead: "bg-[#e3f2fd] text-[#1565c0] border-[#90caf9]",
    supervisor: "bg-[#f3e5f5] text-[#6a1b9a] border-[#ce93d8]",
    admin: "bg-[#e8f5e9] text-[#2e7d32] border-[#a5d6a7]",
  };

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-[22px] font-semibold text-ink flex items-center gap-2">
            <Users className="w-5 h-5 text-ink-quiet" /> Crew
          </h1>
          <p className="text-[14px] text-ink-quiet mt-1">
            {loading ? "Loading…" : `${active.length} active member${active.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button size="sm" className="w-auto gap-1.5" onClick={openNew}>
          <Plus className="w-4 h-4" /> Add Member
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-16 justify-center text-ink-quiet">
          <Loader2 className="w-4 h-4 animate-spin" /><span className="text-[14px]">Loading…</span>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-paper-deep overflow-hidden mb-6">
            {active.length === 0 ? (
              <div className="py-16 flex flex-col items-center text-center">
                <User className="w-8 h-8 text-ink-quiet opacity-30 mb-2" />
                <p className="text-[14px] text-ink-quiet">No crew members yet. Add your first one.</p>
              </div>
            ) : (
              <div className="divide-y divide-paper-deep">
                {active.map((m) => (
                  <div key={m.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="w-10 h-10 rounded-full bg-paper-dark flex items-center justify-center text-[13px] font-semibold text-ink-soft flex-shrink-0">
                      {m.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-ink">{m.name}</p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {m.phone && <span className="flex items-center gap-1 text-[12px] text-ink-quiet"><Phone className="w-3 h-3" />{m.phone}</span>}
                        {m.email && <span className="flex items-center gap-1 text-[12px] text-ink-quiet"><Mail className="w-3 h-3" />{m.email}</span>}
                      </div>
                    </div>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize ${roleColor[m.role] ?? roleColor.crew}`}>
                      {m.role}
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => copyPortalLink(m)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-paper-warm text-ink-quiet transition-colors text-[11px] font-medium"
                        title="Copy portal link"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        {copiedId === m.id ? "Copied!" : "Portal"}
                      </button>
                      <button onClick={() => openEdit(m)} className="p-1.5 rounded-lg hover:bg-paper-warm text-ink-quiet transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => toggleActive(m)} className="p-1.5 rounded-lg hover:bg-paper-warm text-ink-quiet transition-colors" title="Deactivate">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {inactive.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold text-ink-quiet uppercase tracking-wide mb-3">Inactive</p>
              <div className="bg-white rounded-xl border border-paper-deep divide-y divide-paper-deep overflow-hidden">
                {inactive.map((m) => (
                  <div key={m.id} className="flex items-center gap-4 px-5 py-3 opacity-50">
                    <div className="w-9 h-9 rounded-full bg-paper-dark flex items-center justify-center text-[12px] font-semibold text-ink-soft flex-shrink-0">
                      {m.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-ink">{m.name}</p>
                      <p className="text-[12px] text-ink-quiet capitalize">{m.role}</p>
                    </div>
                    <button onClick={() => toggleActive(m)} className="text-[12px] text-ink-quiet hover:text-ink flex items-center gap-1 transition-colors">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Reactivate
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-md flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-paper-deep">
              <h2 className="text-[16px] font-semibold text-ink">{editingId ? "Edit Member" : "Add Crew Member"}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-paper-warm text-ink-quiet"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <Field label="Full Name" value={form.name} onChange={set("name")} placeholder="Jane Smith" />
              <Field label="Phone" value={form.phone} onChange={set("phone")} placeholder="555-000-0000" type="tel" />
              <Field label="Email" value={form.email} onChange={set("email")} placeholder="jane@email.com" type="email" />
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1">Role</label>
                <div className="grid grid-cols-4 gap-2">
                  {ROLES.map((r) => (
                    <button key={r} onClick={() => set("role")(r)}
                      className={`py-2 rounded-lg text-[13px] font-medium capitalize border transition-colors ${form.role === r ? "bg-ink text-white border-ink" : "bg-white text-ink-soft border-paper-deep hover:bg-paper-warm"}`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              {saveError && <p className="text-[12px] text-red-500">{saveError}</p>}
            </div>
            <div className="flex gap-2 px-6 py-4 border-t border-paper-deep">
              <Button variant="secondary" className="flex-1" onClick={() => setShowModal(false)} disabled={saving}>Cancel</Button>
              <Button className="flex-1" onClick={handleSave} loading={saving}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
