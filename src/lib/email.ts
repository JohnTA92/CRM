import { supabase } from '@/lib/supabase';

// Stable for the current page session so double clicks/retries use one attempt.
const attempts = new Map<string, string>();
export async function sendEmail(params: {type:'estimate'|'invoice';recordId:string}): Promise<{success:boolean;error?:string}> {
  const recordKey=`${params.type}:${params.recordId}`;
  if(!attempts.has(recordKey)) attempts.set(recordKey,crypto.randomUUID());
  try {
    const {data,error}=await supabase.functions.invoke('send-email',{body:{...params,requestId:attempts.get(recordKey)}});
    if(error) {
      let message='Email is unavailable. Nothing was marked sent. Check sender setup before retrying.';
      if(error.context instanceof Response) {
        try {const body=await error.context.json(); if(typeof body?.error==='string') message=body.error;} catch { /* Keep actionable fallback. */ }
      }
      return {success:false,error:message};
    }
    if(data?.success!==true || data?.status!=='accepted' || typeof data?.id!=='string') return {success:false,error:data?.error??'The server did not confirm acceptance. Nothing was marked sent.'};
    return {success:true};
  } catch {return {success:false,error:'Connection interrupted. Check email history before retrying.'};}
}
