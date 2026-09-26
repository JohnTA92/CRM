import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
export function EmailHistory({kind,recordId}:{kind:'invoice'|'estimate';recordId:string}) {
 const [rows,setRows]=useState<any[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const [revision,setRevision]=useState(0);
 const [setup,setSetup]=useState('Checking email setup…');
 useEffect(()=>{let active=true;setLoading(true);setError('');
  supabase.functions.invoke('send-email',{body:{type:kind,recordId,action:'status'}}).then(({data,error})=>{if(active)setSetup(error?'Could not check email setup. Please try again.':data?.message??'Email setup status is unavailable.');}).catch(()=>{if(active)setSetup('Could not check email setup. Please try again.');});
  supabase.from('customer_email_deliveries').select('id,recipient,status,created_at').eq('kind',kind).eq('record_id',recordId).order('created_at',{ascending:false}).limit(10).then(({data,error})=>{
   if(!active)return;setLoading(false);setRows(data??[]);setError(error?'Could not load email history. Please refresh or try again shortly.':'');
  });return()=>{active=false;};
 },[kind,recordId,revision]);
 const labels:Record<string,string>={processing:'Processing — check before resending',accepted:'Accepted by email provider',failed:'Rejected by email provider',unknown:'Outcome uncertain — check before resending'};
 return <section className="border border-paper-deep rounded-xl p-4 text-[13px] space-y-2"><div className="flex justify-between gap-2"><h3 className="font-semibold text-ink">Email history</h3><button type="button" disabled={loading} onClick={()=>setRevision(v=>v+1)} className="text-ink-soft underline disabled:opacity-50">Refresh</button></div><p role="status" className="text-ink-soft">{setup}</p><p className="text-ink-quiet">Provider acceptance does not confirm delivery to the inbox.</p>{loading?<p role="status">Loading…</p>:error?<p role="alert">{error}</p>:rows.length?rows.map(r=><p key={r.id}>{labels[r.status]??r.status} · {r.recipient} · {new Date(r.created_at).toLocaleString()}</p>):<p>No email attempts recorded.</p>}</section>;
}
