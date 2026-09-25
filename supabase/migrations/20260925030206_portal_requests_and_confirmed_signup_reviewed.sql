-- 20260925040000_business_membership_lookup.sql
-- PREPARED, NOT APPLIED. Extends the canonical, already-applied
-- 20260925022819_portal_access_foundation_reviewed.sql — does not touch or
-- duplicate any of that migration's work.
--
-- Gap this closes: `business_members` (from the applied migration) is the
-- authorization source of truth for customers/jobs/invoices/estimates, but
-- `businesses` and `company_settings` themselves were left on their prior,
-- owner_id-only policies. That means a future staff member (a `business_members`
-- row with role='staff', not the business's `owner_id`) could read the business's
-- CRM data but NOT the `businesses`/`company_settings` rows themselves — and the
-- frontend (`src/lib/auth.tsx`) derives the whole app's `business` context by
-- querying `businesses` directly by `owner_id`, so a staff member would see
-- everything as if they had no business at all. This migration, plus the paired
-- `src/lib/auth.tsx` change, fixes the lookup — it does not yet add any UI/edge
-- function to actually invite a staff member into `business_members`; that is
-- still a separate, not-yet-built follow-up (see phase report).
--
-- Read access is opened to any member (owner or staff). Write access to the core
-- `businesses` row (name, subscription/Stripe fields) stays owner-only — staff
-- should not be able to change billing or ownership-level settings. Staff CAN
-- update `company_settings` (branding/contact/hours-type operational settings);
-- `company_settings` never stores Stripe secrets in a client-writable way (Stripe
-- fields there are only ever written server-side by edge functions using the
-- service role, unaffected by this table's client-facing RLS).

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'businesses'
  loop
    execute format('drop policy %I on public.businesses', pol.policyname);
  end loop;
end $$;

alter table public.businesses enable row level security;
revoke all on public.businesses from anon, authenticated;
grant select on public.businesses to authenticated;
grant update (name, onboarding_complete) on public.businesses to authenticated;

create policy "members can view their business"
  on public.businesses for select to authenticated
  using (
    id in (select business_id from public.business_members where user_id = (select auth.uid()))
  );

create policy "owners can update their business"
  on public.businesses for update to authenticated
  using (
    id in (select business_id from public.business_members where user_id = (select auth.uid()) and role = 'owner')
  )
  with check (
    id in (select business_id from public.business_members where user_id = (select auth.uid()) and role = 'owner')
  );

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'company_settings'
  loop
    execute format('drop policy %I on public.company_settings', pol.policyname);
  end loop;
end $$;

alter table public.company_settings enable row level security;
revoke all on public.company_settings from anon, authenticated;
grant select, insert, update on public.company_settings to authenticated;

-- company_settings.id is stored as text (matches business_id::text — see the
-- applied get_portal_data function, which already relies on this same cast).
create policy "members can view and edit their business settings"
  on public.company_settings for all to authenticated
  using (
    id in (select business_id::text from public.business_members where user_id = (select auth.uid()))
  )
  with check (
    id in (select business_id::text from public.business_members where user_id = (select auth.uid()))
  );

-- Provision atomically after email confirmation, never from an unauthenticated
-- browser. User metadata supplies only a display name, never a role or owner ID.
create schema if not exists private;
create or replace function private.provision_confirmed_business()
returns trigger language plpgsql security definer set search_path = '' as $$
declare business uuid; business_name text;
begin
  business_name=nullif(btrim(new.raw_user_meta_data->>'business_name'),'');
  if new.email_confirmed_at is null or business_name is null
     or coalesce((new.raw_app_meta_data->>'portal_only')='true',false) then return new; end if;
  if exists(select 1 from public.business_members where user_id=new.id) then return new; end if;
  insert into public.businesses(owner_id,name) values(new.id,left(business_name,200)) returning id into business;
  insert into public.business_members(business_id,user_id,role) values(business,new.id,'owner');
  insert into public.company_settings(id,business_name) values(business::text,left(business_name,200));
  return new;
end;
$$;
revoke all on function private.provision_confirmed_business() from public,anon,authenticated;
create trigger provision_confirmed_business after insert or update of email_confirmed_at on auth.users
for each row execute function private.provision_confirmed_business();

-- 20260925050000_portal_requests_and_messages.sql
-- Reviewed migration. Extends the canonical foundation
-- (20260925022819_portal_access_foundation_reviewed.sql) and
-- 20260925040000_business_membership_lookup.sql. Phase 2: service requests,
-- messaging, and reschedule/cancellation requests (features #4 and #6).
--
-- All three tables follow the same authorization shape already established for
-- customers/jobs/invoices/estimates: staff (business_members) get full CRUD
-- scoped to their business; portal customers get INSERT (their own customer_id
-- only, validated against a live, non-expired, non-revoked customer_portal_access
-- row — never a client-supplied claim) and SELECT of their own rows only. Portal
-- customers never get UPDATE/DELETE here — status changes are staff-only actions
-- performed from the CRM.

create table if not exists service_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  description text not null,
  requested_service_type text,
  preferred_date date,
  preferred_time text,
  status text not null default 'new' check (status in ('new', 'reviewed', 'scheduled', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_requests_business_id_idx on service_requests(business_id);
create index if not exists service_requests_customer_id_idx on service_requests(customer_id);

create table if not exists portal_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  sender text not null check (sender in ('customer', 'staff')),
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists portal_messages_business_id_idx on portal_messages(business_id);
create index if not exists portal_messages_customer_id_idx on portal_messages(customer_id);

create table if not exists job_schedule_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  request_type text not null check (request_type in ('reschedule', 'cancel')),
  requested_date date,
  requested_time text,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now()
);
create index if not exists job_schedule_requests_business_id_idx on job_schedule_requests(business_id);
create index if not exists job_schedule_requests_customer_id_idx on job_schedule_requests(customer_id);
create index if not exists job_schedule_requests_job_id_idx on job_schedule_requests(job_id);

alter table service_requests enable row level security;
alter table portal_messages enable row level security;
alter table job_schedule_requests enable row level security;

revoke all on service_requests from anon, authenticated;
revoke all on portal_messages from anon, authenticated;
revoke all on job_schedule_requests from anon, authenticated;
grant select, insert, update, delete on service_requests to authenticated;
grant select, insert, update, delete on portal_messages to authenticated;
grant select, insert, update, delete on job_schedule_requests to authenticated;
grant all on service_requests, portal_messages, job_schedule_requests to service_role;


-- Internal authorization lookup: callers can only ask about their own live grant.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create or replace function private.has_portal_access(customer uuid, business uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.customer_portal_access a
    join public.customers c on c.id=a.customer_id and c.business_id=a.business_id
    where a.user_id=auth.uid() and a.customer_id=customer and a.business_id=business
      and a.revoked_at is null and a.expires_at>now()
  );
$$;
revoke all on function private.has_portal_access(uuid,uuid) from public, anon;
grant execute on function private.has_portal_access(uuid,uuid) to authenticated;

create policy staff_access on public.service_requests for all to authenticated
using (business_id in (select business_id from public.business_members where user_id=(select auth.uid())))
with check (business_id in (select business_id from public.business_members where user_id=(select auth.uid())));
create policy customer_read on public.service_requests for select to authenticated
using (private.has_portal_access(customer_id,business_id));
create policy customer_insert on public.service_requests for insert to authenticated
with check (status='new' and private.has_portal_access(customer_id,business_id));

create policy staff_access on public.portal_messages for all to authenticated
using (business_id in (select business_id from public.business_members where user_id=(select auth.uid())))
with check (business_id in (select business_id from public.business_members where user_id=(select auth.uid())));
create policy customer_read on public.portal_messages for select to authenticated
using (private.has_portal_access(customer_id,business_id));
create policy customer_insert on public.portal_messages for insert to authenticated
with check (sender='customer' and read_at is null and private.has_portal_access(customer_id,business_id));

create policy staff_access on public.job_schedule_requests for all to authenticated
using (business_id in (select business_id from public.business_members where user_id=(select auth.uid())))
with check (business_id in (select business_id from public.business_members where user_id=(select auth.uid())));
create policy customer_read on public.job_schedule_requests for select to authenticated
using (private.has_portal_access(customer_id,business_id));
create policy customer_insert on public.job_schedule_requests for insert to authenticated
with check (status='pending' and private.has_portal_access(customer_id,business_id));

-- Derive tenant from customer; enforce parent consistency even for staff writes.
create or replace function private.validate_portal_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and (new.customer_id<>old.customer_id or new.business_id<>old.business_id) then
    raise exception 'Request ownership cannot be changed';
  end if;
  select business_id into new.business_id from public.customers where id=new.customer_id;
  if new.business_id is null then raise exception 'Customer has no business'; end if;
  if tg_op='INSERT' then new.created_at=now(); end if;
  if tg_table_name='service_requests' then
    if length(btrim(new.description))=0 then raise exception 'Describe the service needed'; end if;
    new.updated_at=now();
  elsif tg_table_name='portal_messages' then
    if length(btrim(new.body))=0 then raise exception 'Message cannot be empty'; end if;
  elsif tg_table_name='job_schedule_requests' then
    if (tg_op='INSERT' and new.job_id is null) or (new.job_id is not null and not exists (
      select 1 from public.jobs j where j.id=new.job_id and j.customer_id=new.customer_id
        and j.business_id=new.business_id and j.status<>'draft'
    )) then raise exception 'Job does not belong to this customer'; end if;
    if new.request_type='reschedule' and new.requested_date is null then
      raise exception 'Choose a requested date';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_portal_request() from public,anon,authenticated;
create trigger validate_service_request before insert or update on public.service_requests
for each row execute function private.validate_portal_request();
create trigger validate_portal_message before insert or update on public.portal_messages
for each row execute function private.validate_portal_request();
create trigger validate_schedule_request before insert or update on public.job_schedule_requests
for each row execute function private.validate_portal_request();
