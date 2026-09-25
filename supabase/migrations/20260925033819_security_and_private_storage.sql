-- Preserve unowned legacy rows for review; deny access rather than guess ownership.
do $$
declare t text; p record;
begin
  foreach t in array array['expenses','services','job_media','crew_members','invoice_payments','time_entries','customer_properties'] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I', p.policyname,t);
    end loop;
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
    execute format('create policy staff_business_access on public.%I for all to authenticated using (business_id in (select business_id from public.business_members where user_id=(select auth.uid()))) with check (business_id in (select business_id from public.business_members where user_id=(select auth.uid())))',t);
    execute format('create index if not exists %I on public.%I (business_id)',t||'_business_scope_idx',t);
    -- NOT VALID preserves historical unowned rows, but prevents any new ones.
    execute format('alter table public.%I add constraint %I check (business_id is not null) not valid',t,t||'_business_required');
  end loop;
end $$;

-- A service key is unique within a business, not across every customer business.
alter table public.services drop constraint services_value_key;
alter table public.services add constraint services_business_value_key unique (business_id,value);

-- The crew editor already exposes these fields, but the database lacked them.
alter table public.crew_members add column if not exists pay_type text;
alter table public.crew_members add column if not exists pay_rate numeric;
alter table public.crew_members add constraint crew_pay_type_valid check (pay_type is null or pay_type in ('hourly','salary'));
alter table public.crew_members add constraint crew_pay_rate_valid check (pay_rate is null or pay_rate >= 0);

-- Composite references stop a valid business member attaching another business's
-- customer, job, estimate, invoice or employee ID to a row they control.
do $$
declare t text; r record;
begin
  foreach t in array array['customers','jobs','estimates','invoices','crew_members'] loop
    execute format('alter table public.%I add constraint %I unique (business_id,id)',t,t||'_business_id_id_key');
  end loop;
  for r in select * from (values
    ('jobs','customer_id','customers'),('jobs','estimate_id','estimates'),('jobs','invoice_id','invoices'),
    ('estimates','customer_id','customers'),('estimates','job_id','jobs'),
    ('invoices','customer_id','customers'),('invoices','job_id','jobs'),('invoices','estimate_id','estimates'),
    ('customer_properties','customer_id','customers'),('expenses','job_id','jobs'),
    ('job_media','job_id','jobs'),('job_media','customer_id','customers'),
    ('invoice_payments','invoice_id','invoices'),('time_entries','job_id','jobs'),('time_entries','crew_member_id','crew_members')
  ) as refs(tbl,col,parent) loop
    execute format('alter table public.%I add constraint %I foreign key (business_id,%I) references public.%I (business_id,id) not valid',r.tbl,r.tbl||'_'||r.col||'_tenant_fk',r.col,r.parent);
  end loop;
end $$;

create or replace function private.validate_job_crew() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if exists (
    select 1 from unnest(new.crew_member_ids) cid
    where not exists (select 1 from public.crew_members c where c.id=cid and c.business_id=new.business_id)
  ) then raise exception 'Every assigned crew member must belong to this business' using errcode='23514'; end if;
  return new;
end $$;
revoke all on function private.validate_job_crew() from public,anon,authenticated;
create trigger validate_job_crew before insert or update of crew_member_ids,business_id on public.jobs
for each row execute function private.validate_job_crew();

-- Empty at rollout: there are no existing storage objects to move.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('job-media','job-media',false,52428800,array['image/jpeg','image/png','image/webp','image/gif','image/heic','video/mp4','video/quicktime','video/webm']),
       ('expense-receipts','expense-receipts',false,10485760,array['image/jpeg','image/png','image/webp','image/gif','image/heic'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "allow reads" on storage.objects;
drop policy if exists "allow uploads" on storage.objects;
drop policy if exists "allow deletes" on storage.objects;

-- Paths always begin with business UUID. No unsafe text-to-UUID casts.
create policy crm_files_read on storage.objects for select to authenticated using (
  bucket_id in ('job-media','expense-receipts') and
  (storage.foldername(name))[1] in (select business_id::text from public.business_members where user_id=(select auth.uid()))
);
create policy crm_files_insert on storage.objects for insert to authenticated with check (
  bucket_id in ('job-media','expense-receipts') and
  (storage.foldername(name))[1] in (select business_id::text from public.business_members where user_id=(select auth.uid()))
);
create policy crm_files_update on storage.objects for update to authenticated using (
  bucket_id in ('job-media','expense-receipts') and
  (storage.foldername(name))[1] in (select business_id::text from public.business_members where user_id=(select auth.uid()))
) with check (
  bucket_id in ('job-media','expense-receipts') and
  (storage.foldername(name))[1] in (select business_id::text from public.business_members where user_id=(select auth.uid()))
);
create policy crm_files_delete on storage.objects for delete to authenticated using (
  bucket_id in ('job-media','expense-receipts') and
  (storage.foldername(name))[1] in (select business_id::text from public.business_members where user_id=(select auth.uid()))
);
