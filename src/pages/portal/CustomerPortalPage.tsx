import { isClosedJob } from "@/lib/scheduling";
import { balanceDue, sumMoney } from "@/lib/money";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PortalAuthProvider, usePortalAuth, portalSupabase } from "@/lib/portalAuth";
import {
  Loader2, CheckCircle2, Clock, FileText, Receipt, Leaf, AlertCircle, LogIn, MailQuestion,
  Wrench, CalendarClock, MessageSquare, Send, X, Plus, History,
} from "lucide-react";
import { cn } from "@/lib/utils";

function statusColor(s: string) {
  const m: Record<string, string> = {
    draft: "bg-paper-warm text-ink-soft",
    quoted: "bg-[#fff3e0] text-[#e65100]",
    scheduled: "bg-[#e3f2fd] text-[#1565c0]",
    "in-progress": "bg-[#fff8e1] text-[#f57f17]",
    complete: "bg-[#e8f5e9] text-[#2e7d32]",
    invoiced: "bg-paper-warm text-ink-soft",
    sent: "bg-[#fff3e0] text-[#e65100]",
    approved: "bg-[#e8f5e9] text-[#2e7d32]",
    paid: "bg-[#e8f5e9] text-[#2e7d32]",
    overdue: "bg-[#ffebee] text-[#c62828]",
    declined: "bg-[#ffebee] text-[#c62828]",
  };
  return m[s] ?? "bg-paper-warm text-ink-soft";
}

// Online payment is intentionally unreachable from the portal until Stripe is
// configured — the safe portal-read path (get_portal_business_contact) doesn't even
// return Stripe fields anymore. This constant is the single place that will flip
// once Stripe setup lands; until then every unpaid invoice shows a clear, honest
// "not available yet" note instead of a broken or misleading Pay button.
const PORTAL_PAYMENTS_AVAILABLE = false;

function PortalShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-paper-warm">{children}</div>;
}

function CenteredMessage({ icon: Icon, title, body }: { icon: React.ElementType; title: string; body: string }) {
  return (
    <PortalShell>
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
        <Icon className="w-10 h-10 text-ink-quiet opacity-30 mb-3" />
        <p className="text-[16px] font-semibold text-ink">{title}</p>
        <p className="text-[13px] text-ink-quiet mt-1 max-w-sm">{body}</p>
      </div>
    </PortalShell>
  );
}

