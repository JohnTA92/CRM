import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Shield, Users, TrendingUp, MessageSquare, RefreshCw, LogOut,
  ChevronDown, ChevronUp, Check, X, Loader2, AlertCircle,
  RotateCcw, Gift, CalendarClock, SendHorizonal, Zap, Leaf,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "businesses" | "revenue" | "support";

interface Business {
  id: string;
  name: string;
  owner_id: string;
  owner_email: string | null;
  subscription_status: string | null;
  subscription_id: string | null;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean;
  onboarding_complete: boolean;
  created_at: string;
}

interface SupportRequest {
  id: string;
  business_name: string | null;
  user_email: string | null;
  category: string;
  message: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  resolved_at: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]",
  trialing: "bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]",
  past_due: "bg-[#fffbeb] text-[#d97706] border-[#fde68a]",
  cancelled: "bg-[#fef2f2] text-[#dc2626] border-[#fecaca]",
  comped: "bg-[#f5f3ff] text-[#7c3aed] border-[#ddd6fe]",
};

function statusLabel(s: string | null) {
  if (!s) return "None";
  if (s === "active") return "Active";
  if (s === "trialing") return "Trial";
  if (s === "past_due") return "Past Due";
  if (s === "cancelled") return "Cancelled";
  return s;
}

async function callAdmin(fn: string, body: object) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await supabase.functions.invoke(fn, { body });
  return res;
}

// ─── Business row with expandable controls ───────────────────────────────────

