-- Record-keeping only: no payment-provider calls and no invented historic costs.
alter table public.jobs add column labor_cost_source text not null default 'time'
 check(labor_cost_source in ('time','expenses'));
alter table public.time_entries add column labor_hourly_rate numeric;
alter table public.time_entries add constraint labor_rate_valid check(labor_hourly_rate is null or (labor_hourly_rate>=0 and labor_hourly_rate<1000000 and round(labor_hourly_rate,2)=labor_hourly_rate));
create index time_entries_crew_interval_idx on public.time_entries(business_id,crew_member_id,clocked_in_at);

create function private.snapshot_job_labor_rate() returns trigger
language plpgsql security invoker set search_path='' as $$
declare rate numeric;
begin
 if new.job_id is null or new.break_type is not null then new.labor_hourly_rate:=null; return new; end if;
 if new.crew_member_id is null or new.clocked_in_at>now() or (new.clocked_out_at is not null and (new.clocked_out_at<=new.clocked_in_at or new.clocked_out_at>now())) then
  raise exception 'Job time requires a crew member and valid past start/end times.' using errcode='23514';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(new.crew_member_id::text,617));
 if exists(select 1 from public.time_entries t where t.business_id=new.business_id and t.crew_member_id=new.crew_member_id and t.job_id is not null and t.break_type is null and t.id<>new.id
  and tstzrange(t.clocked_in_at,t.clocked_out_at,'[)') && tstzrange(new.clocked_in_at,new.clocked_out_at,'[)')) then
  raise exception 'This employee already has job time in that interval.' using errcode='23514';
 end if;
 if tg_op='UPDATE' and old.job_id is not null and old.crew_member_id is not distinct from new.crew_member_id and old.business_id is not distinct from new.business_id then
  new.labor_hourly_rate:=old.labor_hourly_rate;
 else
  select case when pay_type='hourly' and pay_rate>=0 and pay_rate<1000000 and pay_rate::text not in ('NaN','Infinity','-Infinity') then round(pay_rate,2) end into rate
   from public.crew_members where id=new.crew_member_id and business_id=new.business_id;
  new.labor_hourly_rate:=rate;
 end if;
 return new;
end $$;
revoke all on function private.snapshot_job_labor_rate() from public,anon,authenticated;
create trigger snapshot_job_labor_rate before insert or update on public.time_entries for each row execute function private.snapshot_job_labor_rate();

alter table public.invoices add column refunded_total numeric(10,2) not null default 0;
alter table public.invoice_payments add constraint invoice_payments_refund_parent_key unique(business_id,invoice_id,id);
create table public.invoice_refunds (
 id uuid primary key default gen_random_uuid(),business_id uuid not null,invoice_id uuid not null,payment_id uuid not null,
 amount numeric not null check(amount>0 and amount<100000000 and round(amount,2)=amount and amount::text not in ('NaN','Infinity','-Infinity')),
 method text not null check(method in ('cash','check','card','venmo','zelle','other')),
 reason text not null check(length(trim(reason)) between 1 and 500),
 refunded_at timestamptz not null,created_at timestamptz not null default now(),recorded_by uuid not null,
 foreign key(business_id,invoice_id,payment_id) references public.invoice_payments(business_id,invoice_id,id) on delete restrict
);
create index invoice_refunds_business_invoice_idx on public.invoice_refunds(business_id,invoice_id);
create index invoice_refunds_payment_idx on public.invoice_refunds(payment_id);
alter table public.invoice_refunds enable row level security;
revoke all on public.invoice_refunds from public,anon,authenticated;
grant select,insert on public.invoice_refunds to authenticated;
create policy office_refund_read on public.invoice_refunds for select to authenticated using(business_id in(select business_id from public.business_members where user_id=(select auth.uid())));
create policy owner_refund_insert on public.invoice_refunds for insert to authenticated with check(business_id in(select business_id from public.business_members where user_id=(select auth.uid()) and role='owner'));

create function private.validate_invoice_refund() returns trigger
language plpgsql security invoker set search_path='' as $$
declare payment public.invoice_payments; returned numeric;
begin
 if tg_op<>'INSERT' then raise exception 'Refund history cannot be changed or deleted.' using errcode='23514'; end if;
 if auth.uid() is null or not exists(select 1 from public.business_members where business_id=new.business_id and user_id=auth.uid() and role='owner') then raise exception 'Only a business owner can record refunds.' using errcode='42501'; end if;
 perform 1 from public.invoices where id=new.invoice_id and business_id=new.business_id for update;
 if not found then raise exception 'Invoice unavailable.' using errcode='42501'; end if;
 select * into payment from public.invoice_payments where id=new.payment_id and invoice_id=new.invoice_id and business_id=new.business_id;
 if not found then raise exception 'Payment unavailable.' using errcode='42501'; end if;
 if new.refunded_at is null or new.refunded_at<payment.paid_at or new.refunded_at>now() then raise exception 'Refund date must be after the payment and no later than now.' using errcode='22023'; end if;
 select coalesce(sum(amount),0) into returned from public.invoice_refunds where payment_id=payment.id;
 if new.amount>payment.amount-returned then raise exception 'Refund exceeds the amount remaining on this payment.' using errcode='23514'; end if;
 new.recorded_by:=auth.uid(); new.created_at:=now(); new.reason:=trim(new.reason);
 return new;
