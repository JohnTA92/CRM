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
