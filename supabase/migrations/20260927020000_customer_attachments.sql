-- Customer attachments: metadata table + a new private storage bucket, following
-- the same shape as job_media / job-media established in
-- 20260925033819_security_and_private_storage.sql. No delete path is exposed by
-- the app yet; grants match house convention but the UI never offers delete.
create table public.customer_attachments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  customer_id uuid not null,
  storage_path text not null,
  file_name text not null,
  file_type text not null,
  file_size bigint not null,
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  constraint customer_attachments_file_name_not_blank check (btrim(file_name) <> ''),
  constraint customer_attachments_file_size_valid check (file_size > 0 and file_size <= 52428800),
  constraint customer_attachments_file_type_allowed check (file_type = any (array[
    'image/jpeg','image/png','image/webp','image/gif','image/heic',
    'video/mp4','video/quicktime','video/webm','application/pdf'
  ]))
);

alter table public.customer_attachments enable row level security;
revoke all on public.customer_attachments from public, anon, authenticated;
grant select, insert, update, delete on public.customer_attachments to authenticated;

-- Same business-membership scoping as every other customer-adjacent table.
-- uploaded_by is informational only (mirrors the already-present-but-unused
-- job_media.created_by column) and plays no role in access control — access
-- stays business-level, matching the existing permission model with no new
-- owner-vs-staff tier.
create policy staff_business_access on public.customer_attachments for all to authenticated
  using (business_id in (select business_id from public.business_members where user_id = (select auth.uid())))
  with check (business_id in (select business_id from public.business_members where user_id = (select auth.uid())));

create index customer_attachments_customer_idx on public.customer_attachments (business_id, customer_id);

-- Tenant consistency: an attachment can only be attached to a customer in the same business.
alter table public.customer_attachments add constraint customer_attachments_customer_tenant_fk
  foreign key (business_id, customer_id) references public.customers (business_id, id);

-- Storage: new private bucket, same config shape as job-media/expense-receipts.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('customer-media','customer-media',false,52428800,array[
  'image/jpeg','image/png','image/webp','image/gif','image/heic',
  'video/mp4','video/quicktime','video/webm','application/pdf'
])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Re-declare the same four policies with customer-media added to the bucket list.
-- This evolves 20260925033819's storage.objects policies without editing that file
-- — the same technique that migration itself used on even-earlier legacy policies.
drop policy if exists crm_files_read on storage.objects;
drop policy if exists crm_files_insert on storage.objects;
drop policy if exists crm_files_update on storage.objects;
drop policy if exists crm_files_delete on storage.objects;

create policy crm_files_read on storage.objects for select to authenticated using (
  bucket_id in ('job-media','expense-receipts','customer-media') and
  (storage.foldername(name))[1] in (select business_id::text from public.business_members where user_id=(select auth.uid()))
);
create policy crm_files_insert on storage.objects for insert to authenticated with check (
  bucket_id in ('job-media','expense-receipts','customer-media') and
  (storage.foldername(name))[1] in (select business_id::text from public.business_members where user_id=(select auth.uid()))
);
create policy crm_files_update on storage.objects for update to authenticated using (
  bucket_id in ('job-media','expense-receipts','customer-media') and
  (storage.foldername(name))[1] in (select business_id::text from public.business_members where user_id=(select auth.uid()))
) with check (
  bucket_id in ('job-media','expense-receipts','customer-media') and
  (storage.foldername(name))[1] in (select business_id::text from public.business_members where user_id=(select auth.uid()))
);
create policy crm_files_delete on storage.objects for delete to authenticated using (
  bucket_id in ('job-media','expense-receipts','customer-media') and
  (storage.foldername(name))[1] in (select business_id::text from public.business_members where user_id=(select auth.uid()))
);
