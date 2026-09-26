-- Service writes only; staff may read their business's delivery history.
create table public.customer_email_deliveries (
 id uuid primary key, business_id uuid not null references public.businesses(id),
 actor_id uuid not null, kind text not null check(kind in ('estimate','invoice')),
 record_id uuid not null, recipient text not null,
 status text not null default 'processing' check(status in ('processing','accepted','failed','unknown')),
 provider_id text, error_code text, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.customer_email_deliveries enable row level security;
revoke all on public.customer_email_deliveries from public,anon,authenticated;
grant select on public.customer_email_deliveries to authenticated;
grant select,insert,update on public.customer_email_deliveries to service_role;
create policy email_history_staff on public.customer_email_deliveries for select to authenticated
using(exists(select 1 from public.business_members m where m.user_id=(select auth.uid()) and m.business_id=customer_email_deliveries.business_id));
create index customer_email_history on public.customer_email_deliveries(business_id,created_at desc);

-- Called exclusively by the authenticated edge handler through its service client.
create function public.claim_customer_email(_id uuid,_actor uuid,_kind text,_record uuid,_recipient text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare bid uuid; cid uuid; st text; recipient text; prior public.customer_email_deliveries;
begin
 if _kind='invoice' then select business_id,customer_id,status into bid,cid,st from public.invoices where id=_record;
 elsif _kind='estimate' then select business_id,customer_id,status into bid,cid,st from public.estimates where id=_record;
 else raise exception 'Invalid email type'; end if;
 if bid is null or not exists(select 1 from public.business_members where business_id=bid and user_id=_actor) then raise exception 'Document unavailable' using errcode='42501'; end if;
 -- Serialize per business so concurrent calls cannot bypass the rate limit.
 perform 1 from public.businesses where id=bid for update;
 select * into prior from public.customer_email_deliveries where id=_id;
 if found then
  if (prior.business_id,prior.actor_id,prior.kind,prior.record_id) is distinct from (bid,_actor,_kind,_record) then raise exception 'Invalid retry' using errcode='42501'; end if;
  return to_jsonb(prior)||jsonb_build_object('claimed',false);
 end if;
 if (_kind='estimate' and st<>'sent') or (_kind='invoice' and st not in ('sent','overdue','paid')) then raise exception 'Publish this document before emailing it'; end if;
 select lower(trim(email)) into recipient from public.customers where id=cid and business_id=bid;
 if recipient is null or recipient<>lower(trim(_recipient)) then raise exception 'Customer email changed. Refresh before sending'; end if;
 if exists(select 1 from public.customer_email_deliveries where business_id=bid and kind=_kind and record_id=_record and status in ('processing','unknown')) then raise exception 'An earlier email attempt needs its outcome checked before resending'; end if;
 if (select count(*) from public.customer_email_deliveries where business_id=bid and created_at>now()-interval '1 hour')>=50
 or exists(select 1 from public.customer_email_deliveries where business_id=bid and kind=_kind and record_id=_record and created_at>now()-interval '1 minute') then raise exception 'Email rate limit reached. Please wait before sending again'; end if;
 insert into public.customer_email_deliveries(id,business_id,actor_id,kind,record_id,recipient)
 values(_id,bid,_actor,_kind,_record,recipient) returning * into prior;
 return to_jsonb(prior)||jsonb_build_object('claimed',true);
end $$;
revoke all on function public.claim_customer_email(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_customer_email(uuid,uuid,text,uuid,text) to service_role;
