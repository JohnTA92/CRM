-- 0001_business_members.sql
-- PREPARED, NOT APPLIED. Review and run manually (Supabase SQL editor or CLI).
--
-- Introduces a real membership model instead of hardcoding `owner_id = auth.uid()`
-- everywhere. Backfilled from `businesses.owner_id`, which is the one link that IS
-- reliable in the current data (every business row has a real owner_id) — this is
-- NOT a guess, unlike the null business_id situation on customers/jobs/etc. covered
-- in 0003.
--
-- This does not change any existing behavior yet — it only creates the table and
-- seeds it. RLS is not touched until 0004, after this and 0002 exist.

create table if not exists business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index if not exists business_members_business_id_idx on business_members(business_id);
create index if not exists business_members_user_id_idx on business_members(user_id);

alter table business_members enable row level security;

-- Members can see the other members of their own business (needed later for a
-- staff-management UI); nobody can see membership rows for a business they're not
-- in. No INSERT/UPDATE/DELETE policy for authenticated users — membership is
-- managed server-side (service role) only, e.g. by a future "invite a teammate" edge
-- function, mirroring how admin app_metadata is only ever changed via service role.
create policy "members can view their own business's membership"
  on business_members for select
  to authenticated
  using (user_id = (select auth.uid()));
revoke all on business_members from anon, authenticated;
grant select on business_members to authenticated;
grant all on business_members to service_role;


-- Backfill: every existing business's owner becomes a role='owner' member.
-- This is safe because `businesses.owner_id` already exists and is unambiguous —
-- it is not the same situation as the null business_id rows on customers/jobs/etc.
insert into business_members (business_id, user_id, role)
select b.id, b.owner_id, 'owner'
from businesses b
where b.owner_id is not null
on conflict (business_id, user_id) do nothing;
-- 0002_customer_portal_access.sql
-- PREPARED, NOT APPLIED. Depends on 0001 (references businesses only, no ordering
-- issue there, but keep this numbering so the whole sequence applies cleanly).
--
-- This is the authorization source-of-truth for portal customer sessions. RLS
-- policies (0004) and the SECURITY DEFINER functions (0005) check this table live,
-- per-request — not a JWT claim — so revoking a row or letting it expire takes
-- effect on the very next request, with no caching to worry about.

create table if not exists customer_portal_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz
);

create index if not exists customer_portal_access_user_id_idx on customer_portal_access(user_id);
create index if not exists customer_portal_access_customer_id_idx on customer_portal_access(customer_id);
create index if not exists customer_portal_access_business_id_idx on customer_portal_access(business_id);

alter table customer_portal_access enable row level security;

-- No SELECT/INSERT/UPDATE policy for the `authenticated` role at all. A portal
-- customer must never be able to read or edit their own (or anyone else's) access
-- grant row directly — e.g. to extend their own expiry or forge another customer_id.
-- Reads happen only through the SECURITY DEFINER functions in 0005, which check
-- this table internally with elevated privilege. Writes happen only via the
-- `portal-invite` Edge Function using the service role.
--
-- Staff CAN see (read-only) the active grants for their own business's customers,
-- so the "Send Portal Invite" UI can show expiry/revoked state without needing a
-- service-role round trip for every render.
create policy "staff can view portal access grants for their business"
  on customer_portal_access for select to authenticated
  using (
    exists (
      select 1 from business_members bm
      where bm.user_id = auth.uid()
        and bm.business_id = customer_portal_access.business_id
    )
  );

revoke all on customer_portal_access from anon, authenticated;
grant select on customer_portal_access to authenticated;
grant all on customer_portal_access to service_role;
-- Core CRM records are staff-only. Customer reads use explicitly authorized,
-- allowlisted RPCs in 0005, never unrestricted table columns.
do $$ declare pol record; begin
if exists(select 1 from customers where business_id is null)
 or exists(select 1 from jobs where business_id is null)
 or exists(select 1 from invoices where business_id is null)
 or exists(select 1 from estimates where business_id is null) then
 raise exception 'Resolve unassigned business records before restricting access'; end if;
for pol in select tablename,policyname from pg_policies where schemaname='public'
 and tablename in ('customers','jobs','invoices','estimates') loop
 execute format('drop policy %I on public.%I',pol.policyname,pol.tablename);
end loop; end $$;
alter table public.customers enable row level security;
revoke all on public.customers from anon, authenticated;
grant select,insert,update,delete on public.customers to authenticated;
create policy staff_business_access on public.customers for all to authenticated
using (business_id in (select business_id from public.business_members where user_id=(select auth.uid())))
with check (business_id in (select business_id from public.business_members where user_id=(select auth.uid())));
alter table public.jobs enable row level security;
revoke all on public.jobs from anon, authenticated;
grant select,insert,update,delete on public.jobs to authenticated;
create policy staff_business_access on public.jobs for all to authenticated
using (business_id in (select business_id from public.business_members where user_id=(select auth.uid())))
with check (business_id in (select business_id from public.business_members where user_id=(select auth.uid())));
alter table public.invoices enable row level security;
revoke all on public.invoices from anon, authenticated;
grant select,insert,update,delete on public.invoices to authenticated;
create policy staff_business_access on public.invoices for all to authenticated
using (business_id in (select business_id from public.business_members where user_id=(select auth.uid())))
with check (business_id in (select business_id from public.business_members where user_id=(select auth.uid())));
alter table public.estimates enable row level security;
revoke all on public.estimates from anon, authenticated;
grant select,insert,update,delete on public.estimates to authenticated;
create policy staff_business_access on public.estimates for all to authenticated
using (business_id in (select business_id from public.business_members where user_id=(select auth.uid())))
with check (business_id in (select business_id from public.business_members where user_id=(select auth.uid())));
-- Explicit authorization plus allowlisted output; no direct customer table access.
alter table public.company_settings add column if not exists contact_phone text,
add column if not exists contact_email text, add column if not exists portal_welcome_message text;
create or replace function public.get_portal_data(_customer_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
 'invoices',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'total',i.total,'status',i.status,'due_at',i.due_at,'created_at',i.created_at) order by i.created_at desc),'[]'::jsonb) from public.invoices i where i.customer_id=c.id and i.business_id=bid and i.status not in ('draft','voided'))
) into result from public.customers c join public.businesses b on b.id=c.business_id
left join public.company_settings s on s.id=b.id::text where c.id=_customer_id;
return result;
end $$;
revoke all on function public.get_portal_data(uuid) from public,anon;
grant execute on function public.get_portal_data(uuid) to authenticated;

