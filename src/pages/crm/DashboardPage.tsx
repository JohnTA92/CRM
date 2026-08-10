import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/design-system/primitives/Badge";
import { supabase } from "@/lib/supabase";
import { jobStatusLabel, invoiceStatusLabel } from "@/data/crm";
import { useServices, serviceLabel } from "@/lib/services";
import { useAuth } from "@/lib/auth";
import { EXPENSE_CATEGORIES } from "@/pages/crm/ExpensesPage";
import {
  Briefcase, Users, DollarSign, AlertCircle, ArrowRight, Clock,
  TrendingUp, TrendingDown, FileText, Receipt, Target, ChevronRight,
  Loader2, TriangleAlert, CheckCircle2, Wallet,
} from "lucide-react";

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function daysBetween(isoA: string, isoB: string) {
  return Math.floor((new Date(isoB).getTime() - new Date(isoA).getTime()) / 86400000);
}

function startOf(period: "today" | "wtd" | "mtd" | "qtd"): string {
  const now = new Date();
  if (period === "today") return now.toISOString().split("T")[0];
  if (period === "wtd") {
    const d = new Date(now);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toISOString().split("T")[0];
  }
  if (period === "mtd") return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const q = Math.floor(now.getMonth() / 3);
  return `${now.getFullYear()}-${String(q * 3 + 1).padStart(2, "0")}-01`;
}

