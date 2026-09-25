-- No historical amounts or payments are invented. The current dataset has no
-- payments; the existing empty draft remains editable but cannot be issued.
alter table public.invoices add column paid_total numeric(10,2) not null default 0;
update public.invoices i set paid_total=coalesce((select sum(p.amount) from public.invoice_payments p where p.invoice_id=i.id and p.business_id=i.business_id),0);

create or replace function private.document_total(items jsonb) returns numeric
language plpgsql immutable security invoker set search_path='' as $$
declare item jsonb; q numeric; price numeric; result numeric:=0;
begin
 if items is null or jsonb_typeof(items)<>'array' or jsonb_array_length(items)=0 then
  raise exception 'Add at least one line item.' using errcode='22023';
 end if;
 for item in select value from jsonb_array_elements(items) loop
  if coalesce(trim(item->>'description'),'')='' or coalesce(item->>'type','') not in ('service','labor','material','other') then
   raise exception 'Every item needs a description and valid type.' using errcode='22023';
  end if;
  if coalesce(item->>'quantity','') !~ '^[0-9]+(\.[0-9]{1,3})?$' or coalesce(item->>'unitPrice','') !~ '^[0-9]+(\.[0-9]{1,2})?$' then
   raise exception 'Use positive quantities (up to 3 decimals) and prices with up to 2 decimals.' using errcode='22023';
  end if;
  q:=(item->>'quantity')::numeric; price:=(item->>'unitPrice')::numeric;
  if q<=0 or q>1000000 or price>99999999.99 then raise exception 'Quantity or price is outside the allowed range.' using errcode='22023'; end if;
  result:=result+round(q*price,2);
 end loop;
 if result>99999999.99 then raise exception 'Document total is too large.' using errcode='22023'; end if;
 return result;
end $$;
revoke all on function private.document_total(jsonb) from public,anon;
grant execute on function private.document_total(jsonb) to authenticated,service_role;

create or replace function private.validate_financial_document() returns trigger
language plpgsql security invoker set search_path='' as $$
declare paid numeric; linked_customer uuid;
begin
 if new.business_id is null or new.customer_id is null then raise exception 'Choose a business and customer.' using errcode='23514'; end if;
 -- Always calculate, rather than trusting totals supplied by a browser.
 new.total:=private.document_total(new.line_items);
 if new.job_id is not null then
  select customer_id into linked_customer from public.jobs where id=new.job_id and business_id=new.business_id;
  if not found or linked_customer is distinct from new.customer_id then raise exception 'The job and document must have the same customer.' using errcode='23514'; end if;
 end if;
 if tg_table_name='invoices' then
  if new.estimate_id is not null then
   select customer_id into linked_customer from public.estimates where id=new.estimate_id and business_id=new.business_id;
   if not found or linked_customer is distinct from new.customer_id then raise exception 'The estimate and invoice must have the same customer.' using errcode='23514'; end if;
  end if;
  if new.status not in ('draft','sent','overdue','paid','voided') then raise exception 'Invalid invoice status.' using errcode='23514'; end if;
  select coalesce(sum(amount),0) into paid from public.invoice_payments where invoice_id=new.id and business_id=new.business_id;
  if tg_op='UPDATE' and old.paid_total>0 and (new.customer_id is distinct from old.customer_id or new.business_id is distinct from old.business_id) then raise exception 'An invoice with payments cannot be reassigned.' using errcode='23514'; end if;
  new.paid_total:=paid;
  if paid>new.total then raise exception 'Invoice total cannot be less than payments already recorded.' using errcode='23514'; end if;
  if new.status='voided' and paid>0 then raise exception 'An invoice with payments cannot be voided. A payment adjustment is required.' using errcode='23514'; end if;
  if new.status not in ('draft','voided') and new.total<=0 then raise exception 'An issued invoice needs a positive total.' using errcode='23514'; end if;
  if new.status='paid' and (paid<new.total or paid=0) then raise exception 'Record the remaining payment before marking this invoice paid.' using errcode='23514'; end if;
  if paid>0 then
   if paid=new.total then new.status:='paid'; new.paid_at:=coalesce(new.paid_at,now());
   elsif new.status='draft' then new.status:='sent'; end if;
   new.sent_at:=coalesce(new.sent_at,now());
  end if;
  if new.status<>'paid' then new.paid_at:=null; end if;
 elsif new.status not in ('draft','sent','approved','declined','expired') then
  raise exception 'Invalid estimate status.' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function private.validate_financial_document() from public,anon,authenticated;
create trigger validate_invoice_money before insert or update on public.invoices for each row execute function private.validate_financial_document();
create trigger validate_estimate_money before insert or update on public.estimates for each row execute function private.validate_financial_document();

