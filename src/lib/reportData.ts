import { supabase } from './supabase';
import { collectReportPages } from './reporting';

export async function loadReportRows(table: string, columns: string, businessId: string, jobId?: string) {
  try {
    const data = await collectReportPages<any>((from, to) => {
      let query = supabase.from(table).select(columns, { count: 'exact' }).eq('business_id', businessId);
      if (jobId) query = query.eq('job_id', jobId);
      return query.order('id').range(from, to);
    });
    return { data, error: null };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'Unable to load the complete report.' } };
  }
}

export async function loadCostingData(businessId: string) {
  const [invoices, payments, refunds, expenses, jobs, timeEntries, crew] = await Promise.all([
    loadReportRows('invoices', 'id, job_id, customer_id, status, total, paid_total, refunded_total, due_at', businessId),
    loadReportRows('invoice_payments', 'id, invoice_id, amount, paid_at', businessId),
    loadReportRows('invoice_refunds', 'id, invoice_id, payment_id, amount, refunded_at', businessId),
    loadReportRows('expenses', 'id, job_id, amount, date, category', businessId),
    loadReportRows('jobs', 'id, title, created_at, labor_cost_source', businessId),
    loadReportRows('time_entries', 'id, job_id, crew_member_id, clocked_in_at, clocked_out_at, break_type, labor_hourly_rate', businessId),
    loadReportRows('crew_members', 'id, name, pay_type, pay_rate, active', businessId),
  ]);
  const error = [invoices, payments, refunds, expenses, jobs, timeEntries, crew].find(r=>r.error)?.error;
  if (error) throw new Error(error.message);
  return { invoices: invoices.data!, payments: payments.data!, refunds: refunds.data!, expenses: expenses.data!, jobs: jobs.data!, timeEntries: timeEntries.data!, crew: crew.data! };
}
