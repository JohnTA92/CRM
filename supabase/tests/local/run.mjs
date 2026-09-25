import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../../', import.meta.url));
const db=new PGlite();
try {
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create schema private; create schema storage;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth,private,storage to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to anon,authenticated;
create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
`);
await db.exec(readFileSync(new URL('./schema.sql', import.meta.url),'utf8'));
for (const t of ['businesses','business_members','customers','jobs','estimates','invoices','invoice_payments']) await db.exec(`alter table public.${t} add primary key(id)`);
await db.exec(`
alter table public.services add constraint services_value_key unique(value);
alter table public.business_members enable row level security;
grant select on public.business_members to authenticated;
create policy own_membership on public.business_members for select to authenticated using(user_id=auth.uid());
`);
for(const t of ['customers','jobs','estimates','invoices']) await db.exec(`
alter table public.${t} enable row level security;
grant select,insert,update,delete on public.${t} to authenticated;
create policy staff_business_access on public.${t} for all to authenticated using (business_id in(select business_id from public.business_members where user_id=auth.uid())) with check (business_id in(select business_id from public.business_members where user_id=auth.uid()));
`);
await db.exec(readFileSync(root+'/supabase/migrations/20260925033819_security_and_private_storage.sql','utf8'));
await db.exec(readFileSync(root+'/supabase/tests/business_security.sql','utf8'));
await db.exec(`create table public.customer_portal_access(user_id uuid,customer_id uuid,business_id uuid,revoked_at timestamptz,expires_at timestamptz); create table public.company_settings(id text primary key,business_name text,contact_phone text,phone text,contact_email text,portal_welcome_message text);`);
await db.exec(readFileSync(root+'/supabase/migrations/20260925040233_invoice_payment_integrity.sql','utf8'));
await db.exec(readFileSync(root+'/supabase/tests/financial_integrity.sql','utf8'));
await db.exec(`create table public.job_schedule_requests(id uuid primary key default gen_random_uuid(),business_id uuid,customer_id uuid,job_id uuid,request_type text,requested_date date,requested_time text,status text); alter table public.job_schedule_requests enable row level security; grant select,insert,update on public.job_schedule_requests to authenticated; create policy staff_schedule on public.job_schedule_requests for all to authenticated using(business_id in(select business_id from public.business_members where user_id=auth.uid())) with check(business_id in(select business_id from public.business_members where user_id=auth.uid()));`);
await db.exec(readFileSync(root+'/supabase/migrations/20260925041650_scheduling_integrity.sql','utf8'));
await db.exec(readFileSync(root+'/supabase/tests/scheduling_integrity.sql','utf8'));
await db.exec(`alter table auth.users add column email_confirmed_at timestamptz;`);
await db.exec(readFileSync(root+'/supabase/migrations/20260925043522_employee_field_foundation.sql','utf8'));
await db.exec(readFileSync(root+'/supabase/tests/employee_access.sql','utf8'));
await db.exec(readFileSync(root+'/supabase/migrations/20260925050149_job_service_properties.sql','utf8'));
await db.exec(readFileSync(root+'/supabase/tests/service_properties.sql','utf8'));
await db.exec(readFileSync(root+'/supabase/tests/scheduling_integrity.sql','utf8'));
await db.exec(readFileSync(root+'/supabase/tests/employee_access.sql','utf8'));
console.log('PASS: property ownership, address snapshots, recurrence, portal and protected deletion.');
console.log('PASS: employee invitations, least-privilege jobs, shifts, storage, location sessions and revocation.');
console.log('PASS: recurring rollover/retry, calendar approvals, cancellation and schedule validation.');
console.log('PASS: financial totals, conversions, payment retry, partial/full balances, authorization and portal checks.');
console.log('PASS: local PostgreSQL security migration + owner/staff/other-business/anonymous/storage/parent-integrity regression checks.');
} catch(error) { console.error('FAIL:',error.message, error.detail??''); process.exitCode=1; }
finally { await db.close(); }
