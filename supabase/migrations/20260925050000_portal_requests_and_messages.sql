-- 20260925050000_portal_requests_and_messages.sql
-- PREPARED, NOT APPLIED. Extends the canonical foundation
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

-- ── service_requests ──────────────────────────────────────────────────────────
create policy "staff full access to their business's service requests"
  on service_requests for all to authenticated
  using (business_id in (select business_id from business_members where user_id = (select auth.uid())))
  with check (business_id in (select business_id from business_members where user_id = (select auth.uid())));

create policy "portal customers can submit their own service requests"
  on service_requests for insert to authenticated
  with check (
    exists (
      select 1 from customer_portal_access cpa
      where cpa.user_id = (select auth.uid())
        and cpa.customer_id = service_requests.customer_id
        and cpa.business_id = service_requests.business_id
        and cpa.revoked_at is null and cpa.expires_at > now()
    )
  );

create policy "portal customers can view their own service requests"
  on service_requests for select to authenticated
  using (
    exists (
      select 1 from customer_portal_access cpa
      where cpa.user_id = (select auth.uid())
        and cpa.customer_id = service_requests.customer_id
        and cpa.revoked_at is null and cpa.expires_at > now()
    )
  );

-- ── portal_messages ───────────────────────────────────────────────────────────
create policy "staff full access to their business's portal messages"
  on portal_messages for all to authenticated
  using (business_id in (select business_id from business_members where user_id = (select auth.uid())))
  with check (business_id in (select business_id from business_members where user_id = (select auth.uid())));

create policy "portal customers can send messages as themselves"
  on portal_messages for insert to authenticated
  with check (
    sender = 'customer'
    and exists (
      select 1 from customer_portal_access cpa
      where cpa.user_id = (select auth.uid())
        and cpa.customer_id = portal_messages.customer_id
        and cpa.business_id = portal_messages.business_id
        and cpa.revoked_at is null and cpa.expires_at > now()
    )
  );

create policy "portal customers can view their own message thread"
  on portal_messages for select to authenticated
  using (
    exists (
      select 1 from customer_portal_access cpa
      where cpa.user_id = (select auth.uid())
        and cpa.customer_id = portal_messages.customer_id
        and cpa.revoked_at is null and cpa.expires_at > now()
    )
  );

-- ── job_schedule_requests ─────────────────────────────────────────────────────
create policy "staff full access to their business's schedule requests"
  on job_schedule_requests for all to authenticated
  using (business_id in (select business_id from business_members where user_id = (select auth.uid())))
  with check (business_id in (select business_id from business_members where user_id = (select auth.uid())));

create policy "portal customers can submit their own schedule requests"
  on job_schedule_requests for insert to authenticated
  with check (
    exists (
      select 1 from customer_portal_access cpa
      where cpa.user_id = (select auth.uid())
        and cpa.customer_id = job_schedule_requests.customer_id
        and cpa.business_id = job_schedule_requests.business_id
        and cpa.revoked_at is null and cpa.expires_at > now()
    )
    -- the referenced job (if any) must actually belong to this same customer —
    -- otherwise a customer could request a reschedule against someone else's job.
    and (
      job_schedule_requests.job_id is null
      or exists (
        select 1 from jobs j
        where j.id = job_schedule_requests.job_id
          and j.customer_id = job_schedule_requests.customer_id
          and j.business_id = job_schedule_requests.business_id
      )
    )
  );

create policy "portal customers can view their own schedule requests"
  on job_schedule_requests for select to authenticated
  using (
    exists (
      select 1 from customer_portal_access cpa
      where cpa.user_id = (select auth.uid())
        and cpa.customer_id = job_schedule_requests.customer_id
        and cpa.revoked_at is null and cpa.expires_at > now()
    )
  );
