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
grant select, update on public.businesses to authenticated;

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
