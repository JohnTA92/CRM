import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth, useIsSuperAdmin } from "@/lib/auth";
import { callAdminFunction, type AdminErrorKind } from "@/lib/adminApi";
import {
  Shield, Users, TrendingUp, MessageSquare, RefreshCw,
  ChevronDown, ChevronUp, Check, Loader2, AlertCircle,
  RotateCcw, CalendarClock, SendHorizonal, Leaf, UserPlus, Trash2, Crown,
  ClipboardList, Megaphone, X, Info, AlertTriangle, CheckCircle, LogIn, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "businesses" | "revenue" | "support" | "team" | "audit" | "announcements";

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

interface AuditLog {
  id: string;
  admin_email: string;
  action: string;
  target_business_name: string | null;
  details: string | null;
  created_at: string;
}

interface Announcement {
  id: string;
  message: string;
  type: "info" | "warning" | "success";
  active: boolean;
  created_by_email: string;
  created_at: string;
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

async function logAction(action: string, bizId?: string, bizName?: string, details?: string) {
  await supabase.functions.invoke("admin-log-action", {
    body: { action, target_business_id: bizId, target_business_name: bizName, details },
  });
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

  async function act(action: string, extra: object = {}, logDetails?: string) {
    setLoading(action);
    setError("");
    const { data, error: err } = await supabase.functions.invoke("admin-update-business", { body: { action, business_id: biz.id, ...extra } });
    setLoading(null);
    if (err || data?.error) { setError(err?.message ?? data?.error); return; }
    await logAction(action, biz.id, biz.name, logDetails);
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
                { label: "Set Active", action: "set_status", extra: { status: "active" }, color: "bg-[#16a34a] text-white", log: "set status → active" },
                { label: "Set Cancelled", action: "set_status", extra: { status: "cancelled" }, color: "bg-[#dc2626] text-white", log: "set status → cancelled" },
                { label: "Grant Free Access", action: "grant_free", extra: {}, color: "bg-[#7c3aed] text-white", log: "granted free access" },
              ].map(({ label, action, extra, color, log }) => (
                <button
                  key={label}
                  onClick={() => act(action, extra, log)}
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
                onClick={() => act("extend_trial", { trial_ends_at: new Date(trialDate).toISOString() }, `extended trial to ${trialDate}`)}
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
                onClick={() => act("sync_stripe", {}, "synced Stripe status")}
                disabled={!!loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-paper-deep bg-white hover:bg-paper-warm disabled:opacity-50 transition-colors text-ink"
              >
                {loading === "sync_stripe" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Sync Stripe
              </button>
              <button
                onClick={() => act("reset_onboarding", {}, "reset onboarding")}
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
                onClick={() => act("send_password_reset", { email: resetEmail }, `sent password reset to ${resetEmail}`)}
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
    if (data?.ok) {
      const newStatus = status ?? req.status;
      await logAction(`support_${newStatus}`, undefined, req.business_name ?? undefined, `ticket: ${req.message.slice(0, 60)}`);
      onUpdated({ ...req, status: newStatus, admin_notes: notes });
    }
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

interface AdminUser {
  id: string;
  email: string;
  is_super_admin: boolean;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  set_status: "Set Status",
  extend_trial: "Extend Trial",
  grant_free: "Grant Free Access",
  sync_stripe: "Sync Stripe",
  reset_onboarding: "Reset Onboarding",
  send_password_reset: "Password Reset Sent",
  support_resolved: "Support Resolved",
  support_open: "Support Reopened",
  grant_admin: "Granted Admin",
  revoke_admin: "Revoked Admin",
  announcement_created: "Announcement Created",
  announcement_dismissed: "Announcement Dismissed",
};

export function AdminPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading, signOut } = useAuth();
  const isSuperAdmin = useIsSuperAdmin();
  const [tab, setTab] = useState<Tab>("businesses");
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<AdminErrorKind | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [filter, setFilter] = useState("");

  // Team tab state
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState("");
  const [teamSuccess, setTeamSuccess] = useState("");

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Announcements state
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [annLoading, setAnnLoading] = useState(false);
  const [annMessage, setAnnMessage] = useState("");
  const [annType, setAnnType] = useState<"info" | "warning" | "success">("info");
  const [annError, setAnnError] = useState("");

  const load = useCallback(async () => {
    // No client-side session at all — don't even call the edge functions, since we
    // already know they'll reject with 401. Distinct from "called them and got 401/403".
    if (!user) {
      setLoading(false);
      setErrorKind("unauthenticated");
      setErrorMessage("You're not signed in.");
      return;
    }

    setLoading(true);
    setErrorKind(null);
    setErrorMessage("");

    const [bizRes, supRes] = await Promise.all([
      callAdminFunction<{ businesses: Business[] }>("admin-get-businesses"),
      callAdminFunction<{ requests: SupportRequest[] }>("admin-get-support"),
    ]);
    setLoading(false);

    if (bizRes.errorKind) {
      setErrorKind(bizRes.errorKind);
      setErrorMessage(bizRes.errorMessage ?? "Failed to load.");
      return;
    }

    setBusinesses(bizRes.data?.businesses ?? []);
    // Support requests are secondary to the businesses gate above; surface a backend
    // error for it too rather than silently showing an empty tab.
    if (supRes.errorKind) {
      setErrorKind(supRes.errorKind);
      setErrorMessage(supRes.errorMessage ?? "Failed to load support requests.");
      return;
    }
    setSupportRequests(supRes.data?.requests ?? []);
  }, [user]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  const loadTeam = useCallback(async () => {
    if (!isSuperAdmin) return;
    const { data } = await supabase.functions.invoke("admin-manage-team", { body: { action: "list" } });
    setAdmins(data?.admins ?? []);
  }, [isSuperAdmin]);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    const { data } = await supabase.functions.invoke("admin-get-audit-log");
    setAuditLoading(false);
    setAuditLogs(data?.logs ?? []);
  }, []);

  const loadAnnouncements = useCallback(async () => {
    setAnnLoading(true);
    const { data } = await supabase.functions.invoke("admin-announcements", { body: { action: "list" } });
    setAnnLoading(false);
    setAnnouncements(data?.announcements ?? []);
  }, []);

  useEffect(() => { if (tab === "team") loadTeam(); }, [tab, loadTeam]);
  useEffect(() => { if (tab === "audit") loadAudit(); }, [tab, loadAudit]);
  useEffect(() => { if (tab === "announcements") loadAnnouncements(); }, [tab, loadAnnouncements]);

  async function grantAdmin() {
    if (!newAdminEmail.trim()) return;
    setTeamLoading(true);
    setTeamError("");
    setTeamSuccess("");
    const { data, error: err } = await supabase.functions.invoke("admin-manage-team", {
      body: { action: "grant", email: newAdminEmail.trim() },
    });
    setTeamLoading(false);
    if (err || data?.error) { setTeamError(data?.error ?? err?.message); return; }
    await logAction("grant_admin", undefined, undefined, `granted admin to ${newAdminEmail.trim()}`);
    setTeamSuccess(data.message);
    setNewAdminEmail("");
    loadTeam();
  }

  async function revokeAdmin(userId: string, email: string) {
    setTeamLoading(true);
    setTeamError("");
    setTeamSuccess("");
    const { data, error: err } = await supabase.functions.invoke("admin-manage-team", {
      body: { action: "revoke", user_id: userId },
    });
    setTeamLoading(false);
    if (err || data?.error) { setTeamError(data?.error ?? err?.message); return; }
    await logAction("revoke_admin", undefined, undefined, `revoked admin from ${email}`);
    loadTeam();
  }

  async function createAnnouncement() {
    if (!annMessage.trim()) return;
    setAnnError("");
    setAnnLoading(true);
    const { data, error: err } = await supabase.functions.invoke("admin-announcements", {
      body: { action: "create", message: annMessage, type: annType },
    });
    setAnnLoading(false);
    if (err || data?.error) { setAnnError(data?.error ?? err?.message); return; }
    await logAction("announcement_created", undefined, undefined, annMessage.slice(0, 80));
    setAnnMessage("");
    loadAnnouncements();
  }

  async function dismissAnnouncement(id: string) {
    await supabase.functions.invoke("admin-announcements", { body: { action: "dismiss", id } });
    await logAction("announcement_dismissed");
    setAnnouncements((prev) => prev.map((a) => a.id === id ? { ...a, active: false } : a));
  }

  // Revenue metrics
  const active = businesses.filter((b) => b.subscription_status === "active" && b.subscription_id !== "comped");
  const trialing = businesses.filter((b) => b.subscription_status === "trialing");
  const pastDue = businesses.filter((b) => b.subscription_status === "past_due");
  const mrr = active.length * 49;
  const openRequests = supportRequests.filter((r) => r.status === "open");
  const activeAnnouncement = announcements.find((a) => a.active);

  const filteredBiz = businesses.filter((b) =>
    !filter || b.name.toLowerCase().includes(filter.toLowerCase()) || (b.owner_email ?? "").toLowerCase().includes(filter.toLowerCase())
  );

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-paper-warm flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-ink-quiet" />
      </div>
    );
  }

  // No session at all — offer real sign-in and return here afterward. In normal
  // navigation this is caught upstream by RequireAuth (App.tsx), which never honors
  // the dev-mode bypass for /admin; this is a defensive fallback (e.g. the session
  // disappeared — sign-out, expiry — while this page was already open).
  if (errorKind === "unauthenticated") {
    return (
      <div className="min-h-screen bg-paper-warm flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <LogIn className="w-8 h-8 text-ink-quiet mx-auto mb-3" />
          <p className="text-[15px] font-semibold text-ink">Sign in required</p>
          <p className="text-[13px] text-ink-quiet mt-1">
            {errorMessage || "You need to sign in with an admin account to view this page."}
          </p>
          <button
            onClick={() => navigate("/login", { state: { from: "/admin" } })}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold bg-ink text-white hover:bg-ink/80 transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" /> Go to Sign In
          </button>
        </div>
      </div>
    );
  }

  // Authenticated, but the account isn't an admin.
  if (errorKind === "forbidden") {
    return (
      <div className="min-h-screen bg-paper-warm flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-8 h-8 text-[#dc2626] mx-auto mb-3" />
          <p className="text-[15px] font-semibold text-ink">Access Denied</p>
          <p className="text-[13px] text-ink-quiet mt-1">{errorMessage}</p>
          {user?.email && (
            <p className="text-[12px] text-ink-quiet mt-2">Signed in as {user.email}</p>
          )}
          <button
            onClick={async () => { await signOut(); navigate("/login", { state: { from: "/admin" } }); }}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-paper-deep bg-white text-ink-soft hover:bg-paper-warm transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign in with a different account
          </button>
          {DEV_MODE && (
            <p className="text-[12px] text-[#d97706] mt-4 bg-[#fffbeb] border border-[#fde68a] rounded-lg px-3 py-2 text-left">
              Dev mode: an existing admin must grant this account access (Team tab), or run the SQL below against this exact account, then sign out and back in so the new session picks it up.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Everything else — network failure, 5xx, Supabase project paused/resumed, etc.
  // Kept distinct from "Access Denied" so a backend hiccup isn't mistaken for missing
  // privileges.
  if (errorKind === "backend") {
    return (
      <div className="min-h-screen bg-paper-warm flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-8 h-8 text-[#d97706] mx-auto mb-3" />
          <p className="text-[15px] font-semibold text-ink">Something went wrong</p>
          <p className="text-[13px] text-ink-quiet mt-1">{errorMessage}</p>
          <p className="text-[12px] text-ink-quiet mt-2">
            If the Supabase project was recently paused and resumed, this can take a minute to clear up.
          </p>
          <button
            onClick={load}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold bg-ink text-white hover:bg-ink/80 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const tabs = [
    { key: "businesses" as Tab, icon: Users, label: "Businesses" },
    { key: "revenue" as Tab, icon: TrendingUp, label: "Revenue" },
    { key: "support" as Tab, icon: MessageSquare, label: `Support${openRequests.length > 0 ? ` (${openRequests.length})` : ""}` },
    { key: "announcements" as Tab, icon: Megaphone, label: `Announcements${activeAnnouncement ? " ●" : ""}` },
    { key: "audit" as Tab, icon: ClipboardList, label: "Audit Log" },
    ...(isSuperAdmin ? [{ key: "team" as Tab, icon: Users, label: "Team" }] : []),
  ];

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
        <div className="flex flex-wrap gap-1 bg-white border border-paper-deep rounded-xl p-1 mb-6 w-fit">
          {tabs.map(({ key, icon: Icon, label }) => (
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

        {/* Announcements tab */}
        {tab === "announcements" && (
          <div className="space-y-4">
            {/* Compose */}
            <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
              <div className="px-5 py-3.5 border-b border-paper-deep bg-paper-warm">
                <p className="text-[13px] font-semibold text-ink">New Announcement</p>
                <p className="text-[12px] text-ink-quiet mt-0.5">Shown as a dismissible banner to all logged-in users. Only one can be active at a time.</p>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="flex gap-2">
                  {(["info", "warning", "success"] as const).map((t) => {
                    const icons = { info: Info, warning: AlertTriangle, success: CheckCircle };
                    const colors = {
                      info: annType === "info" ? "bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]" : "border-paper-deep text-ink-quiet hover:bg-paper-warm",
                      warning: annType === "warning" ? "bg-[#fffbeb] text-[#d97706] border-[#fde68a]" : "border-paper-deep text-ink-quiet hover:bg-paper-warm",
                      success: annType === "success" ? "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]" : "border-paper-deep text-ink-quiet hover:bg-paper-warm",
                    };
                    const Icon = icons[t];
                    return (
                      <button
                        key={t}
                        onClick={() => setAnnType(t)}
                        className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border capitalize transition-colors", colors[t])}
                      >
                        <Icon className="w-3.5 h-3.5" /> {t}
                      </button>
                    );
                  })}
                </div>
                <textarea
                  value={annMessage}
                  onChange={(e) => setAnnMessage(e.target.value)}
                  rows={2}
                  placeholder="e.g. Scheduled maintenance tonight at 2am ET. The app will be unavailable for ~15 minutes."
                  className="w-full px-3 py-2 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink resize-none"
                />
                {annError && (
                  <p className="text-[12px] text-[#dc2626] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" /> {annError}
                  </p>
                )}
                <button
                  onClick={createAnnouncement}
                  disabled={annLoading || !annMessage.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold bg-ink text-white hover:bg-ink/80 disabled:opacity-50 transition-colors"
                >
                  {annLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
                  Publish Announcement
                </button>
              </div>
            </div>

            {/* Active banner preview */}
            {activeAnnouncement && (
              <div className={cn(
                "rounded-xl border px-5 py-4 flex items-start gap-3",
                activeAnnouncement.type === "warning" ? "bg-[#fffbeb] border-[#fde68a]" :
                activeAnnouncement.type === "success" ? "bg-[#f0fdf4] border-[#bbf7d0]" :
                "bg-[#eff6ff] border-[#bfdbfe]"
              )}>
                <div className={cn("flex-shrink-0 mt-0.5",
                  activeAnnouncement.type === "warning" ? "text-[#d97706]" :
                  activeAnnouncement.type === "success" ? "text-[#16a34a]" : "text-[#1d4ed8]"
                )}>
                  {activeAnnouncement.type === "warning" ? <AlertTriangle className="w-4 h-4" /> :
                   activeAnnouncement.type === "success" ? <CheckCircle className="w-4 h-4" /> :
                   <Info className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-ink mb-0.5">Live Banner Preview</p>
                  <p className="text-[13px] text-ink">{activeAnnouncement.message}</p>
                  <p className="text-[11px] text-ink-quiet mt-1">Published by {activeAnnouncement.created_by_email} · {new Date(activeAnnouncement.created_at).toLocaleDateString()}</p>
                </div>
                <button
                  onClick={() => dismissAnnouncement(activeAnnouncement.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-paper-deep bg-white hover:bg-paper-warm transition-colors text-ink flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" /> Dismiss
                </button>
              </div>
            )}

            {/* History */}
            <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
              <div className="px-5 py-3.5 border-b border-paper-deep bg-paper-warm">
                <p className="text-[13px] font-semibold text-ink">History</p>
              </div>
              <div className="divide-y divide-paper-deep">
                {announcements.length === 0 && (
                  <p className="text-[13px] text-ink-quiet text-center py-6">No announcements yet.</p>
                )}
                {announcements.map((a) => (
                  <div key={a.id} className={cn("flex items-start gap-3 px-5 py-3.5", !a.active && "opacity-60")}>
                    <div className={cn("flex-shrink-0 mt-0.5",
                      a.type === "warning" ? "text-[#d97706]" : a.type === "success" ? "text-[#16a34a]" : "text-[#1d4ed8]"
                    )}>
                      {a.type === "warning" ? <AlertTriangle className="w-4 h-4" /> : a.type === "success" ? <CheckCircle className="w-4 h-4" /> : <Info className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-ink">{a.message}</p>
                      <p className="text-[11px] text-ink-quiet mt-0.5">{a.created_by_email} · {new Date(a.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0",
                      a.active ? "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]" : "bg-paper-warm text-ink-quiet border-paper-deep"
                    )}>
                      {a.active ? "Live" : "Dismissed"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Audit Log tab */}
        {tab === "audit" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[13px] text-ink-quiet">Last 200 actions</p>
              <button
                onClick={loadAudit}
                disabled={auditLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-paper-deep bg-white hover:bg-paper-warm transition-colors text-ink"
              >
                {auditLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Refresh
              </button>
            </div>

            <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
              {auditLoading && auditLogs.length === 0 ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-ink-quiet" />
                </div>
              ) : auditLogs.length === 0 ? (
                <p className="text-[13px] text-ink-quiet text-center py-8">No audit log entries yet. Actions you take here will appear here.</p>
              ) : (
                <div className="divide-y divide-paper-deep">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-4 px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[12px] font-semibold text-ink bg-paper-warm border border-paper-deep px-2 py-0.5 rounded-full">
                            {ACTION_LABELS[log.action] ?? log.action}
                          </span>
                          {log.target_business_name && (
                            <span className="text-[12px] text-ink-quiet">→ {log.target_business_name}</span>
                          )}
                        </div>
                        {log.details && (
                          <p className="text-[12px] text-ink-quiet mt-0.5">{log.details}</p>
                        )}
                        <p className="text-[11px] text-ink-quiet mt-0.5">{log.admin_email}</p>
                      </div>
                      <p className="text-[11px] text-ink-quiet flex-shrink-0 mt-0.5">
                        {new Date(log.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Team tab */}
        {tab === "team" && isSuperAdmin && (
          <div className="space-y-4">
            {/* Grant new admin */}
            <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
              <div className="px-5 py-3.5 border-b border-paper-deep bg-paper-warm">
                <p className="text-[13px] font-semibold text-ink">Grant Admin Access</p>
                <p className="text-[12px] text-ink-quiet mt-0.5">The person must already have a FieldCRM account.</p>
              </div>
              <div className="px-5 py-4 flex gap-2">
                <input
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") grantAdmin(); }}
                  placeholder="their@email.com"
                  className="flex-1 px-3 py-2 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink"
                />
                <button
                  onClick={grantAdmin}
                  disabled={teamLoading || !newAdminEmail.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold bg-ink text-white hover:bg-ink/80 disabled:opacity-50 transition-colors"
                >
                  {teamLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Grant Access
                </button>
              </div>
              {teamError && (
                <div className="px-5 pb-4">
                  <p className="text-[12px] text-[#dc2626] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" /> {teamError}
                  </p>
                </div>
              )}
              {teamSuccess && (
                <div className="px-5 pb-4">
                  <p className="text-[12px] text-[#16a34a] flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" /> {teamSuccess}
                  </p>
                </div>
              )}
            </div>

            {/* Current admins */}
            <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
              <div className="px-5 py-3.5 border-b border-paper-deep bg-paper-warm">
                <p className="text-[13px] font-semibold text-ink">Current Admins</p>
              </div>
              <div className="divide-y divide-paper-deep">
                {admins.length === 0 && (
                  <p className="text-[13px] text-ink-quiet text-center py-6">No admins found.</p>
                )}
                {admins.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-5 py-3.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-medium text-ink truncate">{a.email}</p>
                        {a.is_super_admin && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-[#7c3aed] bg-[#f5f3ff] border border-[#ddd6fe] px-1.5 py-0.5 rounded-full">
                            <Crown className="w-2.5 h-2.5" /> Super Admin
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-ink-quiet mt-0.5">
                        Added {new Date(a.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    {!a.is_super_admin && (
                      <button
                        onClick={() => revokeAdmin(a.id, a.email)}
                        disabled={teamLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-[#dc2626] border border-[#fecaca] hover:bg-[#fef2f2] disabled:opacity-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
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