end $$;
create trigger validate_refund before insert or update or delete on public.invoice_refunds for each row execute function private.validate_invoice_refund();

create function private.invoice_refunded_total() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 select coalesce(sum(amount),0) into new.refunded_total from public.invoice_refunds where invoice_id=new.id and business_id=new.business_id;
 return new;
end $$;
create trigger zz_invoice_refunded_total before insert or update on public.invoices for each row execute function private.invoice_refunded_total();
create function private.refresh_refund_total() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 update public.invoices set refunded_total=refunded_total where id=new.invoice_id and business_id=new.business_id;
 return new;
end $$;
create trigger refresh_refund_total after insert on public.invoice_refunds for each row execute function private.refresh_refund_total();
revoke all on function private.validate_invoice_refund(),private.invoice_refunded_total(),private.refresh_refund_total() from public,anon,authenticated;

create function public.record_invoice_refund(_invoice_id uuid,_payment_id uuid,_refund_id uuid,_amount numeric,_method text,_reason text,_refunded_at timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare inv public.invoices; prior public.invoice_refunds;
begin
 if auth.uid() is null then raise exception 'Sign in to record a refund.' using errcode='42501'; end if;
 select * into inv from public.invoices where id=_invoice_id for update;
 if not found or not exists(select 1 from public.business_members where business_id=inv.business_id and user_id=auth.uid() and role='owner') then raise exception 'Only a business owner can record refunds.' using errcode='42501'; end if;
 if _refund_id is null or _amount is null or _amount<=0 or _amount>=100000000 or round(_amount,2)<>_amount or _amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter a positive refund with no more than two decimal places.' using errcode='22023'; end if;
 select * into prior from public.invoice_refunds where id=_refund_id;
 if found then
  if prior.invoice_id is distinct from _invoice_id or prior.payment_id is distinct from _payment_id or prior.amount is distinct from _amount or prior.method is distinct from _method or prior.reason is distinct from trim(_reason) or prior.refunded_at is distinct from _refunded_at then raise exception 'This refund reference was already used for different details.' using errcode='23514'; end if;
 else
  insert into public.invoice_refunds(id,business_id,invoice_id,payment_id,amount,method,reason,refunded_at,recorded_by)
   values(_refund_id,inv.business_id,inv.id,_payment_id,_amount,_method,_reason,_refunded_at,auth.uid());
 end if;
 select * into inv from public.invoices where id=_invoice_id;
 return jsonb_build_object('invoice',to_jsonb(inv));
end $$;
revoke all on function public.record_invoice_refund(uuid,uuid,uuid,numeric,text,text,timestamptz) from public,anon;
grant execute on function public.record_invoice_refund(uuid,uuid,uuid,numeric,text,text,timestamptz) to authenticated;

-- Preserve the existing portal authorization and expose only the refund total.
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
 'jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'title',j.title,'status',j.status,'scheduled_date',j.scheduled_date,'scheduled_time',j.scheduled_time,'service_address',j.service_address) order by j.scheduled_date desc),'[]'::jsonb) from public.jobs j where j.customer_id=c.id and j.business_id=bid and j.status<>'draft'),
 'estimates',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'total',e.total,'status',e.status,'created_at',e.created_at,'sent_at',e.sent_at) order by e.created_at desc),'[]'::jsonb) from public.estimates e where e.customer_id=c.id and e.business_id=bid and e.status<>'draft'),
 'invoices',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'total',i.total,'paid_total',i.paid_total,'refunded_total',i.refunded_total,'balance_due',greatest(0,i.total-i.paid_total),'status',i.status,'due_at',i.due_at,'created_at',i.created_at) order by i.created_at desc),'[]'::jsonb) from public.invoices i where i.customer_id=c.id and i.business_id=bid and i.status not in ('draft','voided'))
) into result from public.customers c join public.businesses b on b.id=c.business_id
left join public.company_settings s on s.id=b.id::text where c.id=_customer_id;
return result;
end $function$
;

revoke all on function public.get_portal_data(uuid) from public,anon;
grant execute on function public.get_portal_data(uuid) to authenticated;