function BusinessRow({ biz, onUpdated }: { biz: Business; onUpdated: (b: Business) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [trialDate, setTrialDate] = useState(biz.trial_ends_at?.slice(0, 10) ?? "");
  const [resetEmail, setResetEmail] = useState(biz.owner_email ?? "");

  const subStatus = biz.subscription_id === "comped" ? "comped" : (biz.subscription_status ?? "none");
  const statusClass = STATUS_COLORS[subStatus] ?? "bg-paper-warm text-ink-quiet border-paper-deep";

  async function act(action: string, extra: object = {}) {
    setLoading(action);
    setError("");
    const { data, error: err } = await callAdmin("admin-update-business", { action, business_id: biz.id, ...extra });
    setLoading(null);
    if (err || data?.error) { setError(err?.message ?? data?.error); return; }
    if (data?.business) onUpdated(data.business);
  }

  return (
    <div className="border border-paper-deep rounded-xl overflow-hidden bg-white">
      <div
        className="flex items-center gap-4 px-5 py-3.5 cursor-pointer hover:bg-paper-warm transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-ink truncate">{biz.name}</p>
          <p className="text-[12px] text-ink-quiet truncate">{biz.owner_email ?? "—"}</p>
        </div>
        <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0", statusClass)}>
          {statusLabel(subStatus === "comped" ? "comped" : biz.subscription_status)}
        </span>
        <p className="text-[11px] text-ink-quiet flex-shrink-0 hidden sm:block">
          {new Date(biz.created_at).toLocaleDateString()}
        </p>
        {expanded ? <ChevronUp className="w-4 h-4 text-ink-quiet flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-ink-quiet flex-shrink-0" />}
      </div>

      {expanded && (
        <div className="border-t border-paper-deep px-5 py-4 bg-paper-warm space-y-4">
          {error && (
            <p className="text-[12px] text-[#dc2626] flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </p>
          )}

          {/* Quick status actions */}
          <div>
            <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide mb-2">Subscription Status</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Set Active", action: "set_status", extra: { status: "active" }, color: "bg-[#16a34a] text-white" },
                { label: "Set Cancelled", action: "set_status", extra: { status: "cancelled" }, color: "bg-[#dc2626] text-white" },
                { label: "Grant Free Access", action: "grant_free", extra: {}, color: "bg-[#7c3aed] text-white" },
              ].map(({ label, action, extra, color }) => (
                <button
                  key={label}
                  onClick={() => act(action, extra)}
                  disabled={!!loading}
                  className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-50 transition-colors", color)}
                >
                  {loading === action ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Extend trial */}
          <div>
            <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide mb-2">Extend Trial</p>
            <div className="flex gap-2">
              <input
                type="date"
                value={trialDate}
                onChange={(e) => setTrialDate(e.target.value)}
                className="px-3 py-1.5 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink"
              />
              <button
                onClick={() => act("extend_trial", { trial_ends_at: new Date(trialDate).toISOString() })}
                disabled={!!loading || !trialDate}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-ink text-white hover:bg-ink/80 disabled:opacity-50 transition-colors"
              >
                {loading === "extend_trial" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
                Apply
              </button>
            </div>
          </div>

          {/* Support tools */}
          <div>
            <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide mb-2">Support Tools</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => act("sync_stripe")}
                disabled={!!loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-paper-deep bg-white hover:bg-paper-warm disabled:opacity-50 transition-colors text-ink"
              >
                {loading === "sync_stripe" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Sync Stripe
              </button>
              <button
                onClick={() => act("reset_onboarding")}
                disabled={!!loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-paper-deep bg-white hover:bg-paper-warm disabled:opacity-50 transition-colors text-ink"
              >
                {loading === "reset_onboarding" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Reset Onboarding
              </button>
            </div>
          </div>

          {/* Password reset */}
          <div>
            <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide mb-2">Send Password Reset</p>
            <div className="flex gap-2">
              <input
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="owner@email.com"
                className="flex-1 px-3 py-1.5 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink"
              />
              <button
                onClick={() => act("send_password_reset", { email: resetEmail })}
                disabled={!!loading || !resetEmail}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-ink text-white hover:bg-ink/80 disabled:opacity-50 transition-colors"
              >
                {loading === "send_password_reset" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SendHorizonal className="w-3.5 h-3.5" />}
                Send
              </button>
            </div>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-paper-deep">
            {[
              { label: "Business ID", value: biz.id.slice(0, 8) + "…" },
              { label: "Onboarding", value: biz.onboarding_complete ? "Complete" : "Incomplete" },
              { label: "Stripe Connect", value: biz.stripe_charges_enabled ? "Active" : biz.stripe_account_id ? "Pending" : "None" },
              { label: "Trial Ends", value: biz.trial_ends_at ? new Date(biz.trial_ends_at).toLocaleDateString() : "—" },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[10px] font-semibold text-ink-quiet uppercase tracking-wide">{label}</p>
                <p className="text-[12px] text-ink mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Support request row ──────────────────────────────────────────────────────

function SupportRow({ req, onUpdated }: { req: SupportRequest; onUpdated: (r: SupportRequest) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(req.admin_notes ?? "");
  const [saving, setSaving] = useState(false);

  async function update(status?: string) {
    setSaving(true);
    const { data } = await supabase.functions.invoke("admin-update-support", {
      body: { request_id: req.id, status: status ?? req.status, admin_notes: notes },
    });
    setSaving(false);
    if (data?.ok) onUpdated({ ...req, status: status ?? req.status, admin_notes: notes });
  }

  const isOpen = req.status === "open";
  const catColors: Record<string, string> = {
    billing: "bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]",
    bug: "bg-[#fef2f2] text-[#dc2626] border-[#fecaca]",
    question: "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]",
    other: "bg-paper-warm text-ink-quiet border-paper-deep",
  };

  return (
    <div className={cn("border rounded-xl overflow-hidden", isOpen ? "border-paper-deep bg-white" : "border-paper-deep bg-paper-warm opacity-70")}>
      <div className="flex items-start gap-3 px-5 py-3.5 cursor-pointer hover:bg-paper-warm transition-colors" onClick={() => setExpanded((v) => !v)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border", catColors[req.category] ?? catColors.other)}>
              {req.category}
            </span>
            {!isOpen && <span className="text-[10px] font-semibold text-ink-quiet">Resolved</span>}
          </div>
          <p className="text-[13px] text-ink line-clamp-1">{req.message}</p>
          <p className="text-[11px] text-ink-quiet mt-0.5">
            {req.business_name ?? "Unknown"} · {req.user_email ?? "—"} · {new Date(req.created_at).toLocaleDateString()}
          </p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-ink-quiet flex-shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-ink-quiet flex-shrink-0 mt-1" />}
      </div>

      {expanded && (
        <div className="border-t border-paper-deep px-5 py-4 space-y-3">
          <div className="bg-paper-warm rounded-lg px-4 py-3">
            <p className="text-[13px] text-ink whitespace-pre-wrap">{req.message}</p>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-ink-quiet uppercase tracking-wide mb-1.5">Internal Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Add notes…"
              className="w-full px-3 py-2 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => update()}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-paper-deep bg-white hover:bg-paper-warm disabled:opacity-50 transition-colors text-ink"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Save Notes
            </button>
            {isOpen ? (
              <button
                onClick={() => update("resolved")}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[#16a34a] text-white hover:bg-[#15803d] disabled:opacity-50 transition-colors"
              >
                <Check className="w-3.5 h-3.5" /> Mark Resolved
              </button>
            ) : (
              <button
                onClick={() => update("open")}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-paper-deep bg-white hover:bg-paper-warm disabled:opacity-50 transition-colors text-ink"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reopen
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main admin page ──────────────────────────────────────────────────────────

const DEV_MODE = import.meta.env.VITE_DEV_MODE === "true";

export function AdminPage() {
  const [tab, setTab] = useState<Tab>("businesses");
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [bizRes, supRes] = await Promise.all([
      supabase.functions.invoke("admin-get-businesses"),
      supabase.functions.invoke("admin-get-support"),
    ]);
    setLoading(false);
    if (bizRes.error || bizRes.data?.error) {
      setError(bizRes.data?.error ?? bizRes.error?.message ?? "Failed to load");
      return;
    }
    setBusinesses(bizRes.data?.businesses ?? []);
    setSupportRequests(supRes.data?.requests ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Revenue metrics
  const active = businesses.filter((b) => b.subscription_status === "active" && b.subscription_id !== "comped");
  const trialing = businesses.filter((b) => b.subscription_status === "trialing");
  const pastDue = businesses.filter((b) => b.subscription_status === "past_due");
  const comped = businesses.filter((b) => b.subscription_id === "comped");
  const mrr = active.length * 49;
  const openRequests = supportRequests.filter((r) => r.status === "open");

  const filteredBiz = businesses.filter((b) =>
    !filter || b.name.toLowerCase().includes(filter.toLowerCase()) || (b.owner_email ?? "").toLowerCase().includes(filter.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-paper-warm flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-ink-quiet" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-paper-warm flex items-center justify-center px-4">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-[#dc2626] mx-auto mb-3" />
          <p className="text-[15px] font-semibold text-ink">Access Denied</p>
          <p className="text-[13px] text-ink-quiet mt-1">{error}</p>
          {DEV_MODE && (
            <p className="text-[12px] text-[#d97706] mt-3 bg-[#fffbeb] border border-[#fde68a] rounded-lg px-3 py-2">
              Dev mode: run the SQL below to grant yourself admin access, then refresh.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper-warm">
      {/* Top bar */}
      <header className="bg-white border-b border-paper-deep px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-ink flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="text-[15px] font-bold text-ink">FieldCRM Admin</span>
          {DEV_MODE && (
            <span className="text-[10px] font-semibold text-[#d97706] bg-[#fffbeb] border border-[#fde68a] px-2 py-0.5 rounded-full">DEV</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} className="p-1.5 rounded-lg text-ink-quiet hover:text-ink hover:bg-paper-warm transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <a href="/" className="flex items-center gap-1.5 text-[12px] text-ink-quiet hover:text-ink transition-colors">
            <Leaf className="w-3.5 h-3.5" /> Back to App
          </a>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: "MRR", value: `$${mrr.toLocaleString()}`, sub: `${active.length} active`, color: "text-[#16a34a]" },
            { label: "Trialing", value: String(trialing.length), sub: "free trials", color: "text-[#1d4ed8]" },
            { label: "Past Due", value: String(pastDue.length), sub: "need follow-up", color: pastDue.length > 0 ? "text-[#dc2626]" : "text-ink-quiet" },
            { label: "Open Tickets", value: String(openRequests.length), sub: "support requests", color: openRequests.length > 0 ? "text-[#d97706]" : "text-ink-quiet" },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="bg-white rounded-xl border border-paper-deep px-5 py-4">
              <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide">{label}</p>
              <p className={cn("text-[24px] font-bold mt-1", color)}>{value}</p>
              <p className="text-[11px] text-ink-quiet mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-paper-deep rounded-xl p-1 mb-6 w-fit">
          {([
            { key: "businesses", icon: Users, label: "Businesses" },
            { key: "revenue", icon: TrendingUp, label: "Revenue" },
            { key: "support", icon: MessageSquare, label: `Support${openRequests.length > 0 ? ` (${openRequests.length})` : ""}` },
          ] as const).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-colors",
                tab === key ? "bg-ink text-white" : "text-ink-quiet hover:text-ink hover:bg-paper-warm"
              )}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {/* Businesses tab */}
        {tab === "businesses" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[13px] text-ink-quiet">{businesses.length} businesses</p>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search by name or email…"
                className="px-3 py-1.5 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink w-56"
              />
            </div>
            {filteredBiz.length === 0 && (
              <p className="text-[13px] text-ink-quiet text-center py-8">No businesses found.</p>
            )}
            {filteredBiz.map((b) => (
              <BusinessRow
                key={b.id}
                biz={b}
                onUpdated={(updated) => setBusinesses((prev) => prev.map((x) => x.id === updated.id ? { ...x, ...updated } : x))}
              />
            ))}
          </div>
        )}

        {/* Revenue tab */}
        {tab === "revenue" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
              <div className="px-5 py-3.5 border-b border-paper-deep bg-paper-warm">
                <p className="text-[13px] font-semibold text-ink">All Businesses by Status</p>
              </div>
              <div className="divide-y divide-paper-deep">
                {businesses.length === 0 && (
                  <p className="text-[13px] text-ink-quiet text-center py-8">No businesses yet.</p>
                )}
                {businesses.map((b) => {
                  const sub = b.subscription_id === "comped" ? "comped" : (b.subscription_status ?? "none");
                  const sc = STATUS_COLORS[sub] ?? "bg-paper-warm text-ink-quiet border-paper-deep";
                  return (
                    <div key={b.id} className="flex items-center gap-4 px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-ink truncate">{b.name}</p>
                        <p className="text-[11px] text-ink-quiet truncate">{b.owner_email}</p>
                      </div>
                      <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0", sc)}>
                        {statusLabel(sub === "comped" ? "comped" : b.subscription_status)}
                      </span>
                      <p className="text-[12px] font-semibold text-ink w-12 text-right flex-shrink-0">
                        {b.subscription_status === "active" && b.subscription_id !== "comped" ? "$49" : "—"}
                      </p>
                    </div>
                  );
                })}
              </div>
              {active.length > 0 && (
                <div className="px-5 py-3 border-t border-paper-deep bg-paper-warm flex items-center justify-between">
                  <p className="text-[12px] font-semibold text-ink-quiet">Monthly Recurring Revenue</p>
                  <p className="text-[15px] font-bold text-[#16a34a]">${mrr.toLocaleString()}</p>
                </div>
              )}
            </div>

            {pastDue.length > 0 && (
              <div className="bg-[#fef2f2] border border-[#fecaca] rounded-xl p-5">
                <p className="text-[13px] font-semibold text-[#dc2626] mb-3 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" /> {pastDue.length} Past Due — needs follow-up
                </p>
                <div className="space-y-2">
                  {pastDue.map((b) => (
                    <div key={b.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-2.5 border border-[#fecaca]">
                      <div>
                        <p className="text-[13px] font-medium text-ink">{b.name}</p>
                        <p className="text-[11px] text-ink-quiet">{b.owner_email}</p>
                      </div>
                      <span className="text-[11px] font-semibold text-[#dc2626]">Past Due</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Support tab */}
        {tab === "support" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[13px] text-ink-quiet">{openRequests.length} open · {supportRequests.length - openRequests.length} resolved</p>
            </div>
            {supportRequests.length === 0 && (
              <p className="text-[13px] text-ink-quiet text-center py-8">No support requests yet.</p>
            )}
            {supportRequests.map((r) => (
              <SupportRow
                key={r.id}
                req={r}
                onUpdated={(updated) => setSupportRequests((prev) => prev.map((x) => x.id === updated.id ? updated : x))}
              />
            ))}
          </div>
        )}

        {/* Dev mode instructions */}
        {DEV_MODE && (
          <div className="mt-8 border border-dashed border-[#f59e0b] rounded-xl p-5 bg-[#fffbeb]">
            <p className="text-[12px] font-semibold text-[#92400e] mb-2">To grant yourself admin access, run this in Supabase SQL Editor:</p>
            <code className="block text-[11px] font-mono bg-white border border-[#fde68a] rounded-lg px-4 py-3 text-[#92400e] whitespace-pre">{`UPDATE auth.users\nSET app_metadata = app_metadata || '{"is_admin": true}'::jsonb\nWHERE email = 'your@email.com';`}</code>
          </div>
        )}
      </div>
    </div>
  );
}
