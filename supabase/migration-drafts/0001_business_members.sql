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
