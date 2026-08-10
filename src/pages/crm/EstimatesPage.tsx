import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Badge } from "@/design-system/primitives/Badge";
import { Button } from "@/design-system/primitives/Button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { estimateStatusLabel, type EstimateStatus, type Estimate, type LineItem } from "@/data/crm";
import { useServices } from "@/lib/services";
import { Plus, FileText, X, Trash2, ChevronDown, Loader2, Send, Clock, Star, Sparkles } from "lucide-react";

const STATUS_FILTERS: { label: string; value: EstimateStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Approved", value: "approved" },
  { label: "Declined", value: "declined" },
];

function estStatusBadge(s: string): "warning" | "success" | "error" | "muted" | "default" {
  const m: Record<string, "warning" | "success" | "error" | "muted" | "default"> = {
    draft: "muted", sent: "warning", approved: "success", declined: "error", expired: "muted",
  };
  return m[s] ?? "default";
}

interface Customer { id: string; name: string; email: string; }

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

const TIERS = [
  {
    value: "good" as const,
    label: "Good",
    description: "Essential service, basic materials",
    badge: "bg-paper-warm border-paper-deep text-ink-soft",
    icon: null,
  },
  {
    value: "better" as const,
    label: "Better",
    description: "Upgraded materials, priority scheduling",
    badge: "bg-[#e3f2fd] border-[#90caf9] text-[#1565c0]",
    icon: Star,
  },
  {
    value: "best" as const,
    label: "Best",
    description: "Premium finish, warranty included",
    badge: "bg-[#fff8e1] border-[#ffe082] text-[#f57f17]",
    icon: Sparkles,
  },
];

const FOLLOW_UP_OPTIONS = [
  { value: 1, label: "1 day" },
  { value: 2, label: "2 days" },
  { value: 3, label: "3 days" },
  { value: 5, label: "5 days" },
  { value: 7, label: "7 days" },
];

