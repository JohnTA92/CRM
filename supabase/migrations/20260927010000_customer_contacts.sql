-- Additional (secondary) contacts for a customer, e.g. a property manager. No
-- delete/merge path is exposed by the app yet — editing fields in place is the
-- only correction path for now; that is a deliberate, current limitation.
create table public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  customer_id uuid not null,
  role text,
  name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  constraint customer_contacts_name_not_blank check (btrim(name) <> ''),
  constraint customer_contacts_role_length check (role is null or length(role) <= 80),
  constraint customer_contacts_name_length check (length(name) <= 120)
);

alter table public.customer_contacts enable row level security;
revoke all on public.customer_contacts from public, anon, authenticated;
grant select, insert, update, delete on public.customer_contacts to authenticated;

-- Same business-membership scoping as every other customer-adjacent table
-- (customers, customer_properties) — see staff_business_access in
-- 20260925033819_security_and_private_storage.sql. The app does not currently
-- expose a delete action, but the grant/policy shape matches house convention.
create policy staff_business_access on public.customer_contacts for all to authenticated
  using (business_id in (select business_id from public.business_members where user_id = (select auth.uid())))
  with check (business_id in (select business_id from public.business_members where user_id = (select auth.uid())));

create index customer_contacts_customer_idx on public.customer_contacts (business_id, customer_id);

-- Tenant consistency: a contact can only be attached to a customer in the same business.
alter table public.customer_contacts add constraint customer_contacts_customer_tenant_fk
  foreign key (business_id, customer_id) references public.customers (business_id, id);
