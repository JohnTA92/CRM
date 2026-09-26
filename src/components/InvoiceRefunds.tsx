import {useEffect,useRef,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {useAuth} from '@/lib/auth';
import {moneyCents,sumMoney} from '@/lib/money';
import {collectReportPages} from '@/lib/reporting';
import {Button} from '@/design-system/primitives/Button';

export function InvoiceRefunds({invoice,payments,onRecorded}:{invoice:any;payments:any[];onRecorded:()=>Promise<void>}) {
 const {user}=useAuth(); const [rows,setRows]=useState<any[]>([]); const [owner,setOwner]=useState(false);
 const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const [saving,setSaving]=useState(false); const [show,setShow]=useState(false);
 const [paymentId,setPaymentId]=useState(''); const [amount,setAmount]=useState(''); const [method,setMethod]=useState('cash'); const [reason,setReason]=useState(''); const [date,setDate]=useState(''); const [confirmed,setConfirmed]=useState(false);
 const [requestId]=useState(()=>crypto.randomUUID()); const sequence=useRef(0);
 async function load() {
  const version=++sequence.current;setLoading(true);setError('');setRows([]);setOwner(false);
  try {
   const [refunds,membership]=await Promise.all([
    collectReportPages<any>((from,to)=>supabase.from('invoice_refunds').select('*',{count:'exact'}).eq('invoice_id',invoice.id).eq('business_id',invoice.business_id).order('id').range(from,to)),
    supabase.from('business_members').select('role').eq('business_id',invoice.business_id).eq('user_id',user?.id??'').maybeSingle(),
   ]);
   if(membership.error)throw membership.error;
   if(version===sequence.current){setRows(refunds);setOwner(membership.data?.role==='owner');}
  }catch(e){if(version===sequence.current)setError((e as any)?.message??'Unable to load refund history.');}
  finally{if(version===sequence.current)setLoading(false);}
 }
 useEffect(()=>{load();return()=>{sequence.current++;};},[invoice.id,user?.id]);
 const remaining=(p:any)=>(Math.round(Number(p.amount)*100)-Math.round(sumMoney(rows.filter(r=>r.payment_id===p.id),r=>Number(r.amount))*100))/100;
 async function save(e:React.FormEvent) {
  e.preventDefault();if(saving)return;
  let cents:number;
  try{cents=moneyCents(amount);}catch{setError('Enter a positive amount with up to two decimal places.');return;}
  const payment=payments.find(p=>p.id===paymentId);
  if(!confirmed||!payment||!reason.trim()||!date||cents<=0||cents>Math.round(remaining(payment)*100)){setError('Select the original payment, enter valid details, and confirm the money was already returned.');return;}
  setSaving(true);setError('');
  try{
   const {error}=await supabase.rpc('record_invoice_refund',{_invoice_id:invoice.id,_payment_id:paymentId,_refund_id:requestId,_amount:cents/100,_method:method,_reason:reason.trim(),_refunded_at:new Date(date).toISOString()});
   if(error)throw error;
   setShow(false);await onRecorded();
  }catch(e){setError((e as any)?.message??'Unable to save. Retry with the same details.');}
  finally{setSaving(false);}
 }
 const field='w-full border border-paper-deep rounded-lg px-3 py-2 text-sm bg-white';
 return <section className="bg-white rounded-xl border border-paper-deep p-5 mb-5">
  <h2 className="text-sm font-semibold text-ink">Refunds and credits</h2>
  <p className="text-xs text-ink-quiet mt-2">Record a refund already returned outside this app. Each refund also credits the same amount of the invoice; it does not reopen that amount as a debt. No card charge or bank transfer happens here.</p>
  {loading?<p role="status" className="text-sm mt-3">Loading refunds…</p>:rows.length?rows.map(r=><div key={r.id} className="border-t border-paper-deep mt-3 pt-3 text-sm"><p className="font-medium">−${Number(r.amount).toFixed(2)} · {r.method}</p><p>{r.reason}</p><p className="text-xs text-ink-quiet">Returned {new Date(r.refunded_at).toLocaleString()} · Recorded {new Date(r.created_at).toLocaleString()}</p></div>):<p className="text-sm text-ink-quiet mt-3">No refunds recorded.</p>}
  {error&&<p role="alert" className="text-sm text-red-700 mt-3">{error}</p>}
  {!show&&!loading&&!error&&owner&&payments.some(p=>remaining(p)>0)&&<Button size="sm" variant="secondary" className="w-auto mt-3" onClick={()=>setShow(true)}>Record completed refund</Button>}
  {!owner&&!loading&&<p className="text-xs text-ink-quiet mt-3">Only a business owner can record refunds.</p>}
  {show&&<form onSubmit={save} className="space-y-3 mt-4">
   <label className="block text-xs">Original payment<select required className={field} value={paymentId} onChange={e=>setPaymentId(e.target.value)} disabled={saving}><option value="">Select payment</option>{payments.filter(p=>remaining(p)>0).map(p=><option key={p.id} value={p.id}>{p.method} · {new Date(p.paid_at).toLocaleString()} · ${remaining(p).toFixed(2)} available</option>)}</select></label>
   <label className="block text-xs">Amount returned<input required inputMode="decimal" className={field} value={amount} onChange={e=>setAmount(e.target.value)} disabled={saving}/></label>
   <label className="block text-xs">Return method<select className={field} value={method} onChange={e=>setMethod(e.target.value)} disabled={saving}>{['cash','check','card','venmo','zelle','other'].map(m=><option key={m}>{m}</option>)}</select></label>
   <label className="block text-xs">When returned (your local time)<input required type="datetime-local" className={field} value={date} onChange={e=>setDate(e.target.value)} disabled={saving}/></label>
   <label className="block text-xs">Reason<textarea required maxLength={500} className={field} value={reason} onChange={e=>setReason(e.target.value)} disabled={saving}/></label>
   <label className="flex gap-2 text-sm"><input required type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={saving}/>I already returned this money and want to record the refund and matching credit. The saved record cannot be edited or deleted.</label>
   <div className="flex gap-2"><Button type="submit" size="sm" className="w-auto" disabled={saving}>{saving?'Saving…':'Save refund record'}</Button><Button type="button" size="sm" variant="secondary" className="w-auto" disabled={saving} onClick={()=>setShow(false)}>Cancel</Button></div>
  </form>}
 </section>;
}