-- Row locking serializes payments and edits of the same invoice. Ledger records
-- are immutable: a later adjustments feature must use explicit audited entries.
create or replace function private.validate_invoice_payment() returns trigger
language plpgsql security invoker set search_path='' as $$
declare inv public.invoices; paid numeric;
begin
 if tg_op<>'INSERT' then raise exception 'Recorded payments cannot be changed or deleted.' using errcode='23514'; end if;
 select * into inv from public.invoices where id=new.invoice_id and business_id=new.business_id for update;
 if not found then raise exception 'Invoice unavailable.' using errcode='42501'; end if;
 if new.amount is null or new.amount<=0 or new.amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Payment must be a positive amount.' using errcode='22023'; end if;
 if inv.status in ('paid','voided') then raise exception 'This invoice cannot accept another payment.' using errcode='23514'; end if;
 if private.document_total(inv.line_items)<>inv.total then raise exception 'Review and save this invoice before recording payment.' using errcode='23514'; end if;
 select coalesce(sum(amount),0) into paid from public.invoice_payments where invoice_id=inv.id and business_id=inv.business_id;
 if new.amount>inv.total-paid then raise exception 'Payment exceeds the remaining balance.' using errcode='23514'; end if;
 if new.method not in ('cash','check','card','venmo','zelle','other') or new.method is null then raise exception 'Choose a valid payment method.' using errcode='22023'; end if;
 new.paid_at:=coalesce(new.paid_at,now());
 return new;
end $$;
create or replace function private.refresh_invoice_payment_total() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 update public.invoices set paid_total=paid_total where id=new.invoice_id and business_id=new.business_id;
 return new;
end $$;
revoke all on function private.validate_invoice_payment(), private.refresh_invoice_payment_total() from public,anon,authenticated;
create trigger validate_payment before insert or update or delete on public.invoice_payments for each row execute function private.validate_invoice_payment();
create trigger refresh_payment_balance after insert on public.invoice_payments for each row execute function private.refresh_invoice_payment_total();
create index if not exists invoice_payments_invoice_business_idx on public.invoice_payments(invoice_id,business_id);

create or replace function public.record_invoice_payment(_invoice_id uuid,_payment_id uuid,_amount numeric,_method text,_note text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare inv public.invoices; existing public.invoice_payments;
begin
 if auth.uid() is null then raise exception 'Sign in to record a payment.' using errcode='42501'; end if;
 select * into inv from public.invoices where id=_invoice_id for update;
 if not found then raise exception 'Invoice unavailable.' using errcode='42501'; end if;
 if _payment_id is null or _amount is null or _amount<=0 or _amount::text in ('NaN','Infinity','-Infinity') or round(_amount,2)<>_amount then raise exception 'Enter a positive payment with no more than two decimal places.' using errcode='22023'; end if;
 select * into existing from public.invoice_payments where id=_payment_id;
 if found then
  if existing.invoice_id<>_invoice_id or existing.amount<>_amount or existing.method<>_method or existing.note is distinct from nullif(trim(_note),'') then raise exception 'This payment reference was already used for different details.' using errcode='23514'; end if;
 else
  insert into public.invoice_payments(id,invoice_id,business_id,amount,method,note) values (_payment_id,inv.id,inv.business_id,_amount,_method,nullif(trim(_note),''));
 end if;
 select * into inv from public.invoices where id=_invoice_id;
 return jsonb_build_object('invoice',to_jsonb(inv),'payments',(select coalesce(jsonb_agg(to_jsonb(p) order by p.paid_at),'[]'::jsonb) from public.invoice_payments p where p.invoice_id=inv.id and p.business_id=inv.business_id));
end $$;

create or replace function public.convert_job_to_invoice(_job_id uuid) returns public.invoices
language plpgsql security invoker set search_path='' as $$
declare j public.jobs; e public.estimates; inv public.invoices; items jsonb; prior_count int;
begin
 if auth.uid() is null then raise exception 'Sign in to create an invoice.' using errcode='42501'; end if;
 select * into j from public.jobs where id=_job_id for update;
 if not found then raise exception 'Job unavailable.' using errcode='42501'; end if;
 if j.invoice_id is not null then
  select * into inv from public.invoices where id=j.invoice_id and business_id=j.business_id;
  if not found or inv.customer_id is distinct from j.customer_id then raise exception 'The existing invoice link needs review.'; end if;
  return inv;
 end if;
 select count(*) into prior_count from public.invoices where job_id=j.id and business_id=j.business_id;
 if prior_count>1 then raise exception 'Multiple invoices are linked to this job. Review them before converting.'; end if;
 if prior_count=1 then
  select * into inv from public.invoices where job_id=j.id and business_id=j.business_id;
  if inv.customer_id is distinct from j.customer_id then raise exception 'The existing invoice customer needs review.'; end if;
 else
  if j.estimate_id is not null then
   select * into e from public.estimates where id=j.estimate_id and business_id=j.business_id;
   if not found or e.customer_id is distinct from j.customer_id then raise exception 'The linked estimate needs review.'; end if;
   if e.status<>'approved' then raise exception 'Approve the linked estimate before creating an invoice.'; end if;
   items:=e.line_items;
  else
   if j.price is null or j.price<=0 then raise exception 'Set a positive job price or link an approved estimate before creating an invoice.'; end if;
   items:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'description',j.title,'quantity',1,'unitPrice',j.price,'type','service'));
  end if;
  insert into public.invoices(business_id,customer_id,job_id,estimate_id,line_items,notes,total,status)
   values(j.business_id,j.customer_id,j.id,e.id,items,coalesce(e.notes,j.notes),private.document_total(items),'draft') returning * into inv;
 end if;
 update public.jobs set invoice_id=inv.id,status='invoiced' where id=j.id;
 return inv;
