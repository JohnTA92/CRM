import { calculateLabor, allocateOverhead, type CostTime } from "./jobCosting.ts";
import { sumMoney } from './money.ts';

type Amount = number | string;
export type ReportInvoice = { id: string; customer_id?: string; job_id?: string | null; status: string; total: Amount; paid_total: Amount; refunded_total?: Amount; due_at?: string | null };
export type ReportPayment = { id: string; invoice_id: string; amount: Amount; paid_at: string };
export type ReportExpense = { id: string; job_id?: string | null; amount: Amount; date: string; category?: string };
export type ReportJob = { id: string; title: string; created_at: string; labor_cost_source?: string };
export type ReportRefund = { id: string; invoice_id: string; payment_id: string; amount: Amount; refunded_at: string };
export const cashMovements = (payments: ReportPayment[], refunds: ReportRefund[]) => [...payments, ...refunds.map(r => ({ ...r, paid_at: r.refunded_at, amount: -Number(r.amount) }))];
const cents = (value: Amount) => Math.round(Number(value) * 100);
const total = <T>(rows: T[], amount: (row: T) => Amount) => sumMoney(rows, row => Number(amount(row)));
const difference = (a: number, b: number) => (cents(a) - cents(b)) / 100;
const issued = (invoice: ReportInvoice) => ['sent', 'overdue', 'paid'].includes(invoice.status);

// Timestamps use UTC consistently; expense dates are calendar dates entered by staff.
export function reportDate(value: string): string {
  return value.includes('T') ? new Date(value).toISOString().slice(0, 10) : value.slice(0, 10);
}

