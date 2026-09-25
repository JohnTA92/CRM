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