function CustomerPortalPageContent() {
  const { customerId } = useParams<{ customerId: string }>();
  const [searchParams] = useSearchParams();
  const portalAuth = usePortalAuth();
  const staffAuth = useAuth();
  const preview = searchParams.get("preview") === "staff";
  const session = preview ? staffAuth.session : portalAuth.session;
  const authLoading = preview ? staffAuth.loading : portalAuth.loading;
  const client = preview ? supabase : portalSupabase;

  const [customer, setCustomer] = useState<any>(null);
  const [businessContact, setBusinessContact] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [estimates, setEstimates] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  // Phase 2: service requests, reschedule/cancel requests, messaging
  const [serviceRequests, setServiceRequests] = useState<any[]>([]);
  const [scheduleRequests, setScheduleRequests] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);

  const [showServiceForm, setShowServiceForm] = useState(false);
  const [srDescription, setSrDescription] = useState("");
  const [srPreferredDate, setSrPreferredDate] = useState("");
  const [srSaving, setSrSaving] = useState(false);
  const [srError, setSrError] = useState<string | null>(null);

  const [reschedulingJobId, setReschedulingJobId] = useState<string | null>(null);
  const [rsType, setRsType] = useState<"reschedule" | "cancel">("reschedule");
  const [rsDate, setRsDate] = useState("");
  const [rsReason, setRsReason] = useState("");
  const [rsSaving, setRsSaving] = useState(false);
  const [rsError, setRsError] = useState<string | null>(null);

  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);

  const paymentParam = searchParams.get("payment") as "success" | "cancelled" | null;
  const paidInvoiceIdParam = searchParams.get("invoice_id");

  useEffect(() => {
    if (!authLoading && session && customerId) load(customerId);
    else if (!authLoading) setDataLoading(false);
  }, [authLoading, session, customerId]);

  async function load(id: string) {
    setDataLoading(true);
    setLoadError(null);
    setAccessDenied(false);

    setCustomer(null); setBusinessContact(null); setJobs([]); setEstimates([]); setInvoices([]);
    const { data, error } = await client.rpc("get_portal_data", { _customer_id: id });
    if (error) setLoadError("We couldn't load your account. Please refresh to try again.");
    else if (!data) setAccessDenied(true);
    else {
      setCustomer(data.customer); setBusinessContact(data.contact);
      setJobs(data.jobs); setEstimates(data.estimates); setInvoices(data.invoices);

      // These three are separate real tables with their own RLS (customer_portal_access
      // scoped SELECT) rather than routed through get_portal_data — they carry no
      // internal-only columns, so a direct, RLS-protected table read is sufficient.
      const [srRes, sqRes, msgRes] = await Promise.all([
        client.from("service_requests").select("*").eq("customer_id", id).order("created_at", { ascending: false }),
        client.from("job_schedule_requests").select("*").eq("customer_id", id).order("created_at", { ascending: false }),
        client.from("portal_messages").select("*").eq("customer_id", id).order("created_at", { ascending: true }),
      ]);
      if (srRes.error || sqRes.error || msgRes.error) {
        setLoadError("Requests and messages could not be loaded. Please refresh to retry.");
      }
      if (srRes.data) setServiceRequests(srRes.data);
      if (sqRes.data) setScheduleRequests(sqRes.data);
      if (msgRes.data) setMessages(msgRes.data);
    }
    setDataLoading(false);
  }

  async function submitServiceRequest() {
    if (preview || srSaving || !srDescription.trim() || !customerId) return;
    setSrSaving(true);
    setSrError(null);
    const { data, error } = await client.from("service_requests").insert({
      customer_id: customerId,
      description: srDescription.trim(),
      preferred_date: srPreferredDate || null,
    }).select().single();
    setSrSaving(false);
    if (error) { setSrError("Couldn't submit your request — please try again."); return; }
    setServiceRequests((prev) => [data, ...prev]);
    setSrDescription(""); setSrPreferredDate(""); setShowServiceForm(false);
  }

  async function submitScheduleRequest(jobId: string) {
    if (preview || rsSaving || !customerId) return;
    if (rsType === "reschedule" && !rsDate) { setRsError("Choose a requested date."); return; }
    setRsSaving(true);
    setRsError(null);
    const { data, error } = await client.from("job_schedule_requests").insert({
      customer_id: customerId,
      job_id: jobId,
      request_type: rsType,
      requested_date: rsType === "reschedule" ? (rsDate || null) : null,
      reason: rsReason.trim() || null,
    }).select().single();
    setRsSaving(false);
    if (error) { setRsError("Couldn't submit your request — please try again."); return; }
    setScheduleRequests((prev) => [data, ...prev]);
    setReschedulingJobId(null); setRsDate(""); setRsReason("");
  }

  async function sendMessage() {
    if (preview || sendingMessage || !messageText.trim() || !customerId) return;
    setMessageError(null);
    setSendingMessage(true);
    const { data, error } = await client.from("portal_messages").insert({
      customer_id: customerId,
      sender: "customer",
      body: messageText.trim(),
    }).select().single();
    setSendingMessage(false);
    if (error) { setMessageError("Message was not sent. Your text is saved here — please try again."); return; }
    if (data) { setMessages((prev) => [...prev, data]); setMessageText(""); }
  }

  const upcomingJobs = jobs.filter((j) => !isClosedJob(j.status));
  const pastJobs = jobs.filter((j) => isClosedJob(j.status));

  if (authLoading || dataLoading) {
    return (
      <PortalShell>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-ink-quiet" />
        </div>
      </PortalShell>
    );
  }

  if (!session) {
    return (
      <CenteredMessage
        icon={LogIn}
        title="Sign-in required"
        body="This portal requires a personal invite link from your service provider. If you were sent one, please use that link directly. If it's expired, ask them to resend it."
      />
    );
  }

  if (loadError) {
    return (
      <CenteredMessage
        icon={AlertCircle}
        title="Something went wrong"
        body={loadError}
      />
    );
  }

  if (accessDenied || !customer) {
    return (
      <CenteredMessage
        icon={MailQuestion}
        title="No access to this portal"
        body="Your sign-in link doesn't grant access here — it may be for a different account, or your access may have expired or been revoked. Contact your service provider for a new link."
      />
    );
  }

  const unpaidInvoices = invoices.filter((i) => balanceDue(i) > 0);
  const totalOwed = sumMoney(unpaidInvoices, balanceDue);

  // The Stripe success redirect fires the instant checkout completes client-side —
  // before the async webhook has necessarily updated the invoice's status in the
  // database. Only claim "payment received" once that invoice's own status confirms
  // it; otherwise say we're still confirming rather than asserting an unverified
  // state, and never mark anything paid from the URL alone.
  const returnedInvoice = paidInvoiceIdParam ? invoices.find((i) => i.id === paidInvoiceIdParam) : null;
  const paymentVerifiedPaid = paymentParam === "success" && returnedInvoice?.status === "paid";
  const paymentStillConfirming = paymentParam === "success" && !paymentVerifiedPaid;

  const businessName = businessContact?.business_name || "Your Service Provider";

  return (
    <PortalShell>
      {/* Header — neutral "Customer Portal" label; no logo/color branding (deferred, no final CRM name yet) */}
      <div className="bg-white border-b border-paper-deep">
        <div className="max-w-2xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-moss flex items-center justify-center flex-shrink-0">
            <Leaf className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-ink">{businessName}</p>
            <p className="text-[12px] text-ink-quiet">Customer Portal</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {preview && <p className="text-sm text-ink-quiet" role="status">Staff preview — customer forms are read-only. Use a customer invite link to test submissions.</p>}
        {/* Welcome */}
        <div className="bg-white rounded-xl border border-paper-deep p-5">
          <h1 className="text-[20px] font-semibold text-ink">Hi, {customer.name.split(" ")[0]}!</h1>
          <p className="text-[13px] text-ink-quiet mt-1">
            {businessContact?.portal_welcome_message || "Here's a summary of your account."}
          </p>
          {paymentVerifiedPaid && (
            <div className="mt-4 bg-[#e8f5e9] border border-[#a5d6a7] rounded-lg px-4 py-3 flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-[#2e7d32] flex-shrink-0" />
              <p className="text-[13px] text-[#1b5e20] font-medium">Payment received — thank you!</p>
            </div>
          )}
          {paymentStillConfirming && (
            <div className="mt-4 bg-[#e3f2fd] border border-[#90caf9] rounded-lg px-4 py-3 flex items-center gap-3">
              <Clock className="w-4 h-4 text-[#1565c0] flex-shrink-0" />
              <p className="text-[13px] text-[#1565c0] font-medium">
                Thanks — we're confirming your payment now. This usually takes just a few seconds; refresh this page if the invoice below doesn't update shortly.
              </p>
            </div>
          )}
          {paymentParam === "cancelled" && (
            <div className="mt-4 bg-[#fff3e0] border border-[#ffcc80] rounded-lg px-4 py-3 flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-[#e65100] flex-shrink-0" />
              <p className="text-[13px] text-[#e65100] font-medium">Payment cancelled — you were not charged.</p>
            </div>
          )}
          {paymentParam === null && totalOwed > 0 && (
            <div className="mt-4 bg-[#fff3e0] border border-[#ffcc80] rounded-lg px-4 py-3 flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-[#e65100] flex-shrink-0" />
              <p className="text-[13px] text-[#e65100] font-medium">
                You have ${totalOwed.toLocaleString(undefined, { minimumFractionDigits: 2 })} outstanding on {unpaidInvoices.length} invoice{unpaidInvoices.length !== 1 ? "s" : ""}.
              </p>
            </div>
          )}
        </div>

        {/* Request a service */}
        <div className="bg-white rounded-xl border border-paper-deep p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-ink flex items-center gap-2">
              <Wrench className="w-4 h-4 text-ink-quiet" /> Request a Service
            </h2>
            {!preview && !showServiceForm && (
              <button
                onClick={() => setShowServiceForm(true)}
                className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-soft hover:text-ink transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> New Request
              </button>
            )}
          </div>

          {showServiceForm && (
            <div className="mt-3 space-y-2">
              <textarea
                value={srDescription}
                onChange={(e) => setSrDescription(e.target.value)}
                placeholder="What do you need done?"
                rows={2}
                className="w-full px-3 py-2 text-[13px] border border-paper-deep rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors resize-none"
              />
              <input
                type="date"
                value={srPreferredDate}
                onChange={(e) => setSrPreferredDate(e.target.value)}
                className="px-3 py-2 text-[13px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors"
              />
              {srError && <p className="text-[12px] text-[#dc2626] flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> {srError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={submitServiceRequest}
                  disabled={srSaving || !srDescription.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-ink text-white hover:bg-ink/80 disabled:opacity-50 transition-colors"
                >
                  {srSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Submit
                </button>
                <button
                  onClick={() => { setShowServiceForm(false); setSrDescription(""); setSrPreferredDate(""); setSrError(null); }}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-medium border border-paper-deep bg-white hover:bg-paper-warm transition-colors text-ink"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {serviceRequests.length > 0 && (
            <div className="mt-3 pt-3 border-t border-paper-deep space-y-2">
              {serviceRequests.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3">
                  <p className="text-[12px] text-ink-soft truncate">{r.description}</p>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize flex-shrink-0 ${statusColor(r.status === "new" ? "sent" : r.status === "scheduled" ? "approved" : r.status === "declined" ? "declined" : "quoted")}`}>
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Jobs */}
        {jobs.length === 0 && estimates.length === 0 && invoices.length === 0 ? (
          <div className="bg-white rounded-xl border border-paper-deep p-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-ink-quiet opacity-30 mx-auto mb-3" />
            <p className="text-[14px] text-ink-quiet">Nothing here yet — check back once your first job, estimate, or invoice is on file.</p>
          </div>
        ) : (
          <>
            {upcomingJobs.length > 0 && (
              <div>
                <h2 className="text-[14px] font-semibold text-ink mb-3 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-ink-quiet" /> Upcoming Appointments
                </h2>
                <div className="bg-white rounded-xl border border-paper-deep divide-y divide-paper-deep overflow-hidden">
                  {upcomingJobs.map((j) => {
                    const pendingRequest = scheduleRequests.find((r) => r.job_id === j.id && r.status === "pending");
                    const lastDecision = scheduleRequests.find((r) => r.job_id === j.id && r.status !== "pending");
                    return (
                      <div key={j.id} className="px-5 py-3.5">
                        <div className="flex items-center gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-medium text-ink">{j.title}</p>
                            {j.scheduled_date && (
                              <p className="text-[12px] text-ink-quiet flex items-center gap-1 mt-0.5">
                                <Clock className="w-3 h-3" /> {j.scheduled_date}{j.scheduled_time ? ` at ${j.scheduled_time}` : ""}
                              </p>
                            )}
                          </div>
                          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${statusColor(j.status)}`}>
                            {j.status.replace("-", " ")}
                          </span>
                        </div>

                        {lastDecision && <p className="text-[11px] text-ink-quiet mt-2">Previous {lastDecision.request_type} request: {lastDecision.status}</p>}
                        {pendingRequest ? (
                          <p className="text-[11px] text-ink-quiet mt-2 flex items-center gap-1.5">
                            <CalendarClock className="w-3 h-3" /> {pendingRequest.request_type === "cancel" ? "Cancellation" : "Reschedule"} request {pendingRequest.status}
                          </p>
                        ) : reschedulingJobId === j.id ? (
                          <div className="mt-2 pt-2 border-t border-paper-deep space-y-2">
                            <div className="flex gap-2">
                              <button onClick={() => setRsType("reschedule")} className={cn("text-[11px] font-medium px-2.5 py-1 rounded-full border", rsType === "reschedule" ? "bg-ink text-white border-ink" : "border-paper-deep text-ink-quiet")}>Reschedule</button>
                              <button onClick={() => setRsType("cancel")} className={cn("text-[11px] font-medium px-2.5 py-1 rounded-full border", rsType === "cancel" ? "bg-ink text-white border-ink" : "border-paper-deep text-ink-quiet")}>Cancel</button>
                            </div>
                            {rsType === "reschedule" && (
                              <input type="date" value={rsDate} onChange={(e) => setRsDate(e.target.value)} className="px-3 py-1.5 text-[12px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors" />
                            )}
                            <input
                              value={rsReason}
                              onChange={(e) => setRsReason(e.target.value)}
                              placeholder="Reason (optional)"
                              className="w-full px-3 py-1.5 text-[12px] border border-paper-deep rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors"
                            />
                            {rsError && <p className="text-[11px] text-[#dc2626]">{rsError}</p>}
                            <div className="flex gap-2">
                              <button onClick={() => submitScheduleRequest(j.id)} disabled={rsSaving} className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-ink text-white hover:bg-ink/80 disabled:opacity-50 transition-colors">
                                {rsSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Submit Request
                              </button>
                              <button onClick={() => setReschedulingJobId(null)} className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg border border-paper-deep hover:bg-paper-warm transition-colors">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            disabled={preview}
                            onClick={() => { setReschedulingJobId(j.id); setRsError(null); }}
                            className="text-[11px] font-medium text-ink-quiet hover:text-ink mt-2 flex items-center gap-1 transition-colors"
                          >
                            <CalendarClock className="w-3 h-3" /> Request reschedule or cancellation
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {pastJobs.length > 0 && (
              <div>
                <h2 className="text-[14px] font-semibold text-ink mb-3 flex items-center gap-2">
                  <History className="w-4 h-4 text-ink-quiet" /> Appointment History
                </h2>
                <div className="bg-white rounded-xl border border-paper-deep divide-y divide-paper-deep overflow-hidden">
                  {pastJobs.map((j) => (
                    <div key={j.id} className="flex items-center gap-4 px-5 py-3.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-ink">{j.title}</p>
                        {j.scheduled_date && (
                          <p className="text-[12px] text-ink-quiet flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" /> {j.scheduled_date}
                          </p>
                        )}
                      </div>
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${statusColor(j.status)}`}>
                        {j.status.replace("-", " ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Estimates */}
            {estimates.length > 0 && (
              <div>
                <h2 className="text-[14px] font-semibold text-ink mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-ink-quiet" /> Estimates
                </h2>
                <div className="bg-white rounded-xl border border-paper-deep divide-y divide-paper-deep overflow-hidden">
                  {estimates.map((e) => (
                    <div key={e.id} className="flex items-center gap-4 px-5 py-3.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-ink">${Number(e.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        <p className="text-[12px] text-ink-quiet">{e.sent_at ? `Sent ${e.sent_at.split("T")[0]}` : `Created ${e.created_at?.split("T")[0]}`}</p>
                        {e.notes && <p className="text-[12px] text-ink-quiet mt-0.5">{e.notes}</p>}
                      </div>
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${statusColor(e.status)}`}>
                        {e.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Invoices */}
            {invoices.length > 0 && (
              <div>
                <h2 className="text-[14px] font-semibold text-ink mb-3 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-ink-quiet" /> Invoices
                </h2>
                <div className="bg-white rounded-xl border border-paper-deep divide-y divide-paper-deep overflow-hidden">
                  {invoices.map((inv) => (
                    <div key={inv.id} className="flex items-center gap-4 px-5 py-3.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-ink">${Number(inv.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        <p className="text-[12px] text-ink-quiet">Paid: ${Number(inv.paid_total ?? 0).toFixed(2)} · Balance: ${balanceDue(inv).toFixed(2)}</p>
                        {inv.due_at && <p className="text-[12px] text-ink-quiet">Due {inv.due_at}</p>}
                        {inv.notes && <p className="text-[12px] text-ink-quiet mt-0.5">{inv.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!PORTAL_PAYMENTS_AVAILABLE && inv.status !== "paid" && (
                          <span className="text-[11px] text-ink-quiet italic">Online payment isn't available yet — we'll follow up directly.</span>
                        )}
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${statusColor(inv.status)}`}>
                          {inv.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Messages — in-app only, no real email/SMS is sent */}
        <div className="bg-white rounded-xl border border-paper-deep p-5">
          <h2 className="text-[14px] font-semibold text-ink mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-ink-quiet" /> Messages
          </h2>
          {messages.length === 0 ? (
            <p className="text-[12px] text-ink-quiet mb-3">No messages yet — send one below and we'll get back to you.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto mb-3">
              {messages.map((m) => (
                <div key={m.id} className={cn("flex", m.sender === "customer" ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[75%] rounded-lg px-3 py-2 text-[13px]",
                    m.sender === "customer" ? "bg-ink text-white" : "bg-paper-warm text-ink"
                  )}>
                    {m.body}
                    <p className={cn("text-[10px] mt-1", m.sender === "customer" ? "text-white/60" : "text-ink-quiet")}>{m.created_at.split("T")[0]}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {messageError && <p role="alert" className="text-sm text-red-700 mb-2">{messageError}</p>}
          <div className="flex gap-2">
            <input
              disabled={preview}
              aria-label="Message"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
              placeholder="Type a message…"
              className="flex-1 px-3 py-2 text-[13px] border border-paper-deep rounded-lg bg-white placeholder:text-ink-quiet focus:outline-none focus:border-ink transition-colors"
            />
            <button
              onClick={sendMessage}
              aria-label="Send message"
              disabled={preview || sendingMessage || !messageText.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold bg-ink text-white hover:bg-ink/80 disabled:opacity-50 transition-colors"
            >
              {sendingMessage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <p className="text-[11px] text-ink-quiet text-center pb-4">
          {businessContact?.contact_phone || businessContact?.contact_email
            ? <>Questions? Contact us at {businessContact.contact_phone}{businessContact.contact_phone && businessContact.contact_email ? " or " : ""}{businessContact.contact_email}.</>
            : "Questions? Contact us directly."}
        </p>
      </div>
    </PortalShell>
  );
}

export function CustomerPortalPage() {
  return (
    <PortalAuthProvider>
      <CustomerPortalPageContent />
    </PortalAuthProvider>
  );
}