export function buildFinancialReport(invoices: ReportInvoice[], payments: ReportPayment[], expenses: ReportExpense[], jobs: ReportJob[], year: number, today = new Date().toISOString().slice(0, 10), options: { refunds?: ReportRefund[]; timeEntries?: CostTime[] } = {}) {
  const inYear = (value: string) => reportDate(value).startsWith(`${year}-`);
  const refunds = options.refunds ?? [];
  const movements = cashMovements(payments, refunds);
  const yearPayments = movements.filter(p => inYear(p.paid_at));
  const yearExpenses = expenses.filter(e => inYear(e.date));
  const monthly = Array.from({ length: 12 }, (_, month) => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const revenue = total(yearPayments.filter(p => reportDate(p.paid_at).startsWith(prefix)), p => p.amount);
    const costs = total(yearExpenses.filter(e => e.date.startsWith(prefix)), e => e.amount);
    return { revenue, expenses: costs, profit: difference(revenue, costs) };
  });
  const ledger = new Map<string, number>();
  for (const payment of payments) ledger.set(payment.invoice_id, (ledger.get(payment.invoice_id) ?? 0) + cents(payment.amount));
  const refunded = new Map<string, number>();
  for (const refund of refunds) refunded.set(refund.invoice_id, (refunded.get(refund.invoice_id) ?? 0) + cents(refund.amount));
  const balances = invoices.filter(issued).map(invoice => ({
    invoice,
    paid: ((ledger.get(invoice.id) ?? 0) - (refunded.get(invoice.id) ?? 0)) / 100,
    netBilled: (cents(invoice.total) - (refunded.get(invoice.id) ?? 0)) / 100,
    outstanding: Math.max(0, cents(invoice.total) - (ledger.get(invoice.id) ?? 0)) / 100,
  }));
  const labor = calculateLabor(options.timeEntries ?? []);
  const overheadByMonth = new Map<string, number>();
  const allocated = new Map<string, number>();
  let unallocatedOverhead = 0;
  for (const expense of expenses.filter(e => e.category === 'overhead' && !e.job_id)) {
    const month=expense.date.slice(0,7);
    overheadByMonth.set(month,(overheadByMonth.get(month) ?? 0)+cents(expense.amount));
  }
  for (const [month, overhead] of overheadByMonth) {
    const weights=new Map<string,number>();
    for (const row of labor.months.filter(l=>l.month===month && jobs.some(j=>j.id===l.jobId))) weights.set(row.jobId,(weights.get(row.jobId)??0)+row.milliseconds);
    const shares=allocateOverhead(overhead,weights);
    if (!shares.size) unallocatedOverhead+=overhead;
    for (const [jobId,share] of shares) allocated.set(jobId,(allocated.get(jobId)??0)+share);
  }
  const jobRows = jobs.map(job => {
    const jobInvoices = invoices.filter(i => i.job_id === job.id && issued(i));
    const invoiceIds = new Set(jobInvoices.map(i => i.id));
    const jobRefunds = total(refunds.filter(r=>invoiceIds.has(r.invoice_id)),r=>r.amount);
    const billed = difference(total(jobInvoices, i => i.total),jobRefunds);
    const collected = total(movements.filter(p => invoiceIds.has(p.invoice_id)), p => p.amount);
    const jobExpenses = expenses.filter(e=>e.job_id===job.id);
    const cashCosts = total(jobExpenses,e=>e.amount);
    const recordedLabor = total(jobExpenses.filter(e=>e.category==='labor'),e=>e.amount);
    const jobLabor = labor.months.filter(l=>l.jobId===job.id);
    const automaticLabor = jobLabor.reduce((sum,l)=>sum+l.costCents,0)/100;
    const fromTime = job.labor_cost_source !== 'expenses';
    const laborCost = fromTime ? automaticLabor : recordedLabor;
    const overhead = (allocated.get(job.id)??0)/100;
    const costs = (cents(cashCosts)-cents(recordedLabor)+cents(laborCost)+cents(overhead))/100;
    const incomplete = fromTime && (jobLabor.some(l=>l.missingRate) || labor.issueJobs.has(job.id) || ((recordedLabor>0 || billed!==0 || cashCosts!==0) && jobLabor.length===0));
    return { ...job, billed, collected, costs, cashCosts, laborCost, automaticLabor, recordedLabor, overhead,
      hours:jobLabor.reduce((sum,l)=>sum+l.milliseconds,0)/3600000, incomplete,
      contribution: difference(billed, costs), cash: difference(collected, cashCosts) };
  }).filter(j => j.billed !== 0 || j.collected !== 0 || j.costs !== 0 || j.cashCosts !== 0 || j.hours>0 || j.incomplete);
  const knownInvoices = new Set(invoices.map(i => i.id));
  const knownJobs = new Set(jobs.map(j => j.id));
  return {
    monthly,
    refunds: total(refunds.filter(r=>inYear(r.refunded_at)),r=>r.amount),
    grossReceipts: total(payments.filter(p=>inYear(p.paid_at)),p=>p.amount),
    refundedAll: total(refunds,r=>r.amount),
    unallocatedOverhead: unallocatedOverhead/100,
    allocatedOverhead: [...allocated.values()].reduce((sum,value)=>sum+value,0)/100,
    laborIssues: labor.issues,
    unassignedShifts: labor.unassignedShifts,
    missingRateRows: labor.months.filter(l=>l.missingRate).length,
    revenue: total(yearPayments, p => p.amount),
    expenses: total(yearExpenses, e => e.amount),
    cash: difference(total(yearPayments, p => p.amount), total(yearExpenses, e => e.amount)),
    billed: total(balances, b => b.netBilled),
    collected: total(balances, b => b.paid),
    outstanding: total(balances, b => b.outstanding),
    overdue: total(balances.filter(b => b.invoice.due_at && reportDate(b.invoice.due_at) < today), b => b.outstanding),
    ledgerMismatches: invoices.filter(i => cents(i.paid_total) !== (ledger.get(i.id) ?? 0)).length,
    refundMismatches: invoices.filter(i=>cents(i.refunded_total??0)!==(refunded.get(i.id)??0)).length,
    orphanRefunds: refunds.filter(r=>!payments.some(p=>p.id===r.payment_id && p.invoice_id===r.invoice_id)).length,
    orphanPayments: payments.filter(p => !knownInvoices.has(p.invoice_id)).length,
    invalidPayments: invoices.filter(i => (ledger.get(i.id) ?? 0) > cents(i.total) || (!issued(i) && (ledger.get(i.id) ?? 0) > 0)).length,
    unassignedExpenses: difference(total(expenses.filter(e => !e.job_id || !knownJobs.has(e.job_id)), e => e.amount), [...allocated.values()].reduce((sum,value)=>sum+value,0)/100),
    unassignedBilled: total(invoices.filter(i => issued(i) && (!i.job_id || !knownJobs.has(i.job_id))), i => difference(Number(i.total),(refunded.get(i.id)??0)/100)),
    jobRows,
  };
}

// Fail closed if any page fails or records shift during pagination; never display a partial total.
export async function collectReportPages<T extends { id: string }>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; count: number | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  const ids = new Set<string>();
  let expected: number | undefined;
  do {
    const result = await fetchPage(rows.length, rows.length + 499);
    if (result.error) throw new Error(result.error.message);
    if (result.count === null || (expected !== undefined && expected !== result.count)) throw new Error('Records changed while loading. Please refresh the report.');
    expected = result.count;
    for (const row of result.data ?? []) {
      if (ids.has(row.id)) throw new Error('Records changed while loading. Please refresh the report.');
      ids.add(row.id); rows.push(row);
    }
    if (!result.data?.length && rows.length < expected) throw new Error('The report could not load all records. Please retry.');
  } while (rows.length < expected);
  return rows;
}