create or replace function public.get_customer_document(_kind text,_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; result jsonb; bid uuid; cid uuid; staff boolean; evidence jsonb; saved_snapshot jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to view this document.' using errcode='42501'; end if;
 if _kind='estimate' then select to_jsonb(e) into r from public.estimates e where id=_id;
 elsif _kind='invoice' then select to_jsonb(i) into r from public.invoices i where id=_id;
 else raise exception 'Invalid document type.' using errcode='22023'; end if;
 if r is null then raise exception 'Document unavailable.' using errcode='42501'; end if;
 bid:=(r->>'business_id')::uuid; cid:=(r->>'customer_id')::uuid;
 staff:=exists(select 1 from public.business_members m where m.business_id=bid and m.user_id=auth.uid());
 if not staff and (r->>'status'='draft' or (_kind='invoice' and r->>'status'='voided') or not exists(
  select 1 from public.customer_portal_access a where a.user_id=auth.uid() and a.business_id=bid and a.customer_id=cid and a.revoked_at is null and a.expires_at>now()
 )) then raise exception 'Document unavailable.' using errcode='42501'; end if;
 if _kind='estimate' then
  select snapshot into saved_snapshot from private.estimate_decisions where estimate_id=_id;
  select jsonb_build_object('decision',d.decision,'signer_name',d.signer_name,'decided_at',d.decided_at,'revision',d.revision) into evidence from private.estimate_decisions d where d.estimate_id=_id;
 end if;
 select jsonb_build_object(
  'id',_id,'kind',_kind,'status',r->>'status','created_at',r->>'created_at','sent_at',r->>'sent_at',
  'expires_at',r->>'expires_at','due_at',r->>'due_at','line_items',r->'line_items','notes',r->>'notes',
  'total',(r->>'total')::numeric,'paid_total',coalesce((r->>'paid_total')::numeric,0),
  'refunded_total',coalesce((r->>'refunded_total')::numeric,0),
  'balance_due',greatest(0,(r->>'total')::numeric-coalesce((r->>'paid_total')::numeric,0)),
  'business_name',coalesce(s.business_name,b.name),'contact_email',s.contact_email,'contact_phone',coalesce(s.contact_phone,s.phone),
  'customer_name',c.name,'customer_address',concat_ws(', ',nullif(c.address,''),nullif(c.city,''),nullif(c.state,''),nullif(c.zip,'')),
  'service_address',(select j.service_address from public.jobs j where j.id=(r->>'job_id')::uuid and j.business_id=bid and j.customer_id=cid)
 ) into result from public.customers c join public.businesses b on b.id=bid
 left join public.company_settings s on s.id=bid::text where c.id=cid and c.business_id=bid;
 if result is null then raise exception 'Document unavailable.' using errcode='42501'; end if;
 if saved_snapshot is not null then result:=(saved_snapshot-'revision'-'decision'-'can_decide') || jsonb_build_object('status',r->>'status'); end if;
 return result || jsonb_build_object('revision',md5(result::text),'decision',evidence,'can_decide',
  _kind='estimate' and not staff and evidence is null and r->>'status'='sent'
  and ((r->>'expires_at') is null or (r->>'expires_at')::timestamptz>now()));
end $$;
revoke all on function public.get_customer_document(text,uuid) from public,anon;
grant execute on function public.get_customer_document(text,uuid) to authenticated;


create function public.record_job_time(_job_id uuid,_crew_id uuid,_entry_id uuid,_start timestamptz,_end timestamptz) returns public.time_entries
language plpgsql security invoker set search_path='' as $$
declare j public.jobs; prior public.time_entries;
begin
 if auth.uid() is null then raise exception 'Sign in to record job time.' using errcode='42501'; end if;
 select * into j from public.jobs where id=_job_id;
 if not found or not exists(select 1 from public.business_members where business_id=j.business_id and user_id=auth.uid()) then raise exception 'Job unavailable.' using errcode='42501'; end if;
 if _entry_id is null or _start is null or _end is null then raise exception 'Choose an employee and enter start and end times.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(_crew_id::text,617));
 select * into prior from public.time_entries where id=_entry_id;
 if found then
  if prior.business_id is distinct from j.business_id or prior.job_id is distinct from _job_id or prior.crew_member_id is distinct from _crew_id or prior.clocked_in_at is distinct from _start or prior.clocked_out_at is distinct from _end or prior.break_type is not null then raise exception 'This time reference was already used for different details.' using errcode='23514'; end if;
  return prior;
 end if;
 insert into public.time_entries(id,business_id,job_id,crew_member_id,clocked_in_at,clocked_out_at)
 values(_entry_id,j.business_id,j.id,_crew_id,_start,_end) returning * into prior;
 return prior;
end $$;
revoke all on function public.record_job_time(uuid,uuid,uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.record_job_time(uuid,uuid,uuid,timestamptz,timestamptz) to authenticated;
