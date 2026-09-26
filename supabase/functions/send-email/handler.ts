import { buildMessage, validEmail } from './message.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const response=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
const uuid=(v:unknown)=>typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function createHandler(deps:{client:(auth:string)=>any; admin:()=>any; env:(key:string)=>string|undefined; fetch:typeof fetch}) {
 return async(req:Request)=>{
  if(req.method==='OPTIONS') return response(200,{ok:true});
  if(req.method!=='POST') return response(405,{error:'Use POST.'});
  try {
   const auth=req.headers.get('Authorization')??'';
   if(!/^Bearer \S+$/i.test(auth)) return response(401,{error:'Sign in to send email.'});
   const db=deps.client(auth);
   const {data:identity,error:authError}=await db.auth.getUser(auth.slice(7));
   if(authError || !identity?.user) return response(401,{error:'Your session expired. Sign in again.'});
   const input=await req.text();
   if(input.length>2048) return response(400,{error:'Invalid email request.'});
   let body:any; try {body=JSON.parse(input);} catch {return response(400,{error:'Invalid email request.'});}
   if(!body || !['invoice','estimate'].includes(body.type) || !uuid(body.recordId) || (body.action !== 'status' && !uuid(body.requestId)) || (body.action !== undefined && body.action !== 'status') || Object.keys(body).some(k=>!['type','recordId','requestId','action'].includes(k))) return response(400,{error:'Invalid email request.'});
   const {data:record,error:recordError}=await db.from(body.type==='invoice'?'invoices':'estimates').select('business_id,customer_id,status').eq('id',body.recordId).single();
   if(recordError || !record) return response(403,{error:'Document unavailable.'});
   const {data:member,error:memberError}=await db.from('business_members').select('business_id').eq('business_id',record.business_id).eq('user_id',identity.user.id).maybeSingle();
   if(memberError || !member) return response(403,{error:'Only business staff may send document emails.'});
   const key=deps.env('RESEND_API_KEY'),from=deps.env('CUSTOMER_EMAIL_FROM');
   const ready=deps.env('CUSTOMER_EMAIL_ENABLED')==='true' && !!key && validEmail(from) && !from.toLowerCase().endsWith('@resend.dev');
   const setupMessage='Customer email is not enabled yet. Your business needs a verified sender before emails can be sent.';
   if(body.action==='status') return response(200,{ready,message:ready?'Email sending is configured.':setupMessage});
   if(!ready) return response(503,{error:setupMessage+' Nothing was sent.'});
   const {data:customer,error:customerError}=await db.from('customers').select('email').eq('id',record.customer_id).eq('business_id',record.business_id).single();
   if(customerError || !validEmail(customer?.email?.trim())) return response(422,{error:'Save a valid email on the customer record first.'});
   if((body.type==='estimate' && record.status!=='sent') || (body.type==='invoice' && !['sent','overdue','paid'].includes(record.status))) return response(422,{error:'Publish this document before emailing it.'});
   const {data:doc,error:docError}=await db.rpc('get_customer_document',{_kind:body.type,_id:body.recordId});
   if(docError || !doc) return response(403,{error:'Document unavailable.'});
   if(!validEmail(doc.contact_email)) return response(422,{error:'Save a valid business contact email for customer replies first.'});
   const message=buildMessage(doc);
   const admin=deps.admin();
   const {data:attempt,error:claimError}=await admin.rpc('claim_customer_email',{_id:body.requestId,_actor:identity.user.id,_kind:body.type,_record:body.recordId,_recipient:customer.email.trim()});
   if(claimError || !attempt) return response(409,{error:'Email could not be reserved. Refresh the record or wait before retrying.'});
   if(!attempt.claimed) return attempt.status==='accepted'?response(200,{success:true,id:attempt.provider_id,status:'accepted'}):response(409,{error:'This attempt is already recorded. Check email history before starting another send.'});
   let status='unknown',providerId:string|null=null;
   try {
    const sent=await deps.fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':body.requestId},body:JSON.stringify({from,to:[attempt.recipient],reply_to:doc.contact_email,...message}),signal:AbortSignal.timeout(15000)});
    const result=await sent.json();
    if(sent.ok && typeof result.id==='string') {status='accepted';providerId=result.id;}
    else if(sent.status>=400 && sent.status<500 && sent.status!==408 && sent.status!==409) status='failed';
   } catch { /* An ambiguous result must not be automatically retried. */ }
   const {error:saveError}=await admin.from('customer_email_deliveries').update({status,provider_id:providerId,error_code:status==='accepted'?null:status,updated_at:new Date().toISOString()}).eq('id',attempt.id);
   if(saveError) return response(503,{error:'Email outcome could not be saved. Do not resend until its status is checked.'});
   return status==='accepted'?response(200,{success:true,id:providerId,status}):response(502,{error:status==='unknown'?'Delivery outcome is uncertain. Check email history before resending.':'The email provider rejected the request. Nothing was marked sent.'});
  } catch {return response(500,{error:'Email could not be prepared. Nothing was marked sent.'});}
 };
}
