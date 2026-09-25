-- Private immutable evidence. Clients access only the scoped functions below.
create table private.estimate_decisions (
 estimate_id uuid primary key references public.estimates(id) on delete restrict,
 business_id uuid not null, customer_id uuid not null, actor_id uuid not null,
 decision text not null check(decision in ('approved','declined')),
 signer_name text not null check(length(trim(signer_name)) between 1 and 200),
 decided_at timestamptz not null default now(), revision text not null, snapshot jsonb not null
);
alter table private.estimate_decisions enable row level security;
revoke all on private.estimate_decisions from public,anon,authenticated;

create function public.get_customer_document(_kind text,_id uuid) returns jsonb
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

create function public.decide_customer_estimate(_estimate_id uuid,_decision text,_signer_name text,_revision text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.estimates; d private.estimate_decisions; document jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to respond.' using errcode='42501'; end if;
 if _decision not in ('approved','declined') or _decision is null or nullif(trim(_signer_name),'') is null or length(trim(_signer_name))>200 then raise exception 'Choose a decision and enter your name.' using errcode='22023'; end if;
 select * into e from public.estimates where id=_estimate_id for update;
 if not found then raise exception 'Estimate unavailable.' using errcode='42501'; end if;
 if exists(select 1 from public.business_members where user_id=auth.uid() and business_id=e.business_id) then raise exception 'Staff cannot submit a customer decision. Use the customer login.' using errcode='42501'; end if;
 -- Lock access until commit, so a concurrent revoke cannot pass this check silently.
 perform 1 from public.customer_portal_access a where a.user_id=auth.uid() and a.customer_id=e.customer_id and a.business_id=e.business_id and a.revoked_at is null and a.expires_at>now() for share;
 if not found then raise exception 'Customer access expired or was revoked.' using errcode='42501'; end if;
 select * into d from private.estimate_decisions where estimate_id=e.id;
 if found then
  if d.actor_id=auth.uid() and d.decision=_decision and d.revision=_revision and d.signer_name=trim(_signer_name) then return public.get_customer_document('estimate',e.id); end if;
  raise exception 'This estimate already has a recorded decision. Refresh to view it.' using errcode='23514';
 end if;
 if e.status<>'sent' or (e.expires_at is not null and e.expires_at<=now()) then raise exception 'This estimate is not open for a decision.' using errcode='23514'; end if;
 if e.total<=0 or jsonb_array_length(e.line_items)=0 then raise exception 'Ask the business to provide a priced estimate first.' using errcode='23514'; end if;
 document:=public.get_customer_document('estimate',e.id);
 if _revision is distinct from document->>'revision' then raise exception 'The estimate changed. Close and reopen it to review the latest version.' using errcode='40001'; end if;
 update public.estimates set status=_decision where id=e.id;
 insert into private.estimate_decisions(estimate_id,business_id,customer_id,actor_id,decision,signer_name,revision,snapshot)
 values(e.id,e.business_id,e.customer_id,auth.uid(),_decision,trim(_signer_name),_revision,document);
 return public.get_customer_document('estimate',e.id);
end $$;
revoke all on function public.decide_customer_estimate(uuid,text,text,text) from public,anon;
grant execute on function public.decide_customer_estimate(uuid,text,text,text) to authenticated;

-- A decision cannot be attached to subsequently changed prices, terms or ownership.
-- Job linking remains allowed so an approved estimate can be converted to work.
create function private.protect_decided_estimate() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.estimate_decisions where estimate_id=old.id) and
 (new.business_id,new.customer_id,new.line_items,new.total,new.notes,new.status,new.expires_at,new.service_type,new.tier)
 is distinct from (old.business_id,old.customer_id,old.line_items,old.total,old.notes,old.status,old.expires_at,old.service_type,old.tier)
 then raise exception 'This estimate has a customer decision. Create a new estimate for revised work.' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function private.protect_decided_estimate() from public,anon,authenticated;
create trigger zz_protect_decided_estimate before update on public.estimates for each row execute function private.protect_decided_estimate();
