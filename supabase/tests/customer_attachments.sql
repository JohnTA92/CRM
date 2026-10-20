-- Disposable fixtures: always roll back. Covers customer_attachments table RLS,
-- its CHECK constraints, tenant consistency, and the storage.objects RLS extension
-- for the new customer-media bucket (mirroring business_security.sql's proven
-- storage-policy idiom). No delete path is exposed by the app; the delete grant
-- here only matches house convention for every other table.
begin;
insert into auth.users(id,email) values
 ('31000000-0000-4000-8000-000000000001','attach-owner@example.invalid'),
 ('31000000-0000-4000-8000-000000000002','attach-staff@example.invalid'),
 ('31000000-0000-4000-8000-000000000003','attach-other@example.invalid');
insert into public.businesses(id,owner_id,name) values
 ('32000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','Attachments test A'),
 ('32000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000003','Attachments test B');
insert into public.business_members(business_id,user_id,role) values
 ('32000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','owner'),
 ('32000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000002','staff'),
 ('32000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000003','owner');
insert into public.customers(id,name,phone,business_id) values
 ('33000000-0000-4000-8000-000000000001','Attachments customer A','2025550400','32000000-0000-4000-8000-000000000001'),
 ('33000000-0000-4000-8000-000000000002','Attachments customer B','2025550401','32000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000001',true);

-- Owner can record a valid attachment for their own customer.
insert into public.customer_attachments(id,business_id,customer_id,storage_path,file_name,file_type,file_size,uploaded_by) values
 ('34000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001/33000000-0000-4000-8000-000000000001/photo.jpg','photo.jpg','image/jpeg',102400,
  '31000000-0000-4000-8000-000000000001');
do $$ begin
 if not exists(select 1 from public.customer_attachments where id='34000000-0000-4000-8000-000000000001')
  then raise exception 'Owner could not record a valid attachment'; end if;
end $$;

-- One accepted row per allowed category (video, pdf) to spot-check the allowlist.
insert into public.customer_attachments(business_id,customer_id,storage_path,file_name,file_type,file_size) values
 ('32000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001/33000000-0000-4000-8000-000000000001/clip.mp4','clip.mp4','video/mp4',204800),
 ('32000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001/33000000-0000-4000-8000-000000000001/contract.pdf','contract.pdf','application/pdf',51200);

-- Blank filename, zero/negative/over-limit size, and a disallowed type are all rejected.
do $$ begin
 begin
  insert into public.customer_attachments(business_id,customer_id,storage_path,file_name,file_type,file_size) values
   ('32000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','p','   ','image/png',100);
  raise exception 'Blank file_name was accepted';
 exception when check_violation then null; end;

 begin
  insert into public.customer_attachments(business_id,customer_id,storage_path,file_name,file_type,file_size) values
   ('32000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','p','empty.png','image/png',0);
  raise exception 'Zero file_size was accepted';
 exception when check_violation then null; end;

 begin
  insert into public.customer_attachments(business_id,customer_id,storage_path,file_name,file_type,file_size) values
   ('32000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','p','huge.mp4','video/mp4',52428801);
  raise exception 'Over-limit file_size was accepted';
 exception when check_violation then null; end;

 begin
  insert into public.customer_attachments(business_id,customer_id,storage_path,file_name,file_type,file_size) values
   ('32000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','p','archive.zip','application/zip',100);
  raise exception 'Disallowed file_type was accepted';
 exception when check_violation then null; end;

 -- Exactly at the size bound is accepted.
 insert into public.customer_attachments(business_id,customer_id,storage_path,file_name,file_type,file_size) values
  ('32000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','p','boundary.png','image/png',52428800);
end $$;

-- An attachment cannot be attached to a customer belonging to a different business.
do $$ begin
 begin
  insert into public.customer_attachments(business_id,customer_id,storage_path,file_name,file_type,file_size) values
   ('32000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000002','p','cross.png','image/png',100);
  raise exception 'Cross-business customer_id was accepted';
 exception when foreign_key_violation then null; end;
end $$;

-- Staff on the same business may read.
select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000002',true);
do $$ declare n int; begin
 select count(*) into n from public.customer_attachments where customer_id='33000000-0000-4000-8000-000000000001';
 if n<>4 then raise exception 'Staff visibility failed: %',n; end if;
end $$;

-- Another business can neither read nor write these attachments.
select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000003',true);
do $$ declare n int; begin
 if exists(select 1 from public.customer_attachments where id='34000000-0000-4000-8000-000000000001')
  then raise exception 'Other business can read an attachment it does not own'; end if;
 update public.customer_attachments set file_name='stolen' where id='34000000-0000-4000-8000-000000000001';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Other business wrote an attachment across tenants'; end if;
end $$;

-- Anonymous callers have no access to the table at all.
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 begin
  perform 1 from public.customer_attachments;
  raise exception 'Anonymous read allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

-- --- Storage RLS for the new customer-media bucket (mirrors business_security.sql) ---
insert into storage.objects(bucket_id,name) values
 ('customer-media','32000000-0000-4000-8000-000000000001/33000000-0000-4000-8000-000000000001/photo.jpg');

set local role authenticated;
select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000001',true);
do $$ declare n int; begin
 select count(*) into n from storage.objects where bucket_id='customer-media';
 if n<>1 then raise exception 'Owner storage read failed for customer-media: %',n; end if;
 begin
  insert into storage.objects(bucket_id,name) values ('customer-media','32000000-0000-4000-8000-000000000002/stolen.png');
  raise exception 'Foreign-business storage upload allowed';
 exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000003',true);
do $$ declare n int; begin
 if exists(select 1 from storage.objects where bucket_id='customer-media')
  then raise exception 'Other business can see customer-media files it does not own'; end if;
 delete from storage.objects where bucket_id='customer-media';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Other business deleted customer-media files across tenants'; end if;
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='customer-media')
  then raise exception 'Anonymous customer-media file access'; end if;
end $$;
reset role;

do $$ begin
 if exists(select 1 from storage.buckets where id='customer-media' and public)
  then raise exception 'customer-media bucket is public'; end if;
end $$;

rollback;
