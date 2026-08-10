import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/design-system/primitives/Button";
import { Users, Plus, X, Phone, Mail, Pencil, Loader2, User, CheckCircle2, Link2, Timer, ChevronDown, ChevronUp, Coffee, UtensilsCrossed } from "lucide-react";

type CrewMember = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: string;
  active: boolean;
  pay_type: "hourly" | "salary" | null;
  pay_rate: number | null;
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

const EMPTY = { name: "", phone: "", email: "", role: "crew", pay_type: "hourly", pay_rate: "" };

function fmtMs(ms: number): string {
  if (ms <= 0) return "—";
  const totalMins = Math.floor(ms / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function CrewPage() {
  const { business } = useAuth();
  const businessId = business?.id ?? "";
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hoursMap, setHoursMap] = useState<Record<string, { today: number; week: number; total: number }>>({});
  const [activePunches, setActivePunches] = useState<Record<string, boolean>>({});
  const [showHours, setShowHours] = useState(true);
  const [breakSettings, setBreakSettings] = useState({ lunch_break_mins: 30, short_break_mins: 10 });
  const [savingBreaks, setSavingBreaks] = useState(false);

  function copyPortalLink(m: CrewMember) {
    const url = `${window.location.origin}/crew-portal/${m.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(m.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  useEffect(() => { load(); }, [businessId]);

  async function load() {
    setLoading(true);
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);

    const [{ data }, { data: entries }, { data: active }, { data: settings }] = await Promise.all([
      supabase.from("crew_members").select("*").eq("business_id", businessId).order("name"),
      supabase.from("time_entries")
        .select("crew_member_id, clocked_in_at, clocked_out_at, break_type")
        .eq("business_id", businessId)
        .not("clocked_out_at", "is", null),
      supabase.from("time_entries")
        .select("crew_member_id")
        .eq("business_id", businessId)
        .is("clocked_out_at", null),
      supabase.from("company_settings").select("*").eq("id", businessId).single(),
    ]);
    if (data) setCrew(data);
    if (entries) {
      const map: Record<string, { today: number; week: number; total: number }> = {};
      entries.filter((e: any) => !e.break_type).forEach((e: any) => {
        const ms = new Date(e.clocked_out_at).getTime() - new Date(e.clocked_in_at).getTime();
        const id = e.crew_member_id;
        if (!map[id]) map[id] = { today: 0, week: 0, total: 0 };
        map[id].total += ms;
        if (new Date(e.clocked_in_at) >= weekStart) map[id].week += ms;
        if (e.clocked_in_at.startsWith(todayStr)) map[id].today += ms;
      });
      setHoursMap(map);
    }
    if (active) {
      const ap: Record<string, boolean> = {};
      active.forEach((e: any) => { ap[e.crew_member_id] = true; });
      setActivePunches(ap);
    }
    if (settings) setBreakSettings({
      lunch_break_mins: settings.lunch_break_mins ?? 30,
      short_break_mins: settings.short_break_mins ?? 10,
    });
    setLoading(false);
  }

  async function saveBreakSettings(lunch: number, short: number) {
    setSavingBreaks(true);
    await supabase.from("company_settings").upsert({ id: businessId, lunch_break_mins: lunch, short_break_mins: short });
    setBreakSettings({ lunch_break_mins: lunch, short_break_mins: short });
    setSavingBreaks(false);
  }

  const set = (f: string) => (v: string) => setForm((p) => ({ ...p, [f]: v }));

  function openNew() {
    setForm(EMPTY);
    setEditingId(null);
    setSaveError(null);
    setShowModal(true);
  }

  function openEdit(m: CrewMember) {
    setForm({ name: m.name, phone: m.phone ?? "", email: m.email ?? "", role: m.role, pay_type: m.pay_type ?? "hourly", pay_rate: m.pay_rate != null ? String(m.pay_rate) : "" });
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
      pay_type: form.pay_type || null,
      pay_rate: form.pay_rate ? parseFloat(form.pay_rate) : null,
    };
    if (editingId) {
      const { data, error } = await supabase.from("crew_members").update(payload).eq("id", editingId).select().single();
      if (error) { setSaveError(error.message); setSaving(false); return; }
      setCrew((prev) => prev.map((m) => m.id === editingId ? data : m));
    } else {
      const { data, error } = await supabase.from("crew_members").insert({ ...payload, active: true, business_id: businessId }).select().single();
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

  // team-wide totals
  const teamToday = active.reduce((s, m) => s + (hoursMap[m.id]?.today ?? 0), 0);
  const teamWeek  = active.reduce((s, m) => s + (hoursMap[m.id]?.week  ?? 0), 0);
  const teamTotal = active.reduce((s, m) => s + (hoursMap[m.id]?.total ?? 0), 0);

  return (
    <div className="p-8 max-w-4xl">
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
          {/* ── Hours Summary ── */}
          <div className="bg-white rounded-xl border border-paper-deep overflow-hidden mb-5">
            <button
              onClick={() => setShowHours((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-paper-warm transition-colors"
            >
              <p className="text-[13px] font-semibold text-ink flex items-center gap-2">
                <Timer className="w-4 h-4 text-ink-quiet" /> Hours Summary
              </p>
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-ink-quiet">{fmtMs(teamWeek)} this week · {fmtMs(teamTotal)} total</span>
                {showHours ? <ChevronUp className="w-4 h-4 text-ink-quiet" /> : <ChevronDown className="w-4 h-4 text-ink-quiet" />}
              </div>
            </button>

            {showHours && (
              <div className="border-t border-paper-deep">
                {/* Column headers */}
                <div className="grid grid-cols-5 px-5 py-2 bg-paper-warm border-b border-paper-deep">
                  <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide">Employee</p>
                  <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide text-center">Today</p>
                  <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide text-center">This Week</p>
                  <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide text-center">All Time</p>
                  <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide text-center">Est. Pay (wk)</p>
                </div>

                {/* Per-member rows */}
                {active.map((m) => {
                  const h = hoursMap[m.id];
                  const estPay = m.pay_type === "hourly" && m.pay_rate != null && h?.week
                    ? (h.week / 3600000) * m.pay_rate
                    : null;
                  return (
                    <div key={m.id} className="grid grid-cols-5 px-5 py-3 border-b border-paper-deep last:border-b-0 items-center hover:bg-paper-warm/40 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-paper-dark flex items-center justify-center text-[11px] font-bold text-ink-soft flex-shrink-0">
                          {m.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-ink truncate">{m.name}</p>
                          {activePunches[m.id] && (
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-[#2e7d32]">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#4caf50] animate-pulse" />
                              Clocked in
                            </span>
                          )}
                        </div>
                      </div>
                      <p className={`text-[14px] font-semibold text-center ${h?.today ? "text-ink" : "text-ink-quiet"}`}>
                        {fmtMs(h?.today ?? 0)}
                      </p>
                      <div className="flex flex-col items-center gap-0.5">
                        <p className={`text-[14px] font-semibold ${h?.week ? "text-ink" : "text-ink-quiet"}`}>
                          {fmtMs(h?.week ?? 0)}
                        </p>
                        {h?.week ? (
                          <div className="w-20 h-1 bg-paper-dark rounded-full overflow-hidden">
                            <div
                              className="h-full bg-moss rounded-full"
                              style={{ width: `${Math.min(100, Math.round((h.week / (40 * 3600000)) * 100))}%` }}
                            />
                          </div>
                        ) : null}
                      </div>
                      <p className={`text-[14px] font-semibold text-center ${h?.total ? "text-ink" : "text-ink-quiet"}`}>
                        {fmtMs(h?.total ?? 0)}
                      </p>
                      <p className={`text-[14px] font-semibold text-center ${estPay != null ? "text-ink" : "text-ink-quiet"}`}>
                        {estPay != null ? `$${estPay.toFixed(2)}` : "—"}
                      </p>
                    </div>
                  );
                })}

                {/* Totals row */}
                {active.length > 1 && (
                  <div className="grid grid-cols-5 px-5 py-3 bg-paper-warm border-t border-paper-deep">
                    <p className="text-[12px] font-bold text-ink-quiet uppercase tracking-wide">Team Total</p>
                    <p className="text-[14px] font-bold text-ink text-center">{fmtMs(teamToday)}</p>
                    <p className="text-[14px] font-bold text-ink text-center">{fmtMs(teamWeek)}</p>
                    <p className="text-[14px] font-bold text-ink text-center">{fmtMs(teamTotal)}</p>
                    <p className="text-[14px] font-bold text-ink text-center">
                      {(() => {
                        const total = active.reduce((sum, m) => {
                          const h = hoursMap[m.id];
                          if (m.pay_type === "hourly" && m.pay_rate != null && h?.week) {
                            return sum + (h.week / 3600000) * m.pay_rate;
                          }
                          return sum;
                        }, 0);
                        return total > 0 ? `$${total.toFixed(2)}` : "—";
                      })()}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Break Policy ── */}
          <div className="bg-white rounded-xl border border-paper-deep overflow-hidden mb-5">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-paper-deep bg-paper-warm">
              <p className="text-[13px] font-semibold text-ink flex items-center gap-2">
                <Coffee className="w-4 h-4 text-ink-quiet" /> Break Policy
              </p>
              <p className="text-[12px] text-ink-quiet">Shown to crew in their portal — they cannot change it</p>
            </div>
            <div className="px-5 py-4 grid grid-cols-2 gap-6">
              {/* Lunch break */}
              <div>
                <p className="text-[12px] font-semibold text-ink-quiet uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <UtensilsCrossed className="w-3.5 h-3.5" /> Lunch Break
                </p>
                <div className="flex gap-2">
                  {[30, 60].map((mins) => (
                    <button
                      key={mins}
                      onClick={() => saveBreakSettings(mins, breakSettings.short_break_mins)}
                      disabled={savingBreaks}
                      className={`flex-1 py-2.5 rounded-lg border text-[13px] font-semibold transition-colors disabled:opacity-50 ${
                        breakSettings.lunch_break_mins === mins
                          ? "bg-ink text-white border-ink"
                          : "bg-white text-ink-soft border-paper-deep hover:bg-paper-warm"
                      }`}
                    >
                      {mins} min
                    </button>
                  ))}
                </div>
              </div>
              {/* Short break */}
              <div>
                <p className="text-[12px] font-semibold text-ink-quiet uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Coffee className="w-3.5 h-3.5" /> Short Break
                </p>
                <div className="flex gap-2">
                  {[10, 15].map((mins) => (
                    <button
                      key={mins}
                      onClick={() => saveBreakSettings(breakSettings.lunch_break_mins, mins)}
                      disabled={savingBreaks}
                      className={`flex-1 py-2.5 rounded-lg border text-[13px] font-semibold transition-colors disabled:opacity-50 ${
                        breakSettings.short_break_mins === mins
                          ? "bg-ink text-white border-ink"
                          : "bg-white text-ink-soft border-paper-deep hover:bg-paper-warm"
                      }`}
                    >
                      {mins} min
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

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
                    {m.pay_rate != null && (
                      <span className="text-[11px] text-ink-quiet flex-shrink-0">
                        {m.pay_type === "salary"
                          ? `$${m.pay_rate.toLocaleString()}/yr`
                          : `$${m.pay_rate.toFixed(2)}/hr`}
                      </span>
                    )}
                    {activePunches[m.id] && (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-[#2e7d32] bg-[#e8f5e9] border border-[#a5d6a7] px-2 py-0.5 rounded-full flex-shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#4caf50] animate-pulse" />
                        Clocked In
                      </span>
                    )}
                    {hoursMap[m.id] && (
                      <span className="flex items-center gap-1 text-[11px] text-ink-quiet flex-shrink-0" title={`This week: ${(() => { const ms = hoursMap[m.id].week; const h = Math.floor(ms/3600000); const min = Math.floor((ms%3600000)/60000); return h > 0 ? `${h}h ${min}m` : `${min}m`; })()} · All time: ${(() => { const ms = hoursMap[m.id].total; const h = Math.floor(ms/3600000); const min = Math.floor((ms%3600000)/60000); return h > 0 ? `${h}h ${min}m` : `${min}m`; })()}`}>
                        <Timer className="w-3 h-3" />
                        {(() => {
                          const ms = hoursMap[m.id].week;
                          const h = Math.floor(ms / 3600000);
                          const min = Math.floor((ms % 3600000) / 60000);
                          return (h > 0 ? `${h}h ${min}m` : `${min}m`) + " this wk";
                        })()}
                      </span>
                    )}
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
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1">Pay Type</label>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {(["hourly", "salary"] as const).map((t) => (
                    <button key={t} onClick={() => set("pay_type")(t)}
                      className={`py-2 rounded-lg text-[13px] font-medium capitalize border transition-colors ${form.pay_type === t ? "bg-ink text-white border-ink" : "bg-white text-ink-soft border-paper-deep hover:bg-paper-warm"}`}>
                      {t === "hourly" ? "Hourly" : "Salary"}
                    </button>
                  ))}
                </div>
                <Field
                  label={form.pay_type === "salary" ? "Annual Salary ($)" : "Hourly Rate ($/hr)"}
                  value={form.pay_rate}
                  onChange={set("pay_rate")}
                  placeholder={form.pay_type === "salary" ? "45000" : "18.00"}
                  type="number"
                />
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