end $$;

create or replace function public.create_job_estimate(_job_id uuid,_items jsonb,_notes text,_service_type text,_tier text,_follow_up_days int) returns public.estimates
language plpgsql security invoker set search_path='' as $$
declare j public.jobs; e public.estimates;
begin
 if auth.uid() is null then raise exception 'Sign in to create an estimate.' using errcode='42501'; end if;
 select * into j from public.jobs where id=_job_id for update;
 if not found then raise exception 'Job unavailable.' using errcode='42501'; end if;
 if j.estimate_id is not null then
  select * into e from public.estimates where id=j.estimate_id and business_id=j.business_id;
  if not found or e.customer_id is distinct from j.customer_id then raise exception 'The existing estimate link needs review.'; end if;
  return e;
 end if;
 if j.invoice_id is not null then raise exception 'This job already has an invoice. Review it before adding an estimate.'; end if;
 insert into public.estimates(business_id,customer_id,job_id,line_items,notes,service_type,tier,follow_up_days,total)
 values(j.business_id,j.customer_id,j.id,_items,nullif(trim(_notes),''),_service_type,_tier,_follow_up_days,private.document_total(_items)) returning * into e;
 update public.jobs set estimate_id=e.id where id=j.id;
 return e;
end $$;

create or replace function public.convert_estimate_to_job(_estimate_id uuid) returns public.jobs
language plpgsql security invoker set search_path='' as $$
declare e public.estimates; j public.jobs;
begin
 if auth.uid() is null then raise exception 'Sign in to create a job.' using errcode='42501'; end if;
 select * into e from public.estimates where id=_estimate_id for update;
 if not found then raise exception 'Estimate unavailable.' using errcode='42501'; end if;
 if e.status<>'approved' then raise exception 'Approve this estimate before creating a job.'; end if;
 if e.job_id is not null then
  select * into j from public.jobs where id=e.job_id and business_id=e.business_id;
  if not found or j.customer_id is distinct from e.customer_id then raise exception 'The existing job link needs review.'; end if;
  return j;
 end if;
 insert into public.jobs(business_id,customer_id,estimate_id,title,service_type,price,notes,status)
 values(e.business_id,e.customer_id,e.id,e.line_items->0->>'description',e.service_type,private.document_total(e.line_items),e.notes,'draft') returning * into j;
 update public.estimates set job_id=j.id where id=e.id;
 return j;
end $$;

revoke all on function public.record_invoice_payment(uuid,uuid,numeric,text,text),public.convert_job_to_invoice(uuid),public.create_job_estimate(uuid,jsonb,text,text,text,int),public.convert_estimate_to_job(uuid) from public,anon;
grant execute on function public.record_invoice_payment(uuid,uuid,numeric,text,text),public.convert_job_to_invoice(uuid),public.create_job_estimate(uuid,jsonb,text,text,text,int),public.convert_estimate_to_job(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.get_portal_data(_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare bid uuid; result jsonb;
begin
if auth.uid() is null then return null; end if;
select c.business_id into bid from public.customers c where c.id=_customer_id;
if bid is null or not (
exists(select 1 from public.business_members m where m.user_id=auth.uid() and m.business_id=bid)
or exists(select 1 from public.customer_portal_access a where a.user_id=auth.uid()
 and a.customer_id=_customer_id and a.business_id=bid and a.revoked_at is null and a.expires_at>now())
) then return null; end if;
select jsonb_build_object(
 'customer',jsonb_build_object('id',c.id,'name',c.name),
 'contact',jsonb_build_object('business_name',coalesce(s.business_name,b.name),
 'contact_phone',coalesce(s.contact_phone,s.phone),'contact_email',s.contact_email,'portal_welcome_message',s.portal_welcome_message),
 'jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'title',j.title,'status',j.status,'scheduled_date',j.scheduled_date,'scheduled_time',j.scheduled_time) order by j.scheduled_date desc),'[]'::jsonb) from public.jobs j where j.customer_id=c.id and j.business_id=bid and j.status<>'draft'),
 'estimates',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'total',e.total,'status',e.status,'created_at',e.created_at,'sent_at',e.sent_at) order by e.created_at desc),'[]'::jsonb) from public.estimates e where e.customer_id=c.id and e.business_id=bid and e.status<>'draft'),
 'invoices',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'total',i.total,'paid_total',i.paid_total,'balance_due',greatest(0,i.total-i.paid_total),'status',i.status,'due_at',i.due_at,'created_at',i.created_at) order by i.created_at desc),'[]'::jsonb) from public.invoices i where i.customer_id=c.id and i.business_id=bid and i.status not in ('draft','voided'))
) into result from public.customers c join public.businesses b on b.id=c.business_id
left join public.company_settings s on s.id=b.id::text where c.id=_customer_id;
return result;
end $function$
;

revoke all on function public.get_portal_data(uuid) from public,anon;
grant execute on function public.get_portal_data(uuid) to authenticated;
