import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/design-system/primitives/Badge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  Loader2, Inbox, Calendar, MessageSquare, Check, X, ChevronDown, ChevronUp,
  Send, AlertCircle,
} from "lucide-react";

type Tab = "service" | "schedule" | "messages";

interface ServiceRequest {
  id: string;
  customer_id: string;
  description: string;
  requested_service_type: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  status: string;
  created_at: string;
}

interface ScheduleRequest {
  id: string;
  customer_id: string;
  job_id: string | null;
  request_type: string;
  requested_date: string | null;
  requested_time: string | null;
  reason: string | null;
  status: string;
  created_at: string;
}

interface PortalMessage {
  id: string;
  customer_id: string;
  sender: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

interface CustomerLite { id: string; name: string; }

const SERVICE_STATUS_COLORS: Record<string, string> = {
  new: "bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]",
  reviewed: "bg-[#fffbeb] text-[#d97706] border-[#fde68a]",
  scheduled: "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]",
  declined: "bg-[#fef2f2] text-[#dc2626] border-[#fecaca]",
};
const SCHEDULE_STATUS_COLORS: Record<string, string> = {
  pending: "bg-[#fffbeb] text-[#d97706] border-[#fde68a]",
  approved: "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]",
  declined: "bg-[#fef2f2] text-[#dc2626] border-[#fecaca]",
};

export function PortalRequestsPage() {
  const { business, loading: authLoading } = useAuth();
  const businessId = business?.id ?? "";
  const [tab, setTab] = useState<Tab>("service");
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Record<string, CustomerLite>>({});

  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [scheduleRequests, setScheduleRequests] = useState<ScheduleRequest[]>([]);
  const [messagesByCustomer, setMessagesByCustomer] = useState<Record<string, PortalMessage[]>>({});
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const replyText = expandedCustomer ? (replyDrafts[expandedCustomer] ?? "") : "";
  function setReplyText(value: string) {
    if (expandedCustomer) setReplyDrafts((prev) => ({ ...prev, [expandedCustomer]: value }));
  }
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    if (!businessId) {
      setLoadError("Your account has no business assigned. Sign in with a business account to continue.");
      setLoading(false); return;
    }
    let custQ = supabase.from("customers").select("id, name");
    let srQ = supabase.from("service_requests").select("*").order("created_at", { ascending: false });
    let sqQ = supabase.from("job_schedule_requests").select("*").order("created_at", { ascending: false });
    let msgQ = supabase.from("portal_messages").select("*").order("created_at", { ascending: true });
    if (businessId) {
      custQ = custQ.eq("business_id", businessId);
      srQ = srQ.eq("business_id", businessId);
      sqQ = sqQ.eq("business_id", businessId);
      msgQ = msgQ.eq("business_id", businessId);
    }
    const [custRes, srRes, sqRes, msgRes] = await Promise.all([custQ, srQ, sqQ, msgQ]);

    if ([custRes, srRes, sqRes, msgRes].some((result) => result.error)) {
      setLoadError("Portal requests could not be loaded. Please retry.");
      setLoading(false); return;
    }
    if (custRes.data) {
      const map: Record<string, CustomerLite> = {};
      for (const c of custRes.data) map[c.id] = c;
      setCustomers(map);
    }
    if (srRes.data) setServiceRequests(srRes.data);
    if (sqRes.data) setScheduleRequests(sqRes.data);
    if (msgRes.data) {
      const grouped: Record<string, PortalMessage[]> = {};
      for (const m of msgRes.data) {
        (grouped[m.customer_id] ??= []).push(m);
      }
      setMessagesByCustomer(grouped);
    }
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    if (businessId || !authLoading) load();
  }, [businessId, authLoading, load]);

  async function updateServiceStatus(id: string, status: string) {
    setActionError(null);
    const { data, error } = await supabase.from("service_requests").update({ status, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) { setActionError("Could not update the service request. Please retry."); return; }
    if (data) setServiceRequests((prev) => prev.map((r) => r.id === id ? data : r));
  }

  async function updateScheduleStatus(id: string, status: string) {
    setActionError(null);
    const { data, error } = await supabase.from("job_schedule_requests").update({ status }).eq("id", id).select().single();
    if (error) { setActionError(error.message); return; }
    if (data) setScheduleRequests((prev) => prev.map((r) => r.id === id ? data : r));
  }

  async function sendReply(customerId: string) {
    if (sending || !businessId || !replyText.trim()) return;
    setActionError(null);
    setSending(true);
    const { data, error } = await supabase.from("portal_messages").insert({
      business_id: businessId,
      customer_id: customerId,
      sender: "staff",
      body: replyText.trim(),
    }).select().single();
    setSending(false);
    if (error) { setActionError("Reply was not sent. Please retry."); return; }
    if (data) {
      setMessagesByCustomer((prev) => ({ ...prev, [customerId]: [...(prev[customerId] ?? []), data] }));
      setReplyDrafts((prev) => ({ ...prev, [customerId]: "" }));
    }
  }

  const newServiceCount = serviceRequests.filter((r) => r.status === "new").length;
  const pendingScheduleCount = scheduleRequests.filter((r) => r.status === "pending").length;
  const threads = Object.entries(messagesByCustomer).sort((a, b) => {
    const aLast = a[1][a[1].length - 1]?.created_at ?? "";
    const bLast = b[1][b[1].length - 1]?.created_at ?? "";
    return bLast.localeCompare(aLast);
  });

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-ink-quiet">
        <Loader2 className="w-4 h-4 animate-spin" /><span className="text-[14px]">Loading portal requests…</span>
      </div>
    );
  }

  if (loadError) return <div className="p-8" role="alert"><p>{loadError}</p><button onClick={load} className="underline mt-3">Retry</button></div>;

  return (
    <div className="p-8">
      {actionError && <p role="alert" className="text-red-700 mb-4">{actionError}</p>}
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-ink">Portal Requests</h1>
        <p className="text-[14px] text-ink-quiet mt-1">Service requests, reschedule/cancellation requests, and messages submitted by customers through their portal.</p>
      </div>

      <div className="flex gap-1 bg-white border border-paper-deep rounded-xl p-1 mb-6 w-fit">
        {([
          { key: "service" as Tab, icon: Inbox, label: `Service Requests${newServiceCount > 0 ? ` (${newServiceCount})` : ""}` },
          { key: "schedule" as Tab, icon: Calendar, label: `Reschedule/Cancel${pendingScheduleCount > 0 ? ` (${pendingScheduleCount})` : ""}` },
          { key: "messages" as Tab, icon: MessageSquare, label: "Messages" },
        ]).map(({ key, icon: Icon, label }) => (
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

      {tab === "service" && (
        <div className="space-y-3">
          {serviceRequests.length === 0 ? (
            <div className="bg-white rounded-xl border border-paper-deep py-16 text-center">
              <Inbox className="w-8 h-8 text-ink-quiet mx-auto mb-3 opacity-40" />
              <p className="text-[14px] text-ink-quiet">No service requests yet.</p>
            </div>
          ) : serviceRequests.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border border-paper-deep px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-ink">{customers[r.customer_id]?.name ?? "Unknown customer"}</p>
                  <p className="text-[13px] text-ink-soft mt-1">{r.description}</p>
                  <p className="text-[12px] text-ink-quiet mt-1">
                    {r.requested_service_type ? `${r.requested_service_type} · ` : ""}
                    {r.preferred_date ? `Preferred: ${r.preferred_date}${r.preferred_time ? ` at ${r.preferred_time}` : ""} · ` : ""}
                    Submitted {r.created_at.split("T")[0]}
                  </p>
                </div>
                <Badge variant="default" className={cn("border", SERVICE_STATUS_COLORS[r.status])}>{r.status}</Badge>
              </div>
              {r.status !== "scheduled" && r.status !== "declined" && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-paper-deep">
                  {r.status === "new" && (
                    <button onClick={() => updateServiceStatus(r.id, "reviewed")} className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-paper-deep hover:bg-paper-warm transition-colors">Mark Reviewed</button>
                  )}
                  <button onClick={() => updateServiceStatus(r.id, "scheduled")} className="flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-[#16a34a] text-white hover:bg-[#15803d] transition-colors">
                    <Check className="w-3.5 h-3.5" /> Mark Scheduled
                  </button>
                  <button onClick={() => updateServiceStatus(r.id, "declined")} className="flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-lg text-[#dc2626] border border-[#fecaca] hover:bg-[#fef2f2] transition-colors">
                    <X className="w-3.5 h-3.5" /> Decline
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "schedule" && (
        <div className="space-y-3">
          {scheduleRequests.length === 0 ? (
            <div className="bg-white rounded-xl border border-paper-deep py-16 text-center">
              <Calendar className="w-8 h-8 text-ink-quiet mx-auto mb-3 opacity-40" />
              <p className="text-[14px] text-ink-quiet">No reschedule or cancellation requests yet.</p>
            </div>
          ) : scheduleRequests.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border border-paper-deep px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-paper-warm text-ink-soft border border-paper-deep">{r.request_type}</span>
                    <p className="text-[13px] font-semibold text-ink">{customers[r.customer_id]?.name ?? "Unknown customer"}</p>
                  </div>
                  {r.requested_date && (
                    <p className="text-[13px] text-ink-soft">Requested: {r.requested_date}{r.requested_time ? ` at ${r.requested_time}` : ""}</p>
                  )}
                  {r.reason && <p className="text-[12px] text-ink-quiet mt-0.5">"{r.reason}"</p>}
                  <p className="text-[11px] text-ink-quiet mt-1">Submitted {r.created_at.split("T")[0]}</p>
                </div>
                <Badge variant="default" className={cn("border", SCHEDULE_STATUS_COLORS[r.status])}>{r.status}</Badge>
              </div>
              {r.status === "pending" && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-paper-deep">
                  <button onClick={() => updateScheduleStatus(r.id, "approved")} className="flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-[#16a34a] text-white hover:bg-[#15803d] transition-colors">
                    <Check className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button onClick={() => updateScheduleStatus(r.id, "declined")} className="flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-lg text-[#dc2626] border border-[#fecaca] hover:bg-[#fef2f2] transition-colors">
                    <X className="w-3.5 h-3.5" /> Decline
                  </button>
                  <p className="text-[11px] text-ink-quiet flex items-center gap-1 ml-1">
                    <AlertCircle className="w-3 h-3" /> Approval updates the job’s calendar date or cancels the visit.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "messages" && (
        <div className="space-y-3">
          {threads.length === 0 ? (
            <div className="bg-white rounded-xl border border-paper-deep py-16 text-center">
              <MessageSquare className="w-8 h-8 text-ink-quiet mx-auto mb-3 opacity-40" />
              <p className="text-[14px] text-ink-quiet">No messages yet.</p>
            </div>
          ) : threads.map(([customerId, msgs]) => {
            const last = msgs[msgs.length - 1];
            const expanded = expandedCustomer === customerId;
            return (
              <div key={customerId} className="bg-white rounded-xl border border-paper-deep overflow-hidden">
                <button
                  onClick={() => { setExpandedCustomer(expanded ? null : customerId); setActionError(null); }}
                  className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-paper-warm transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-ink">{customers[customerId]?.name ?? "Unknown customer"}</p>
                    <p className="text-[12px] text-ink-quiet truncate">{last.sender === "staff" ? "You: " : ""}{last.body}</p>
                  </div>
                  {expanded ? <ChevronUp className="w-4 h-4 text-ink-quiet" /> : <ChevronDown className="w-4 h-4 text-ink-quiet" />}
                </button>
                {expanded && (
                  <div className="border-t border-paper-deep px-5 py-4 space-y-3">
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {msgs.map((m) => (
                        <div key={m.id} className={cn("flex", m.sender === "staff" ? "justify-end" : "justify-start")}>
                          <div className={cn(
                            "max-w-[75%] rounded-lg px-3 py-2 text-[13px]",
                            m.sender === "staff" ? "bg-ink text-white" : "bg-paper-warm text-ink"
                          )}>
                            {m.body}
                            <p className={cn("text-[10px] mt-1", m.sender === "staff" ? "text-white/60" : "text-ink-quiet")}>{m.created_at.split("T")[0]}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") sendReply(customerId); }}
                        placeholder="Reply…"
                        className="flex-1 px-3 py-2 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors"
                      />
                      <button
                        aria-label="Send reply"
                        onClick={() => sendReply(customerId)}
                        disabled={sending || !replyText.trim()}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold bg-ink text-white hover:bg-ink/80 disabled:opacity-50 transition-colors"
                      >
                        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