function startOfPrior(period: "today" | "wtd" | "mtd" | "qtd"): { from: string; to: string } {
  const now = new Date();
  if (period === "today") {
    const d = new Date(now); d.setFullYear(d.getFullYear() - 1);
    const s = d.toISOString().split("T")[0];
    return { from: s, to: s };
  }
  if (period === "wtd") {
    const start = new Date(now);
    start.setDate(start.getDate() - start.getDay());
    start.setFullYear(start.getFullYear() - 1);
    const end = new Date(start);
    end.setDate(end.getDate() + now.getDay());
    return { from: start.toISOString().split("T")[0], to: end.toISOString().split("T")[0] };
  }
  if (period === "mtd") {
    const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const m = now.getMonth() === 0 ? 12 : now.getMonth();
    return {
      from: `${y}-${String(m).padStart(2, "0")}-01`,
      to: `${y}-${String(m).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    };
  }
  const q = Math.floor(now.getMonth() / 3);
  const monthOffset = now.getMonth() - q * 3;
  return {
    from: `${now.getFullYear() - 1}-${String(q * 3 + 1).padStart(2, "0")}-01`,
    to: `${now.getFullYear() - 1}-${String(q * 3 + 1 + monthOffset).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
  };
}

function jobStatusBadge(s: string): "warning" | "success" | "error" | "muted" | "default" | "gold" {
  const m: Record<string, any> = { draft: "muted", quoted: "warning", scheduled: "default", "in-progress": "gold", complete: "success", invoiced: "muted" };
  return m[s] ?? "default";
}
function invStatusBadge(s: string): "warning" | "success" | "error" | "muted" | "default" {
  const m: Record<string, any> = { draft: "muted", sent: "warning", paid: "success", overdue: "error", voided: "muted" };
  return m[s] ?? "default";
}

const PERIOD_LABELS: Record<string, string> = { today: "Today", wtd: "This Week", mtd: "This Month", qtd: "This Quarter" };

// ─── sub-components ──────────────────────────────────────────────────────────

function TrendPill({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
      up ? "bg-[#e8f5e9] text-[#2e7d32]" : "bg-[#ffebee] text-[#c62828]"
    }`}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(pct)}% vs last yr
    </span>
  );
}

function KpiCard({ label, value, sub, icon: Icon, accent, trend }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; accent?: string; trend?: number | null;
}) {
  return (
    <div className="bg-white rounded-xl border border-paper-deep p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${accent ?? "bg-paper-warm"}`}>
        <Icon className="w-5 h-5 text-ink-soft" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-ink-quiet font-medium">{label}</p>
        <p className="text-[24px] font-semibold text-ink leading-tight mt-0.5">{value}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {sub && <p className="text-[12px] text-ink-quiet">{sub}</p>}
          {trend !== undefined && <TrendPill pct={trend ?? null} />}
        </div>
      </div>
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export function DashboardPage() {
  const { services } = useServices();
  const { business } = useAuth();
  const businessId = business?.id ?? "";
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"today" | "wtd" | "mtd" | "qtd">("mtd");

  const [jobs, setJobs] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [estimates, setEstimates] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);

  const [monthlyGoal, setMonthlyGoal] = useState<number>(0);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [jobRes, invRes, estRes, custRes, expRes, settingsRes] = await Promise.all([
      supabase.from("jobs").select("*").eq("business_id", businessId),
      supabase.from("invoices").select("*").eq("business_id", businessId),
      supabase.from("estimates").select("*").eq("business_id", businessId),
      supabase.from("customers").select("id, name, archived").eq("business_id", businessId),
      supabase.from("expenses").select("*").eq("business_id", businessId),
      supabase.from("company_settings").select("monthly_goal").eq("id", businessId).single(),
    ]);
    if (jobRes.data) setJobs(jobRes.data);
    if (invRes.data) setInvoices(invRes.data);
    if (estRes.data) setEstimates(estRes.data);
    if (custRes.data) setCustomers(custRes.data);
    if (expRes.data) setExpenses(expRes.data);
    if (settingsRes.data?.monthly_goal) setMonthlyGoal(Number(settingsRes.data.monthly_goal));
    setLoading(false);
  }

  const today = new Date().toISOString().split("T")[0];
  const periodStart = startOf(period);
  const prior = startOfPrior(period);

  // ── KPI calculations ──
  const paidInvoices = invoices.filter((i) => i.status === "paid");
  const periodPaid = paidInvoices.filter((i) => (i.paid_at ?? i.created_at)?.split("T")[0] >= periodStart);
  const priorPaid = paidInvoices.filter((i) => {
    const d = (i.paid_at ?? i.created_at)?.split("T")[0];
    return d >= prior.from && d <= prior.to;
  });
  const revenue = periodPaid.reduce((s: number, i: any) => s + (i.total ?? 0), 0);
  const priorRevenue = priorPaid.reduce((s: number, i: any) => s + (i.total ?? 0), 0);
  const revTrend = priorRevenue > 0 ? Math.round(((revenue - priorRevenue) / priorRevenue) * 100) : null;

  const completedJobs = jobs.filter((j) =>
    ["complete", "invoiced"].includes(j.status) && (j.updated_at ?? j.created_at)?.split("T")[0] >= periodStart
  );
  const priorCompleted = jobs.filter((j) => {
    const d = (j.updated_at ?? j.created_at)?.split("T")[0];
    return ["complete", "invoiced"].includes(j.status) && d >= prior.from && d <= prior.to;
  });
  const jobsTrend = priorCompleted.length > 0
    ? Math.round(((completedJobs.length - priorCompleted.length) / priorCompleted.length) * 100)
    : null;
  const avgJobSize = completedJobs.length > 0 ? Math.round(revenue / completedJobs.length) : 0;
  const newJobsBooked = jobs.filter((j) => j.created_at?.split("T")[0] >= periodStart).length;

  // ── P&L ──
  const periodExpenses = expenses.filter((e) => (e.date ?? "") >= periodStart);
  const totalExpenses = periodExpenses.reduce((s: number, e: any) => s + (e.amount ?? 0), 0);
  const grossProfit = revenue - totalExpenses;
  const marginPct = revenue > 0 ? Math.round((grossProfit / revenue) * 100) : 0;
  const expensesByCategory: Record<string, number> = {};
  periodExpenses.forEach((e: any) => {
    expensesByCategory[e.category] = (expensesByCategory[e.category] ?? 0) + (e.amount ?? 0);
  });

  // ── Pipeline strip ──
  const scheduledJobs = jobs.filter((j) => ["scheduled", "in-progress"].includes(j.status));
  const unpaidInvoices = invoices.filter((i) => ["sent", "overdue"].includes(i.status));
  const pendingEstimates = estimates.filter((e) => ["draft", "sent"].includes(e.status));
  const quotedValue = pendingEstimates
    .reduce((s: number, e: any) => {
      const lineItems: any[] = e.line_items ?? [];
      const total = lineItems.reduce((ls: number, li: any) => ls + (li.quantity ?? 0) * (li.unitPrice ?? 0), 0);
      return s + (e.total ?? total ?? 0);
    }, 0);
  const unpaidValue = unpaidInvoices.reduce((s: number, i: any) => s + (i.total ?? 0), 0);

  // ── Estimate conversion ──
  const sentEstimates = estimates.filter((e) => e.status !== "draft");
  const wonEstimates = estimates.filter((e) => e.status === "approved");
  const lostEstimates = estimates.filter((e) => ["declined", "expired"].includes(e.status));
  const closeRate = sentEstimates.length > 0 ? Math.round((wonEstimates.length / sentEstimates.length) * 100) : 0;

  // ── Invoice aging ──
  const agingBase = (i: any) => (i.sent_at ?? i.due_at ?? i.created_at)?.split("T")[0] ?? today;
  const aging30 = unpaidInvoices.filter((i) => daysBetween(agingBase(i), today) < 30);
  const aging60 = unpaidInvoices.filter((i) => { const d = daysBetween(agingBase(i), today); return d >= 30 && d < 60; });
  const aging60plus = unpaidInvoices.filter((i) => daysBetween(agingBase(i), today) >= 60);

  // ── Smart alerts ──
  const alerts: { type: "warn" | "error" | "info"; text: string; link: string }[] = [];
  const completedNoInvoice = jobs.filter((j) => j.status === "complete" && !j.invoice_id);
  if (completedNoInvoice.length > 0)
    alerts.push({ type: "warn", text: `${completedNoInvoice.length} completed job${completedNoInvoice.length > 1 ? "s" : ""} with no invoice created`, link: "/jobs" });
  const overdueInvs = invoices.filter((i) => i.status === "overdue");
  if (overdueInvs.length > 0)
    alerts.push({ type: "error", text: `${overdueInvs.length} overdue invoice${overdueInvs.length > 1 ? "s" : ""} — ${fmt$(overdueInvs.reduce((s: number, i: any) => s + (i.total ?? 0), 0))} outstanding`, link: "/invoices" });
  const staleInvs = invoices.filter((i) => i.status === "sent" && i.sent_at && daysBetween(i.sent_at.split("T")[0], today) > 14);
  if (staleInvs.length > 0)
    alerts.push({ type: "warn", text: `${staleInvs.length} invoice${staleInvs.length > 1 ? "s" : ""} sent 14+ days ago with no payment`, link: "/invoices" });
  const pendingEsts = estimates.filter((e) => e.status === "sent");
  if (pendingEsts.length > 0)
    alerts.push({ type: "info", text: `${pendingEsts.length} estimate${pendingEsts.length > 1 ? "s" : ""} awaiting customer approval`, link: "/estimates" });
  const draftEsts = estimates.filter((e) => e.status === "draft");
  if (draftEsts.length > 0)
    alerts.push({ type: "warn", text: `${draftEsts.length} draft estimate${draftEsts.length > 1 ? "s" : ""} not yet sent`, link: "/estimates" });

  // ── Avg by service type ──
  const serviceStats: Record<string, { count: number; revenue: number }> = {};
  paidInvoices.forEach((inv: any) => {
    const job = jobs.find((j: any) => j.id === inv.job_id);
    const t = job?.service_type ?? "custom";
    if (!serviceStats[t]) serviceStats[t] = { count: 0, revenue: 0 };
    serviceStats[t].count++;
    serviceStats[t].revenue += inv.total ?? 0;
  });

  // ── Today / recent ──
  const todayJobs = jobs.filter((j) => j.scheduled_date === today);
  const recentJobs = [...jobs].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")).slice(0, 5);
  const recentInvoices = [...invoices].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")).slice(0, 4);
  const customerNames: Record<string, string> = {};
  customers.forEach((c: any) => { customerNames[c.id] = c.name; });

  // ── Monthly goal (always MTD) ──
  const mtdRevenue = paidInvoices
    .filter((i) => (i.paid_at ?? i.created_at)?.startsWith(today.slice(0, 7)))
    .reduce((s: number, i: any) => s + (i.total ?? 0), 0);
  const goalPct = monthlyGoal > 0 ? Math.min(100, Math.round((mtdRevenue / monthlyGoal) * 100)) : 0;
  const goalGap = monthlyGoal > 0 ? Math.max(0, monthlyGoal - mtdRevenue) : 0;

  async function saveGoal() {
    const val = Math.round(parseFloat(goalInput.replace(/[^0-9.]/g, "")));
    if (!isNaN(val) && val > 0) {
      setMonthlyGoal(val);
      await supabase.from("company_settings").upsert({ id: businessId, monthly_goal: val });
    }
    setEditingGoal(false);
  }

  return (
    <div className="p-8">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold text-ink">Dashboard</h1>
          <p className="text-[14px] text-ink-quiet mt-0.5">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {loading && <Loader2 className="w-4 h-4 animate-spin text-ink-quiet" />}
          <div className="flex gap-1 bg-paper-warm border border-paper-deep rounded-lg p-1">
            {(["today", "wtd", "mtd", "qtd"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
                  period === p ? "bg-white shadow-sm text-ink" : "text-ink-quiet hover:text-ink"
                }`}
              >
                {p === "today" ? "Today" : p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Smart Alerts ── */}
      {alerts.length > 0 && (
        <div className="space-y-2 mb-6">
          {alerts.map((a, i) => (
            <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-[13px] font-medium ${
              a.type === "error" ? "bg-[#ffebee] border-[#ef9a9a] text-[#b71c1c]"
              : a.type === "warn" ? "bg-[#fff8e1] border-[#ffe082] text-[#5d3a00]"
              : "bg-[#e8f4fd] border-[#90caf9] text-[#0d47a1]"
            }`}>
              {a.type === "error" ? <TriangleAlert className="w-4 h-4 flex-shrink-0" />
                : a.type === "warn" ? <AlertCircle className="w-4 h-4 flex-shrink-0" />
                : <CheckCircle2 className="w-4 h-4 flex-shrink-0" />}
              <span className="flex-1">{a.text}</span>
              <Link to={a.link} className="flex items-center gap-0.5 underline underline-offset-2 hover:opacity-75 flex-shrink-0">
                View <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* ── Pipeline Strip ── */}
      <div className="bg-white rounded-xl border border-paper-deep mb-6 overflow-hidden">
        <div className="px-5 py-3 border-b border-paper-deep bg-paper-warm">
          <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide">Revenue Pipeline</p>
        </div>
        <div className="grid grid-cols-4 divide-x divide-paper-deep">
          {([
            { label: "Pending Estimates", count: pendingEstimates.length, value: quotedValue, color: "text-[#e65100]", link: "/estimates" },
            { label: "Jobs Scheduled", count: scheduledJobs.length, value: null, color: "text-[#1565c0]", link: "/jobs" },
            { label: "Awaiting Payment", count: unpaidInvoices.length, value: unpaidValue, color: "text-[#f57c00]", link: "/invoices" },
            { label: `Collected (${PERIOD_LABELS[period]})`, count: periodPaid.length, value: revenue, color: "text-[#2e7d32]", link: "/invoices" },
          ] as const).map((stage) => (
            <Link key={stage.label} to={stage.link} className="px-5 py-4 hover:bg-paper-warm transition-colors">
              <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide mb-1 truncate">{stage.label}</p>
              <p className={`text-[26px] font-bold leading-none ${stage.color}`}>{stage.count}</p>
              {stage.value !== null && (
                <p className="text-[13px] text-ink-quiet mt-1">{fmt$(stage.value)}</p>
              )}
            </Link>
          ))}
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Revenue Collected" value={fmt$(revenue)} sub={PERIOD_LABELS[period]} icon={DollarSign} accent="bg-[#e8f5e9]" trend={revTrend} />
        <KpiCard label="Jobs Completed" value={completedJobs.length} sub={PERIOD_LABELS[period]} icon={Briefcase} accent="bg-[#e3f2fd]" trend={jobsTrend} />
        <KpiCard label="Avg Job Size" value={avgJobSize > 0 ? fmt$(avgJobSize) : "—"} sub="revenue ÷ completed jobs" icon={TrendingUp} accent="bg-[#f3e5f5]" />
        <KpiCard label="New Jobs Booked" value={newJobsBooked} sub={PERIOD_LABELS[period]} icon={Clock} accent="bg-[#fff3e0]" />
      </div>

      {/* ── Financial Health Strip ── */}
      {(() => {
        const allPaidInvoices = invoices.filter((i: any) => i.status === "paid");
        const totalRevenue = allPaidInvoices.reduce((s: number, i: any) => s + (i.total ?? 0), 0);
        const totalExpensesAll = expenses.reduce((s: number, e: any) => s + (e.amount ?? 0), 0);
        const allGrossProfit = totalRevenue - totalExpensesAll;
        const overallMargin = totalRevenue > 0 ? Math.round((allGrossProfit / totalRevenue) * 100) : null;
        const allPaidCount = allPaidInvoices.length;
        const allAvgTicket = allPaidCount > 0 ? Math.round(totalRevenue / allPaidCount) : 0;
        const highestService = Object.entries(serviceStats).sort(([, a], [, b]) => (b.revenue / Math.max(1, b.count)) - (a.revenue / Math.max(1, a.count)))[0];
        return (
          <div className="bg-white rounded-xl border border-paper-deep mb-6 overflow-hidden">
            <div className="px-5 py-3 border-b border-paper-deep bg-paper-warm">
              <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide">Financial Health</p>
            </div>
            <div className="grid grid-cols-4 divide-x divide-paper-deep">
              <div className="px-5 py-4">
                <p className="text-[11px] text-ink-quiet font-medium mb-1 uppercase tracking-wide">Gross Margin</p>
                <p className={`text-[24px] font-bold leading-none ${
                  overallMargin === null ? "text-ink-quiet"
                  : overallMargin >= 50 ? "text-[#2e7d32]"
                  : overallMargin >= 20 ? "text-[#e65100]"
                  : "text-[#c62828]"
                }`}>
                  {overallMargin !== null ? `${overallMargin}%` : "—"}
                </p>
                <p className="text-[11px] text-ink-quiet mt-1">all-time</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-[11px] text-ink-quiet font-medium mb-1 uppercase tracking-wide">Avg Ticket</p>
                <p className="text-[24px] font-bold leading-none text-ink">{allAvgTicket > 0 ? fmt$(allAvgTicket) : "—"}</p>
                <p className="text-[11px] text-ink-quiet mt-1">{allPaidCount} paid jobs</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-[11px] text-ink-quiet font-medium mb-1 uppercase tracking-wide">Gross Profit</p>
                <p className={`text-[24px] font-bold leading-none ${allGrossProfit >= 0 ? "text-[#1565c0]" : "text-[#c62828]"}`}>
                  {allGrossProfit < 0 ? "-" : ""}{fmt$(Math.abs(allGrossProfit))}
                </p>
                <p className="text-[11px] text-ink-quiet mt-1">revenue minus expenses</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-[11px] text-ink-quiet font-medium mb-1 uppercase tracking-wide">Top Service</p>
                {highestService ? (
                  <>
                    <p className="text-[14px] font-bold text-ink leading-tight">{serviceLabel(highestService[0], services)}</p>
                    <p className="text-[11px] text-ink-quiet mt-1">{fmt$(Math.round(highestService[1].revenue / Math.max(1, highestService[1].count)))} avg ticket</p>
                  </>
                ) : (
                  <p className="text-[24px] font-bold text-ink-quiet">—</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Profit & Loss ── */}
      <div className="bg-white rounded-xl border border-paper-deep mb-6 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-paper-deep bg-paper-warm">
          <p className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
            <Wallet className="w-4 h-4 text-ink-quiet" /> Profit & Loss — {PERIOD_LABELS[period]}
          </p>
          <Link to="/expenses" className="text-[12px] text-accent hover:underline flex items-center gap-0.5">
            Manage expenses <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Top row: Revenue / Expenses / Gross Profit */}
        <div className="grid grid-cols-3 divide-x divide-paper-deep border-b border-paper-deep">
          {[
            { label: "Revenue", value: revenue, color: "text-[#2e7d32]", sub: "paid invoices" },
            { label: "Expenses", value: totalExpenses, color: "text-[#c62828]", sub: `${periodExpenses.length} entries` },
            {
              label: "Gross Profit",
              value: grossProfit,
              color: grossProfit >= 0 ? "text-[#1565c0]" : "text-[#c62828]",
              sub: `${marginPct}% margin`,
            },
          ].map((item) => (
            <div key={item.label} className="px-6 py-4">
              <p className="text-[12px] font-semibold text-ink-quiet uppercase tracking-wide mb-1">{item.label}</p>
              <p className={`text-[26px] font-bold leading-none ${item.color}`}>
                {item.value < 0 ? "-" : ""}{fmt$(Math.abs(item.value))}
              </p>
              <p className="text-[12px] text-ink-quiet mt-1">{item.sub}</p>
            </div>
          ))}
        </div>

        {/* Margin bar */}
        <div className="px-6 py-4 border-b border-paper-deep">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-semibold text-ink-quiet uppercase tracking-wide">Profit Margin</p>
            <p className={`text-[13px] font-bold ${marginPct >= 0 ? "text-[#2e7d32]" : "text-[#c62828]"}`}>{marginPct}%</p>
          </div>
          <div className="w-full h-3 bg-paper-dark rounded-full overflow-hidden flex">
            {revenue > 0 && (
              <>
                <div
                  className="h-full bg-[#ef9a9a] rounded-l-full transition-all"
                  style={{ width: `${Math.min(100, Math.round((totalExpenses / revenue) * 100))}%` }}
                  title="Expenses"
                />
                {grossProfit > 0 && (
                  <div
                    className="h-full bg-[#a5d6a7] transition-all"
                    style={{ width: `${Math.max(0, marginPct)}%` }}
                    title="Profit"
                  />
                )}
              </>
            )}
            {revenue === 0 && <div className="h-full w-full bg-paper-dark rounded-full" />}
          </div>
          <div className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1.5 text-[11px] text-ink-quiet"><span className="w-2.5 h-2.5 rounded-full bg-[#ef9a9a] inline-block" />Expenses</span>
            <span className="flex items-center gap-1.5 text-[11px] text-ink-quiet"><span className="w-2.5 h-2.5 rounded-full bg-[#a5d6a7] inline-block" />Profit</span>
          </div>
        </div>

        {/* Expense breakdown by category */}
        {Object.keys(expensesByCategory).length > 0 ? (
          <div className="px-6 py-4">
            <p className="text-[12px] font-semibold text-ink-quiet uppercase tracking-wide mb-3">Expenses by Category</p>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(expensesByCategory)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, amt]) => {
                  const catDef = EXPENSE_CATEGORIES.find((c) => c.value === cat);
                  const pct = totalExpenses > 0 ? Math.round(((amt as number) / totalExpenses) * 100) : 0;
                  return (
                    <div key={cat} className="flex items-center gap-3 bg-paper-warm rounded-lg px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-ink">{catDef?.label ?? cat}</p>
                        <p className="text-[11px] text-ink-quiet">{pct}% of expenses</p>
                      </div>
                      <p className="text-[14px] font-bold text-ink flex-shrink-0">{fmt$(amt as number)}</p>
                    </div>
                  );
                })}
            </div>
          </div>
        ) : (
          <div className="px-6 py-5 text-[13px] text-ink-quiet">
            No expenses logged for {PERIOD_LABELS[period].toLowerCase()}.{" "}
            <Link to="/expenses" className="text-accent hover:underline">Add expenses →</Link>
          </div>
        )}
      </div>

      {/* ── Today + Goal + Estimate Conversion ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Today's Schedule */}
        <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-paper-deep bg-paper-warm">
            <p className="text-[13px] font-semibold text-ink">Today's Jobs</p>
            <Badge variant={todayJobs.length > 0 ? "default" : "muted"}>{todayJobs.length} scheduled</Badge>
          </div>
          <div className="divide-y divide-paper-deep">
            {todayJobs.length === 0 ? (
              <p className="px-5 py-5 text-[13px] text-ink-quiet">Nothing scheduled today.</p>
            ) : todayJobs.slice(0, 4).map((job: any) => (
              <Link key={job.id} to={`/jobs/${job.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-paper-warm transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-ink truncate">{job.title}</p>
                  <p className="text-[11px] text-ink-quiet">{customerNames[job.customer_id] ?? ""}
                    {job.scheduled_time ? ` · ${job.scheduled_time}` : ""}
                  </p>
                </div>
                <Badge variant={jobStatusBadge(job.status)}>{jobStatusLabel(job.status)}</Badge>
              </Link>
            ))}
          </div>
        </div>

        {/* Monthly Revenue Goal */}
        <div className="bg-white rounded-xl border border-paper-deep p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
              <Target className="w-4 h-4 text-ink-quiet" /> Monthly Goal
            </p>
            <button
              onClick={() => { setGoalInput(monthlyGoal > 0 ? String(monthlyGoal) : ""); setEditingGoal(true); }}
              className="text-[12px] text-accent hover:underline"
            >
              {monthlyGoal > 0 ? "Edit" : "Set goal"}
            </button>
          </div>
          {editingGoal ? (
            <div className="space-y-2">
              <input
                type="number"
                autoFocus
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveGoal(); if (e.key === "Escape") setEditingGoal(false); }}
                placeholder="e.g. 5000"
                className="w-full px-3 py-2 text-[14px] border border-paper-deep rounded-lg focus:outline-none focus:border-ink"
              />
              <div className="flex gap-2">
                <button onClick={saveGoal} className="flex-1 py-1.5 text-[12px] font-semibold bg-ink text-white rounded-lg">Save</button>
                <button onClick={() => setEditingGoal(false)} className="flex-1 py-1.5 text-[12px] border border-paper-deep rounded-lg hover:bg-paper-warm">Cancel</button>
              </div>
            </div>
          ) : monthlyGoal > 0 ? (
            <>
              <div className="flex items-end justify-between mb-3">
                <div>
                  <p className="text-[32px] font-bold text-ink leading-none">{goalPct}%</p>
                  <p className="text-[12px] text-ink-quiet mt-1">{fmt$(mtdRevenue)} of {fmt$(monthlyGoal)}</p>
                </div>
                {goalGap > 0
                  ? <p className="text-[12px] text-ink-quiet text-right leading-snug">{fmt$(goalGap)}<br />to go</p>
                  : <p className="text-[12px] text-[#2e7d32] font-bold">Goal reached! 🎉</p>
                }
              </div>
              <div className="w-full h-3 bg-paper-dark rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    goalPct >= 100 ? "bg-[#43a047]" : goalPct >= 60 ? "bg-[#fb8c00]" : "bg-accent"
                  }`}
                  style={{ width: `${goalPct}%` }}
                />
              </div>
            </>
          ) : (
            <p className="text-[13px] text-ink-quiet mt-1">Set a monthly revenue target to track progress.</p>
          )}
        </div>

        {/* Estimate Conversion */}
        <div className="bg-white rounded-xl border border-paper-deep p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-ink-quiet" /> Estimate Conversion
            </p>
            <Link to="/estimates" className="text-[12px] text-accent hover:underline flex items-center gap-0.5">
              All <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="flex items-end gap-2 mb-4">
            <p className="text-[36px] font-bold text-ink leading-none">{closeRate}%</p>
            <p className="text-[12px] text-ink-quiet mb-1">close rate</p>
          </div>
          <div className="space-y-2">
            {[
              { label: "Sent", count: sentEstimates.length, color: "bg-[#90caf9]" },
              { label: "Won", count: wonEstimates.length, color: "bg-[#a5d6a7]" },
              { label: "Lost", count: lostEstimates.length, color: "bg-[#ef9a9a]" },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-2">
                <span className="text-[11px] text-ink-quiet w-8">{row.label}</span>
                <div className="flex-1 h-2 bg-paper-dark rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${row.color}`}
                    style={{ width: sentEstimates.length > 0 ? `${Math.round((row.count / sentEstimates.length) * 100)}%` : "0%" }}
                  />
                </div>
                <span className="text-[11px] font-semibold text-ink w-4 text-right">{row.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Invoice Aging + Avg by Service Type ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Invoice Aging */}
        <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-paper-deep bg-paper-warm">
            <p className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-ink-quiet" /> Invoice Aging
            </p>
            <Link to="/invoices" className="text-[12px] text-accent hover:underline flex items-center gap-0.5">
              All invoices <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {unpaidInvoices.length === 0 ? (
            <p className="px-5 py-5 text-[13px] text-ink-quiet">No outstanding invoices.</p>
          ) : (
            <div className="divide-y divide-paper-deep">
              {[
                { label: "Under 30 days", items: aging30, dotColor: "#43a047", textColor: "text-[#2e7d32]", bg: "bg-[#e8f5e9] text-[#2e7d32]" },
                { label: "30–60 days", items: aging60, dotColor: "#fb8c00", textColor: "text-[#e65100]", bg: "bg-[#fff3e0] text-[#e65100]" },
                { label: "60+ days overdue", items: aging60plus, dotColor: "#e53935", textColor: "text-[#c62828]", bg: "bg-[#ffebee] text-[#c62828]" },
              ].map((bucket) => (
                <div key={bucket.label} className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: bucket.dotColor }} />
                    <p className="text-[13px] text-ink">{bucket.label}</p>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${bucket.bg}`}>
                      {bucket.items.length}
                    </span>
                  </div>
                  <p className={`text-[14px] font-semibold ${bucket.textColor}`}>
                    {fmt$(bucket.items.reduce((s: number, i: any) => s + (i.total ?? 0), 0))}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Avg Job Value by Service Type */}
        <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
          <div className="px-5 py-3.5 border-b border-paper-deep bg-paper-warm">
            <p className="text-[13px] font-semibold text-ink">Avg Job Value by Service</p>
          </div>
          {Object.keys(serviceStats).length === 0 ? (
            <p className="px-5 py-5 text-[13px] text-ink-quiet">No paid jobs yet to analyze.</p>
          ) : (
            <div className="divide-y divide-paper-deep">
              {Object.entries(serviceStats).map(([type, stats]) => {
                const avg = stats.count > 0 ? Math.round(stats.revenue / stats.count) : 0;
                const maxAvg = Math.max(...Object.values(serviceStats).map((s) => s.count > 0 ? s.revenue / s.count : 0));
                const pct = maxAvg > 0 ? Math.round((avg / maxAvg) * 100) : 0;
                return (
                  <div key={type} className="px-5 py-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[13px] font-medium text-ink">{serviceLabel(type, services)}</p>
                      <p className="text-[13px] font-semibold text-ink">{fmt$(avg)} avg · {stats.count} job{stats.count !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="w-full h-2 bg-paper-dark rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Jobs + Recent Invoices ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl border border-paper-deep">
          <div className="flex items-center justify-between px-5 py-4 border-b border-paper-deep">
            <h2 className="text-[14px] font-semibold text-ink">Recent Jobs</h2>
            <Link to="/jobs" className="text-[13px] text-accent font-medium hover:underline flex items-center gap-1">
              All jobs <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-paper-deep">
            {recentJobs.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-ink-quiet text-center">No jobs yet.</p>
            ) : recentJobs.map((job: any) => (
              <Link key={job.id} to={`/jobs/${job.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-paper-warm transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-ink truncate">{job.title}</p>
                  <p className="text-[12px] text-ink-quiet truncate">
                    {customerNames[job.customer_id] ?? "—"} · {serviceLabel(job.service_type, services)}
                  </p>
                </div>
                <Badge variant={jobStatusBadge(job.status)}>{jobStatusLabel(job.status)}</Badge>
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-paper-deep">
          <div className="flex items-center justify-between px-5 py-4 border-b border-paper-deep">
            <h2 className="text-[14px] font-semibold text-ink">Recent Invoices</h2>
            <Link to="/invoices" className="text-[13px] text-accent font-medium hover:underline flex items-center gap-1">
              All invoices <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-paper-deep">
            {recentInvoices.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-ink-quiet text-center">No invoices yet.</p>
            ) : recentInvoices.map((inv: any) => (
              <Link key={inv.id} to={`/invoices/${inv.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-paper-warm transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-ink truncate">{customerNames[inv.customer_id] ?? "—"}</p>
                  <p className="text-[12px] text-ink-quiet">
                    {fmt$(inv.total ?? 0)} · {inv.sent_at ? `Sent ${inv.sent_at.split("T")[0]}` : "Draft"}
                  </p>
                </div>
                <Badge variant={invStatusBadge(inv.status)}>{invoiceStatusLabel(inv.status)}</Badge>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── Customers summary ── */}
      <div className="bg-white rounded-xl border border-paper-deep">
        <div className="flex items-center justify-between px-5 py-4 border-b border-paper-deep">
          <h2 className="text-[14px] font-semibold text-ink flex items-center gap-1.5">
            <Users className="w-4 h-4 text-ink-quiet" /> Customers
          </h2>
          <Link to="/customers" className="text-[13px] text-accent font-medium hover:underline flex items-center gap-1">
            All customers <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="flex items-center divide-x divide-paper-deep">
          {[
            { label: "Total customers", value: customers.filter((c: any) => !c.archived).length },
            { label: "Jobs scheduled", value: scheduledJobs.length },
            { label: "Pending estimates", value: pendingEstimates.length },
            { label: "Unpaid invoices", value: unpaidInvoices.length },
          ].map(({ label, value }) => (
            <div key={label} className="flex-1 px-5 py-4 text-center">
              <p className="text-[22px] font-semibold text-ink">{value}</p>
              <p className="text-[12px] text-ink-quiet mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
