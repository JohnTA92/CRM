import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { loadCostingData } from '@/lib/reportData';
import { buildFinancialReport } from '@/lib/reporting';
import { Button } from '@/design-system/primitives/Button';
const money = (n:number) => n.toLocaleString('en-US',{style:'currency',currency:'USD'});
const field = 'w-full border border-paper-deep rounded-lg px-3 py-2 text-sm bg-white';

export function JobCostingPanel({businessId,jobId}:{businessId:string;jobId:string}) {
  const [data,setData]=useState<Awaited<ReturnType<typeof loadCostingData>>|null>(null);
  const [error,setError]=useState(''); const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false);
  const [crewId,setCrewId]=useState(''); const [start,setStart]=useState(''); const [end,setEnd]=useState('');
  const [showTime,setShowTime]=useState(false); const [entryId,setEntryId]=useState(()=>crypto.randomUUID());
  const sequence=useRef(0);
  async function load() {
    const version=++sequence.current; setLoading(true); setError(''); setData(null);
    try {const result=await loadCostingData(businessId); if(version===sequence.current)setData(result);}
    catch(e){if(version===sequence.current)setError(e instanceof Error?e.message:'Could not load job costs.');}
    finally{if(version===sequence.current)setLoading(false);}
  }
  useEffect(()=>{load();return()=>{sequence.current++;};},[businessId,jobId]);
  async function saveSource(source:string) {
    setSaving(true);setError('');
    const {error}=await supabase.from('jobs').update({labor_cost_source:source}).eq('id',jobId).eq('business_id',businessId).select('id').single();
    if(error)setError(error.message);else await load(); setSaving(false);
  }
  async function saveTime(e:React.FormEvent) {
    e.preventDefault();if(saving)return;
    if(!crewId||!start||!end||new Date(end)<=new Date(start)||new Date(end)>new Date()){setError('Choose an employee and valid start/end times in the past.');return;}
    setSaving(true);setError('');
    try {
      const {error}=await supabase.rpc('record_job_time',{_job_id:jobId,_crew_id:crewId,_entry_id:entryId,_start:new Date(start).toISOString(),_end:new Date(end).toISOString()});
      if(error)throw error;
      setEntryId(crypto.randomUUID());setStart('');setEnd('');setShowTime(false);await load();
    } catch(e){setError(e instanceof Error?e.message:(e as any)?.message??'Could not save. Retry with the same details.');}
    finally{setSaving(false);}
  }
  if(loading)return <section className="bg-white rounded-xl border border-paper-deep p-5 mb-5" role="status">Loading job costs…</section>;
  if(!data)return <section className="p-5 mb-5"><p role="alert">{error}</p><button onClick={load}>Retry</button></section>;
  const report=buildFinancialReport(data.invoices,data.payments,data.expenses,data.jobs,new Date().getFullYear(),undefined,{refunds:data.refunds,timeEntries:data.timeEntries});
  const row=report.jobRows.find(j=>j.id===jobId);
  const source=data.jobs.find(j=>j.id===jobId)?.labor_cost_source??'time';
  const entries=data.timeEntries.filter(e=>e.job_id===jobId&&!e.break_type);
  return <section className="bg-white rounded-xl border border-paper-deep p-5 mb-5">
    <h2 className="text-sm font-semibold text-ink">Job costs and profitability</h2>
    <p className="text-xs text-ink-quiet mt-2">Shared overhead is divided by each job’s recorded labor hours in the same month (UTC). Recorded breaks are excluded. These are cost estimates, not payroll or tax calculations.</p>
    <label className="block text-xs text-ink-soft mt-4">Labor cost source
      <select className={field+' mt-1'} value={source} disabled={saving} onChange={e=>saveSource(e.target.value)}>
        <option value="time">Automatic: job time × saved hourly rate</option><option value="expenses">Manual: logged labor expenses</option>
      </select>
    </label>
    <p className="text-xs text-ink-quiet mt-2">{source==='time'?'Logged labor expenses are excluded from estimated costs to avoid counting payroll twice. They remain in cash-flow reports.':'Recorded job hours still determine overhead allocation; labor costs come from Expenses.'}</p>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
      {[["Net billed",row?.billed??0],["Direct + labor + overhead",row?.costs??0],["Labor cost",row?.laborCost??0],["Allocated overhead",row?.overhead??0]].map(([label,value])=><div key={label}><p className="text-xs text-ink-quiet">{label}</p><p className="text-lg font-semibold">{money(Number(value))}</p></div>)}
      <div><p className="text-xs text-ink-quiet">Recorded job hours</p><p className="text-lg font-semibold">{(row?.hours??0).toFixed(2)}</p></div>
      <div><p className="text-xs text-ink-quiet">Estimated profit</p><p className="text-lg font-semibold">{row?.incomplete?'Needs time/rate review':money(row?.contribution??0)}</p></div>
    </div>
    <p className="text-xs text-ink-quiet mt-3">Company overhead awaiting job hours: {money(report.unallocatedOverhead)}. Unrecorded costs are not included.</p>
    {row?.incomplete&&<p role="alert" className="text-sm text-red-700 mt-3">Review missing hourly rates, open/overlapping time, or choose logged labor expenses before relying on this estimate.</p>}
    {source==='time'&&(row?.recordedLabor??0)>0&&<p className="text-xs text-ink-quiet mt-2">{money(row!.recordedLabor)} of logged labor expenses is excluded from this estimate.</p>}
    {error&&<p role="alert" className="text-sm text-red-700 mt-3">{error}</p>}
    <div className="flex gap-4 items-center mt-4"><Button size="sm" variant="secondary" className="w-auto" onClick={()=>setShowTime(!showTime)} disabled={saving}>Record job time</Button><Link to="/expenses" className="text-sm text-accent underline">Log expenses</Link><Link to="/crew" className="text-sm text-accent underline">Crew pay rates</Link></div>
    {showTime&&<form onSubmit={saveTime} className="border-t border-paper-deep mt-4 pt-4 space-y-3">
      <p className="text-xs text-ink-quiet">Enter actual job work. The current crew rate is saved with this entry; later rate changes will not rewrite it. For salary labor, choose logged labor expenses. Existing overlapping job entries are rejected.</p>
      <label className="block text-xs">Employee<select required value={crewId} onChange={e=>setCrewId(e.target.value)} disabled={saving} className={field}><option value="">Choose employee</option>{data.crew.filter(c=>c.active).map(c=><option key={c.id} value={c.id}>{c.name} — {c.pay_type==='hourly'&&c.pay_rate!=null?`${money(Number(c.pay_rate))}/hr`:'no hourly rate'}</option>)}</select></label>
      <label className="block text-xs">Start (your local time)<input required type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} disabled={saving} className={field}/></label>
      <label className="block text-xs">End (your local time)<input required type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)} disabled={saving} className={field}/></label>
      <Button type="submit" size="sm" className="w-auto" disabled={saving}>{saving?'Saving…':'Save actual job time'}</Button>
    </form>}
    <div className="mt-4 text-xs text-ink-quiet">{entries.length===0?'No job time recorded yet.':entries.map(e=><p key={e.id} className="py-1">{data.crew.find(c=>c.id===e.crew_member_id)?.name??'Employee'} · {new Date(e.clocked_in_at).toLocaleString()} → {e.clocked_out_at?new Date(e.clocked_out_at).toLocaleString():'Open'} · Saved rate: {e.labor_hourly_rate!=null?`${money(Number(e.labor_hourly_rate))}/hr`:'not available'}</p>)}</div>
  </section>;
}
