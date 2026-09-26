import { buildFinancialReport, reportDate, cashMovements } from "@/lib/reporting";
import { loadReportRows } from "@/lib/reportData";
import { useRef } from "react";
import { sumMoney } from "@/lib/money";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Receipt, ChevronRight, Loader2 } from "lucide-react";

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
  const [refunds, setRefunds] = useState<any[]>([]);
  const [timeEntries, setTimeEntries] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const { business } = useAuth();
  const businessId = business?.id ?? "";

  const loadVersion = useRef(0);
  useEffect(() => { load(); return () => { loadVersion.current++; }; }, [businessId]);

  async function load() {
    const version = ++loadVersion.current;
    setLoading(true); setLoadError(null);
    if (!businessId) { setLoading(false); return; }
    const [invRes, jobRes, expRes, custRes, pmtRes, refundRes, timeRes] = await Promise.all([
      loadReportRows("invoices", "*", businessId),
      loadReportRows("jobs", "id, title, customer_id, status, service_type, price, scheduled_date, created_at, labor_cost_source", businessId),
      loadReportRows("expenses", "*", businessId),
      loadReportRows("customers", "id, name", businessId),
      loadReportRows("invoice_payments", "*", businessId),
      loadReportRows("invoice_refunds", "*", businessId),
      loadReportRows("time_entries", "*", businessId),
    ]);
    if (version !== loadVersion.current) return;
    const error = [invRes, jobRes, expRes, custRes, pmtRes, refundRes, timeRes].find((r) => r.error)?.error;
    if (error) { setLoadError(error.message); setLoading(false); return; }
    setPayments(pmtRes.data ?? []);
    setRefunds(refundRes.data ?? []);
    setTimeEntries(timeRes.data ?? []);
    if (invRes.data) setInvoices(invRes.data);
    if (jobRes.data) setJobs(jobRes.data);
    if (expRes.data) setExpenses(expRes.data);
    if (custRes.data) setCustomers(custRes.data);
    setLoading(false);
  }

  const custMap: Record<string, string> = {};
  customers.forEach((c) => { custMap[c.id] = c.name; });

  const invoiceMap = new Map(invoices.map((i) => [i.id, i]));

  const movements = cashMovements(payments, refunds);
  const report = buildFinancialReport(invoices, payments, expenses, jobs, year, undefined, { refunds, timeEntries });
  const monthlyData = report.monthly.map((month, index) => ({ label: MONTHS_SHORT[index], ...month }));
  const yearRevenue = report.revenue;
  const yearExpenses = report.expenses;
  const yearProfit = report.cash;

  // ── Prior year comparison ──
  const prevYear = year - 1;
  const prevYearRevenue = sumMoney(movements.filter((p) => reportDate(p.paid_at).startsWith(String(prevYear))), (p) => Number(p.amount));
  const revTrend = trendPct(yearRevenue, prevYearRevenue);

  // ── Top customers by revenue ──
  const custRevenue: Record<string, number> = {};
  movements.filter((p) => reportDate(p.paid_at).startsWith(String(year))).forEach((p) => {
    const customerId = invoiceMap.get(p.invoice_id)?.customer_id;
    if (customerId) custRevenue[customerId] = ((Math.round((custRevenue[customerId] ?? 0) * 100)) + Math.round(Number(p.amount) * 100)) / 100;
  });
  const topCustomers = Object.entries(custRevenue)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([id, rev]) => ({ id, name: custMap[id] ?? "Unknown", revenue: rev }));

  // ── Monthly job count ──
  const monthlyJobs = MONTHS_SHORT.map((label, mi) => {
    const monthStr = `${year}-${String(mi + 1).padStart(2, "0")}`;
    const count = jobs.filter((j) => j.created_at?.startsWith(monthStr)).length;
    return { label, count };
  });

  // ── Cumulative revenue line ──
  let running = 0;
  const cumulativeData = monthlyData.map((m) => {
    running = (Math.round(running * 100) + Math.round(m.revenue * 100)) / 100;
    return { label: m.label, cumulative: running };
  });

  const availableYears = Array.from(
    new Set([...movements.map((p) => reportDate(p.paid_at).slice(0, 4)), ...expenses.map((e) => e.date?.slice(0, 4)), ...jobs.map((j) => j.created_at?.slice(0, 4))].filter(Boolean))
  ).sort().reverse() as string[];
  if (!availableYears.includes(String(year))) availableYears.unshift(String(year));

  if (!businessId) return <div className="p-8 text-ink-soft">Select a business to view its financial reports.</div>;
  if (loading) return <div className="p-8 text-ink-soft" role="status">Loading financial reports…</div>;
  if (loadError) return <div className="p-8"><h1 className="text-xl font-semibold">Revenue</h1><p role="alert">Could not load financial data: {loadError}</p><button onClick={load}>Retry</button></div>;

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-7">
        <div>
          <h1 className="text-[22px] font-semibold text-ink flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-ink-quiet" /> Revenue
            {loading && <Loader2 className="w-4 h-4 animate-spin text-ink-quiet" />}
          </h1>
          <p className="text-[14px] text-ink-quiet mt-1">Recorded payments less refunds, and expenses for the selected year. Dates use UTC.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          {
            label: "Net Payments Received", value: fmt$full(yearRevenue),
            sub: prevYearRevenue > 0 ? `${revTrend !== null ? (revTrend >= 0 ? "↑" : "↓") + Math.abs(revTrend) + "% vs " + prevYear : ""}` : "",
            icon: DollarSign, color: "bg-[#e8f5e9]",
            trend: revTrend,
          },
          { label: "Total Expenses", value: fmt$full(yearExpenses), sub: `${expenses.filter((e) => (e.date ?? "").startsWith(String(year))).length} entries`, icon: Receipt, color: "bg-[#ffebee]", trend: null },
          {
            label: "Net Cash Flow", value: fmt$full(yearProfit),
            sub: yearRevenue > 0 ? `${Math.round((yearProfit / yearRevenue) * 100)}% cash margin` : "—",
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

      <section className="bg-white rounded-xl border border-paper-deep p-5 mb-5">
        <h2 className="text-[14px] font-semibold text-ink">Invoice reconciliation — all time</h2>
        <p className="text-[12px] text-ink-quiet mt-1">Issued invoices after refund credits. Received amounts are net of refunds. Refund credits leave the original unpaid balance unchanged. Draft and voided invoices are excluded.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          {[["Billed", report.billed], ["Received", report.collected], ["Outstanding", report.outstanding], ["Overdue", report.overdue]].map(([label, value]) => (
            <div key={label}><p className="text-[12px] text-ink-quiet">{label}</p><p className="text-lg font-semibold text-ink">{fmt$full(Number(value))}</p></div>
          ))}
        </div>
        {(report.ledgerMismatches > 0 || report.orphanPayments > 0 || report.invalidPayments > 0 || report.refundMismatches > 0 || report.orphanRefunds > 0) ?
          <p role="alert" className="mt-4 text-sm text-red-700">Needs review: {report.ledgerMismatches} invoice balance mismatches, {report.orphanPayments} payments without a visible invoice, and {report.invalidPayments} invoices with unexpected payments, {report.refundMismatches} refund balance mismatches, and {report.orphanRefunds} refunds missing their payment. Refresh to confirm before relying on these totals.</p> :
          <p className="mt-4 text-[12px] text-ink-quiet">Invoice payment and refund balances match the records loaded for this report.</p>}
      </section>
      <section className="bg-white rounded-xl border border-paper-deep p-5 mb-5">
        <h2 className="text-[14px] font-semibold text-ink">Job profitability — all time</h2>
        <p className="text-[12px] text-ink-quiet mt-1">Estimated profit uses net billed revenue less direct expenses, the selected labor cost source, and monthly shared overhead. Overhead is allocated by recorded job hours after breaks. Cash contribution uses net payments less logged expenses; automatic labor and allocated overhead are not deducted again from cash.</p>
        <p className="text-[12px] text-ink-quiet mt-2">Still outside the job totals: {fmt$full(report.unassignedExpenses)} in expenses and {fmt$full(report.unassignedBilled)} billed without a matching job.</p>
        <p className="text-[12px] text-ink-quiet mt-2">Shared overhead allocated: {fmt$full(report.allocatedOverhead)}. Awaiting job hours: {fmt$full(report.unallocatedOverhead)}. Refunds recorded in {year}: {fmt$full(report.refunds)}.</p>
        {(report.laborIssues > 0 || report.missingRateRows > 0 || report.unassignedShifts > 0) && <p className="text-sm text-ink-soft mt-2">Time to review: {report.laborIssues} open/overlapping or invalid job entries, {report.missingRateRows} job-month entries without a saved hourly rate, and {report.unassignedShifts} shift entries without a job assignment. Shift entries alone do not allocate job hours.</p>}
        <p className="text-[12px] text-ink-quiet mt-2">Open a job to record actual time and choose automatic or logged labor costs. Add shared costs under Expenses → Overhead with no job selected. No hours or costs are assumed for missing records.</p>
        {report.jobRows.length === 0 ? <p className="text-sm text-ink-quiet mt-4">No issued invoices or expenses linked to jobs yet.</p> :
          <div className="overflow-x-auto mt-4"><table className="w-full text-[13px] text-left whitespace-nowrap">
            <thead className="text-ink-quiet border-b border-paper-deep"><tr>{["Job", "Net billed", "Net received", "Job hours", "Labor", "Overhead", "Total costs", "Est. profit", "Cash contribution"].map(label => <th key={label} className="p-2 font-medium">{label}</th>)}</tr></thead>
            <tbody>{report.jobRows.map(job => <tr key={job.id} className="border-b border-paper-deep">
              <td className="p-2"><Link className="text-accent hover:underline" to={`/jobs/${job.id}`}>{job.title}</Link></td>
              {[job.billed, job.collected].map((value, index) => <td key={index} className="p-2 tabular-nums">{fmt$full(value)}</td>)}
              <td className="p-2 tabular-nums">{job.hours.toFixed(2)}</td>
              {[job.laborCost,job.overhead,job.costs].map((value,index)=><td key={index} className="p-2 tabular-nums">{fmt$full(value)}</td>)}
              <td className="p-2">{job.incomplete?'Needs review':fmt$full(job.contribution)}</td><td className="p-2 tabular-nums">{fmt$full(job.cash)}</td>
            </tr>)}</tbody>
          </table></div>}
      </section>

      {/* ── Revenue vs Expenses bar chart ── */}
      <div className="bg-white rounded-xl border border-paper-deep p-5 mb-5">
        <p className="text-[14px] font-semibold text-ink mb-4">Monthly Net Receipts vs Expenses — {year}</p>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        {/* ── Cumulative revenue line ── */}
        <div className="bg-white rounded-xl border border-paper-deep p-5">
          <p className="text-[14px] font-semibold text-ink mb-4">Cumulative Net Receipts — {year}</p>
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
            <p className="text-[13px] font-semibold text-ink">Top Customers by Net Receipts</p>
            <Link to="/customers" className="text-[12px] text-accent hover:underline flex items-center gap-0.5">
              All customers <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-paper-deep">
            {topCustomers.map(({ id, name, revenue }, i) => {
              const maxRev = topCustomers[0].revenue;
              const pct = maxRev > 0 ? Math.max(0, Math.min(100, Math.round((revenue / maxRev) * 100))) : 0;
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
