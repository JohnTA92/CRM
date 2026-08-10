import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Briefcase, Receipt, ChevronRight, Loader2 } from "lucide-react";

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmt$(n: number) {
  if (n >= 1000) return "$" + (n / 1000).toFixed(1) + "k";
  return "$" + Math.round(n).toLocaleString();
}

function fmt$full(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function trendPct(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

export function RevenuePage() {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const { business } = useAuth();
  const businessId = business?.id ?? "";

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [invRes, jobRes, expRes, custRes] = await Promise.all([
      supabase.from("invoices").select("*").eq("business_id", businessId),
      supabase.from("jobs").select("id, title, customer_id, status, service_type, price, created_at").eq("business_id", businessId),
      supabase.from("expenses").select("*").eq("business_id", businessId),
      supabase.from("customers").select("id, name").eq("business_id", businessId),
    ]);
    if (invRes.data) setInvoices(invRes.data);
    if (jobRes.data) setJobs(jobRes.data);
    if (expRes.data) setExpenses(expRes.data);
    if (custRes.data) setCustomers(custRes.data);
    setLoading(false);
  }

  const custMap: Record<string, string> = {};
  customers.forEach((c) => { custMap[c.id] = c.name; });

  const paidInvoices = invoices.filter((i) => i.status === "paid");

  // ── Monthly revenue for selected year ──
  const monthlyData = MONTHS_SHORT.map((label, mi) => {
    const monthStr = `${year}-${String(mi + 1).padStart(2, "0")}`;
    const rev = paidInvoices
      .filter((i) => (i.paid_at ?? i.created_at)?.startsWith(monthStr))
      .reduce((s: number, i: any) => s + (i.total ?? 0), 0);
    const exp = expenses
      .filter((e) => (e.date ?? "").startsWith(monthStr))
      .reduce((s: number, e: any) => s + (e.amount ?? 0), 0);
    return { label, revenue: rev, expenses: exp, profit: rev - exp };
  });

  // ── Year totals ──
  const yearRevenue = monthlyData.reduce((s, m) => s + m.revenue, 0);
  const yearExpenses = monthlyData.reduce((s, m) => s + m.expenses, 0);
  const yearProfit = yearRevenue - yearExpenses;

  // ── Prior year comparison ──
  const prevYear = year - 1;
  const prevYearRevenue = paidInvoices
    .filter((i) => (i.paid_at ?? i.created_at)?.startsWith(String(prevYear)))
    .reduce((s: number, i: any) => s + (i.total ?? 0), 0);
  const revTrend = trendPct(yearRevenue, prevYearRevenue);

  // ── Top customers by revenue ──
  const custRevenue: Record<string, number> = {};
  paidInvoices.forEach((inv) => {
    if (inv.customer_id) {
      custRevenue[inv.customer_id] = (custRevenue[inv.customer_id] ?? 0) + (inv.total ?? 0);
    }
  });
  const topCustomers = Object.entries(custRevenue)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([id, rev]) => ({ id, name: custMap[id] ?? "Unknown", revenue: rev }));

  // ── Monthly job count ──
  const monthlyJobs = MONTHS_SHORT.map((label, mi) => {
    const monthStr = `${year}-${String(mi + 1).padStart(2, "0")}`;
    const count = jobs.filter((j) => ["complete","invoiced"].includes(j.status) && (j.scheduled_date ?? j.created_at)?.startsWith(monthStr)).length;
    return { label, count };
  });

  // ── Cumulative revenue line ──
  let running = 0;
  const cumulativeData = monthlyData.map((m) => {
    running += m.revenue;
    return { label: m.label, cumulative: running };
  });

  const availableYears = Array.from(
    new Set(paidInvoices.map((i) => (i.paid_at ?? i.created_at)?.slice(0, 4)).filter(Boolean))
  ).sort().reverse() as string[];
  if (!availableYears.includes(String(year))) availableYears.unshift(String(year));

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-[22px] font-semibold text-ink flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-ink-quiet" /> Revenue
            {loading && <Loader2 className="w-4 h-4 animate-spin text-ink-quiet" />}
          </h1>
          <p className="text-[14px] text-ink-quiet mt-1">Track income, expenses, and profit over time</p>
        </div>
        <div className="flex items-center gap-2">
          {availableYears.map((y) => (
            <button
              key={y}
              onClick={() => setYear(Number(y))}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors border ${
                Number(y) === year ? "bg-ink text-white border-ink" : "bg-white border-paper-deep text-ink-soft hover:bg-paper-warm"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* ── Year KPIs ── */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          {
            label: "Total Revenue", value: fmt$full(yearRevenue),
            sub: prevYearRevenue > 0 ? `${revTrend !== null ? (revTrend >= 0 ? "↑" : "↓") + Math.abs(revTrend) + "% vs " + prevYear : ""}` : "",
            icon: DollarSign, color: "bg-[#e8f5e9]",
            trend: revTrend,
          },
          { label: "Total Expenses", value: fmt$full(yearExpenses), sub: `${expenses.filter((e) => (e.date ?? "").startsWith(String(year))).length} entries`, icon: Receipt, color: "bg-[#ffebee]", trend: null },
          {
            label: "Gross Profit", value: fmt$full(yearProfit),
            sub: yearRevenue > 0 ? `${Math.round((yearProfit / yearRevenue) * 100)}% margin` : "—",
            icon: TrendingUp, color: yearProfit >= 0 ? "bg-[#e3f2fd]" : "bg-[#ffebee]", trend: null,
          },
        ].map(({ label, value, sub, icon: Icon, color, trend }) => (
          <div key={label} className="bg-white rounded-xl border border-paper-deep p-5 flex items-start gap-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
              <Icon className="w-5 h-5 text-ink-soft" />
            </div>
            <div>
              <p className="text-[13px] text-ink-quiet font-medium">{label}</p>
              <p className="text-[22px] font-bold text-ink leading-tight mt-0.5">{value}</p>
              <div className="flex items-center gap-2 mt-1">
                {sub && <p className="text-[12px] text-ink-quiet">{sub}</p>}
                {trend !== null && trend !== undefined && (
                  <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                    trend >= 0 ? "bg-[#e8f5e9] text-[#2e7d32]" : "bg-[#ffebee] text-[#c62828]"
                  }`}>
                    {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {Math.abs(trend)}%
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Revenue vs Expenses bar chart ── */}
      <div className="bg-white rounded-xl border border-paper-deep p-5 mb-5">
        <p className="text-[14px] font-semibold text-ink mb-4">Monthly Revenue vs Expenses — {year}</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthlyData} barGap={4} barCategoryGap="30%">
            <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v) => fmt$(v)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
            <Tooltip
              formatter={(v: number, name: string) => [fmt$full(v), name === "revenue" ? "Revenue" : name === "expenses" ? "Expenses" : "Profit"]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <Bar dataKey="revenue" fill="#a5d6a7" radius={[4, 4, 0, 0]} name="revenue" />
            <Bar dataKey="expenses" fill="#ef9a9a" radius={[4, 4, 0, 0]} name="expenses" />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-2 justify-center">
          <span className="flex items-center gap-1.5 text-[11px] text-ink-quiet"><span className="w-3 h-3 rounded-sm bg-[#a5d6a7] inline-block" />Revenue</span>
          <span className="flex items-center gap-1.5 text-[11px] text-ink-quiet"><span className="w-3 h-3 rounded-sm bg-[#ef9a9a] inline-block" />Expenses</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5 mb-5">
        {/* ── Cumulative revenue line ── */}
        <div className="bg-white rounded-xl border border-paper-deep p-5">
          <p className="text-[14px] font-semibold text-ink mb-4">Cumulative Revenue — {year}</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={cumulativeData}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => fmt$(v)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <Tooltip formatter={(v: number) => [fmt$full(v), "Cumulative"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
              <Line type="monotone" dataKey="cumulative" stroke="#1565c0" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* ── Monthly jobs bar ── */}
        <div className="bg-white rounded-xl border border-paper-deep p-5">
          <p className="text-[14px] font-semibold text-ink mb-4">Jobs Created per Month — {year}</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={monthlyJobs} barCategoryGap="35%">
              <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={25} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
              <Bar dataKey="count" fill="#90caf9" radius={[4, 4, 0, 0]} name="Jobs" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Top Customers ── */}
      {topCustomers.length > 0 && (
        <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-paper-deep bg-paper-warm">
            <p className="text-[13px] font-semibold text-ink">Top Customers by Revenue</p>
            <Link to="/customers" className="text-[12px] text-accent hover:underline flex items-center gap-0.5">
              All customers <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-paper-deep">
            {topCustomers.map(({ id, name, revenue }, i) => {
              const maxRev = topCustomers[0].revenue;
              const pct = maxRev > 0 ? Math.round((revenue / maxRev) * 100) : 0;
              return (
                <Link key={id} to={`/customers/${id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-paper-warm transition-colors">
                  <span className="text-[12px] font-bold text-ink-quiet w-5 flex-shrink-0">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-ink truncate">{name}</p>
                    <div className="w-full h-1.5 bg-paper-dark rounded-full overflow-hidden mt-1.5">
                      <div className="h-full bg-moss rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <p className="text-[14px] font-semibold text-ink flex-shrink-0">{fmt$full(revenue)}</p>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