export function EstimatesPage() {
  const { services } = useServices();
  const location = useLocation();
  const { business } = useAuth();
  const businessId = business?.id ?? "";
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<EstimateStatus | "all">("all");
  const [showModal, setShowModal] = useState(false);

  // form state
  const [customerId, setCustomerId] = useState("");
  const [serviceType, setServiceType] = useState("lawn");
  const [tier, setTier] = useState<"none" | "good" | "better" | "best">("none");
  const [notes, setNotes] = useState("");
  const [followUpDays, setFollowUpDays] = useState(3);
  const [lineItems, setLineItems] = useState<{ description: string; quantity: string; unitPrice: string; type: "labor" | "material" | "service" }[]>([
    { description: "", quantity: "1", unitPrice: "", type: "service" },
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const prefill = (location.state as any)?.prefillCustomerId;
    if (prefill) { setCustomerId(prefill); setShowModal(true); window.history.replaceState({}, ""); }
  }, [location.state]);

  async function loadData() {
    setLoading(true);
    const [estRes, custRes] = await Promise.all([
      supabase.from("estimates").select("*").eq("business_id", businessId).order("created_at", { ascending: false }),
      supabase.from("customers").select("id, name, email").eq("business_id", businessId).eq("archived", false).order("name"),
    ]);
    if (estRes.data) setEstimates(estRes.data.map(rowToEstimate));
    if (custRes.data) setCustomers(custRes.data);
    setLoading(false);
  }

  function rowToEstimate(row: any): Estimate {
    return {
      id: row.id,
      jobId: row.job_id ?? "",
      customerId: row.customer_id,
      status: row.status,
      lineItems: row.line_items ?? [],
      notes: row.notes ?? "",
      createdAt: row.created_at?.split("T")[0] ?? "",
      sentAt: row.sent_at,
      expiresAt: row.expires_at,
      total: row.total ?? 0,
      followUpDays: row.follow_up_days ?? 3,
      followUpSentAt: row.follow_up_sent_at ?? null,
    };
  }

  const lineTotal = lineItems.reduce((sum, li) => {
    const qty = parseFloat(li.quantity) || 0;
    const price = parseFloat(li.unitPrice) || 0;
    return sum + qty * price;
  }, 0);

  const addLineItem = () =>
    setLineItems((prev) => [...prev, { description: "", quantity: "1", unitPrice: "", type: "service" }]);

  const removeLineItem = (i: number) =>
    setLineItems((prev) => prev.filter((_, idx) => idx !== i));

  const updateLineItem = (i: number, field: string, value: string) =>
    setLineItems((prev) => prev.map((li, idx) => idx === i ? { ...li, [field]: value } : li));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!customerId) e.customerId = "Required";
    lineItems.forEach((li, i) => {
      if (!li.description.trim()) e[`li_desc_${i}`] = "Required";
      if (!li.unitPrice || parseFloat(li.unitPrice) <= 0) e[`li_price_${i}`] = "Required";
    });
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    setSaveError(null);

    const items: LineItem[] = lineItems.map((li, i) => ({
      id: `li-${Date.now()}-${i}`,
      description: li.description.trim(),
      quantity: parseFloat(li.quantity) || 1,
      unitPrice: parseFloat(li.unitPrice) || 0,
      type: li.type,
    }));

    const { data, error } = await supabase
      .from("estimates")
      .insert({
        business_id: businessId,
        customer_id: customerId,
        service_type: serviceType,
        tier: tier === "none" ? null : tier,
        status: "draft",
        line_items: items,
        notes: notes.trim() || null,
        total: lineTotal,
        follow_up_days: followUpDays,
        follow_up_sent_at: null,
        sent_at: null,
        expires_at: null,
      })
      .select()
      .single();

    setSaving(false);
    if (error) { setSaveError(error.message); return; }
    if (data) setEstimates((prev) => [rowToEstimate(data), ...prev]);

    setShowModal(false);
    resetForm();
  };

  const resetForm = () => {
    setCustomerId(""); setServiceType("lawn"); setTier("none"); setNotes("");
    setFollowUpDays(3); setErrors({});
    setLineItems([{ description: "", quantity: "1", unitPrice: "", type: "service" }]);
  };

  const filtered = estimates.filter((e) => statusFilter === "all" || e.status === statusFilter);
  const totalSent = estimates.filter((e) => e.status === "sent").reduce((s, e) => s + e.total, 0);
  const totalApproved = estimates.filter((e) => e.status === "approved").reduce((s, e) => s + e.total, 0);

  const getCustomerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "Unknown";

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-[22px] font-semibold text-ink">Estimates</h1>
          <p className="text-[14px] text-ink-quiet mt-1">
            {loading ? "Loading…" : `$${totalSent.toLocaleString()} pending · $${totalApproved.toLocaleString()} approved`}
          </p>
        </div>
        <Button size="sm" className="w-auto gap-1.5" onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4" /> New Estimate
        </Button>
      </div>

      <div className="flex gap-1.5 mb-5 flex-wrap">
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

      <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
        {loading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-ink-quiet">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-[14px]">Loading estimates…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="w-8 h-8 text-ink-quiet mx-auto mb-3" />
            <p className="text-[14px] text-ink-quiet">No estimates yet. Create your first one.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-2.5 border-b border-paper-deep bg-paper-warm">
              <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide">Customer / Job</p>
              <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide text-right">Follow-up</p>
              <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide text-right">Total</p>
              <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide text-right">Sent</p>
              <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide text-right">Status</p>
            </div>
            <div className="divide-y divide-paper-deep">
              {filtered.map((est) => (
                <Link
                  key={est.id}
                  to={`/estimates/${est.id}`}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center px-5 py-4 hover:bg-paper-warm transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-semibold text-ink truncate">{getCustomerName(est.customerId)}</p>
                      {(est as any).tier && (() => {
                        const tierDef = TIERS.find((t) => t.value === (est as any).tier);
                        return tierDef ? (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${tierDef.badge}`}>{tierDef.label}</span>
                        ) : null;
                      })()}
                    </div>
                    <p className="text-[12px] text-ink-quiet">
                      {est.lineItems.length} item{est.lineItems.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-[12px] text-ink-quiet">
                    <Clock className="w-3 h-3" />
                    {est.status === "sent" && !est.followUpSentAt && (
                      <span className="text-[11px] text-amber-600 font-medium">{est.followUpDays}d follow-up</span>
                    )}
                    {est.followUpSentAt && (
                      <span className="flex items-center gap-1 text-[11px] text-moss">
                        <Send className="w-3 h-3" /> Sent
                      </span>
                    )}
                    {est.status !== "sent" && !est.followUpSentAt && <span className="text-ink-quiet">—</span>}
                  </div>
                  <p className="text-[14px] font-semibold text-ink text-right">${est.total.toLocaleString()}</p>
                  <p className="text-[12px] text-ink-quiet text-right">{est.sentAt ? est.sentAt.split("T")[0] : "—"}</p>
                  <Badge variant={estStatusBadge(est.status)}>{estimateStatusLabel(est.status)}</Badge>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      {/* New Estimate Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setShowModal(false); resetForm(); }} />
          <div className="relative bg-white rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-paper-deep">
              <h2 className="text-[16px] font-semibold text-ink">New Estimate</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="p-1.5 rounded-lg hover:bg-paper-warm text-ink-quiet">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
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

              {/* Good / Better / Best Tier */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[12px] font-semibold text-ink-quiet">Proposal Tier</label>
                  {tier !== "none" && (
                    <button onClick={() => setTier("none")} className="text-[11px] text-ink-quiet hover:text-ink">Clear</button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {TIERS.map((t) => {
                    const Icon = t.icon;
                    const active = tier === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setTier(active ? "none" : t.value)}
                        className={`relative flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 text-left transition-all ${
                          active ? `border-current ${t.badge}` : "border-paper-deep bg-white hover:border-ink/30"
                        }`}
                      >
                        {Icon && <Icon className="w-4 h-4" />}
                        <p className={`text-[13px] font-bold ${active ? "" : "text-ink"}`}>{t.label}</p>
                        <p className={`text-[10px] text-center leading-tight ${active ? "opacity-80" : "text-ink-quiet"}`}>{t.description}</p>
                      </button>
                    );
                  })}
                </div>
                {tier !== "none" && (
                  <p className="text-[11px] text-ink-quiet mt-2 px-1">
                    Tier is saved with the estimate and shown on the customer-facing PDF.
                  </p>
                )}
              </div>

              {/* Line items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[12px] font-semibold text-ink-quiet">Line Items</label>
                  <button onClick={addLineItem} className="text-[12px] text-accent font-medium hover:underline">+ Add item</button>
                </div>
                <div className="space-y-2">
                  {lineItems.map((li, i) => (
                    <div key={i} className="grid grid-cols-[1fr_60px_80px_auto] gap-2 items-start">
                      <div>
                        <input
                          value={li.description}
                          onChange={(e) => updateLineItem(i, "description", e.target.value)}
                          placeholder="Description"
                          className={`w-full px-3 py-2 text-[13px] border rounded-lg bg-white focus:outline-none focus:border-ink transition-colors ${
                            errors[`li_desc_${i}`] ? "border-accent" : "border-paper-deep"
                          }`}
                        />
                      </div>
                      <input
                        value={li.quantity}
                        onChange={(e) => updateLineItem(i, "quantity", e.target.value)}
                        placeholder="Qty"
                        type="number"
                        min="1"
                        className="w-full px-2 py-2 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors text-center"
                      />
                      <div>
                        <input
                          value={li.unitPrice}
                          onChange={(e) => updateLineItem(i, "unitPrice", e.target.value)}
                          placeholder="$0.00"
                          type="number"
                          min="0"
                          step="0.01"
                          className={`w-full px-2 py-2 text-[13px] border rounded-lg bg-white focus:outline-none focus:border-ink transition-colors ${
                            errors[`li_price_${i}`] ? "border-accent" : "border-paper-deep"
                          }`}
                        />
                      </div>
                      <button
                        onClick={() => removeLineItem(i)}
                        disabled={lineItems.length === 1}
                        className="p-2 text-ink-quiet hover:text-accent disabled:opacity-30 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end mt-3 pt-3 border-t border-paper-deep">
                  <p className="text-[14px] font-semibold text-ink">Total: ${lineTotal.toFixed(2)}</p>
                </div>
              </div>

              {/* Auto follow-up */}
              <div className="bg-paper-warm rounded-xl p-4 border border-paper-deep">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-accent" />
                  <p className="text-[13px] font-semibold text-ink">Auto Quote Follow-up</p>
                </div>
                <p className="text-[12px] text-ink-quiet mb-3">
                  Save a reminder preference — follow up manually after this many days if not approved:
                </p>
                <div className="flex gap-2 flex-wrap">
                  {FOLLOW_UP_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setFollowUpDays(opt.value)}
                      className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                        followUpDays === opt.value
                          ? "bg-accent text-white"
                          : "bg-white border border-paper-deep text-ink-soft hover:border-ink"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any special instructions or details…"
                  rows={3}
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
                Save Estimate
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
