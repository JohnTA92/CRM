-- Disposable fixtures: always roll back, including auth users and storage metadata.
begin;
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','security-owner@example.invalid'),
 ('10000000-0000-4000-8000-000000000002','security-other@example.invalid'),
 ('10000000-0000-4000-8000-000000000003','security-staff@example.invalid'),
 ('10000000-0000-4000-8000-000000000004','security-outsider@example.invalid');
insert into public.businesses(id,owner_id,name) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Security test A'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Security test B');
insert into public.business_members(business_id,user_id,role) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner'),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','staff'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','owner');
insert into public.customers(id,name,phone,business_id) values
 ('30000000-0000-4000-8000-000000000001','Security customer A','2025550100','20000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000002','Security customer B','2025550101','20000000-0000-4000-8000-000000000002');
insert into public.crew_members(id,name,business_id) values
 ('40000000-0000-4000-8000-000000000001','Security crew','20000000-0000-4000-8000-000000000001');
insert into public.jobs(id,title,service_type,customer_id,business_id) values
 ('50000000-0000-4000-8000-000000000001','Security job','test','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
insert into public.invoices(id,customer_id,business_id) values
 ('60000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
insert into public.services(value,label,business_id) values ('security-test','Security service','20000000-0000-4000-8000-000000000001');
insert into public.expenses(amount,description,category,date,job_id,business_id) values (1,'Security expense','other',current_date,'50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
insert into public.invoice_payments(amount,invoice_id,business_id) values (1,'60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
insert into public.job_media(url,job_id,business_id) values ('20000000-0000-4000-8000-000000000001/test.png','50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
insert into public.time_entries(crew_member_id,business_id) values ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
insert into public.customer_properties(customer_id,label,business_id) values ('30000000-0000-4000-8000-000000000001','Security property','20000000-0000-4000-8000-000000000001');
insert into storage.objects(bucket_id,name) values ('job-media','20000000-0000-4000-8000-000000000001/test.png'),('expense-receipts','20000000-0000-4000-8000-000000000001/receipt.png');

-- Staff can read and update the same business; other tenants/anonymous cannot.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $$ declare t text; n int; begin
 foreach t in array array['crew_members','services','expenses','invoice_payments','job_media','time_entries','customer_properties'] loop
  execute format('select count(*) from public.%I',t) into n;
  if n<>1 then raise exception 'Staff visibility failed for %: %',t,n; end if;
  execute format('update public.%I set business_id=business_id',t);
  get diagnostics n=row_count;
  if n<>1 then raise exception 'Staff update failed for %',t; end if;
  begin
   execute format('update public.%I set business_id=''20000000-0000-4000-8000-000000000002''',t);
   raise exception 'Tenant reassignment allowed for %',t;
  exception when insufficient_privilege then null; end;
 end loop;
 if (select count(*) from storage.objects)<>2 then raise exception 'Staff file access failed'; end if;
 begin
  insert into storage.objects(bucket_id,name) values ('job-media','20000000-0000-4000-8000-000000000002/stolen.png');
  raise exception 'Foreign storage upload allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.jobs set customer_id='30000000-0000-4000-8000-000000000002' where id='50000000-0000-4000-8000-000000000001';
  raise exception 'Foreign customer allowed';
 exception when foreign_key_violation then null; end;
 begin
  update public.jobs set crew_member_ids=array['40000000-0000-4000-8000-000000000099'::uuid] where id='50000000-0000-4000-8000-000000000001';
  raise exception 'Unknown crew allowed';
 exception when check_violation then null; end;
 begin
  insert into public.crew_members(name) values ('Unowned');
  raise exception 'Unowned crew insert allowed';
 exception when insufficient_privilege or check_violation then null; end;
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ declare t text; n int; begin
 foreach t in array array['crew_members','services','expenses','invoice_payments','job_media','time_entries','customer_properties'] loop
  execute format('select count(*) from public.%I',t) into n;
  if n<>0 then raise exception 'Other business read leak in %',t; end if;
  execute format('update public.%I set business_id=business_id',t); get diagnostics n=row_count;
  if n<>0 then raise exception 'Other business update leak in %',t; end if;
  execute format('delete from public.%I',t); get diagnostics n=row_count;
  if n<>0 then raise exception 'Other business delete leak in %',t; end if;
 end loop;
 if exists(select 1 from storage.objects) then raise exception 'Foreign files exposed'; end if;
 delete from storage.objects; get diagnostics n=row_count;
 if n<>0 then raise exception 'Foreign file delete allowed'; end if;
 begin
  insert into public.services(value,label,business_id) values ('bad','Bad','20000000-0000-4000-8000-000000000001');
  raise exception 'Foreign insert allowed';
 exception when insufficient_privilege then null; end;
end $$;
-- Two businesses can use the same service key.
insert into public.services(value,label,business_id) values ('security-test','Security service B','20000000-0000-4000-8000-000000000002');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
do $$ begin
 if exists(select 1 from crew_members) or exists(select 1 from time_entries) or exists(select 1 from storage.objects) then raise exception 'Unrelated login has access'; end if;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ declare t text; begin
 foreach t in array array['crew_members','services','expenses','invoice_payments','job_media','time_entries','customer_properties'] loop
  if has_table_privilege('anon','public.'||t,'select,insert,update,delete,truncate') then raise exception 'Anonymous grant remains on %',t; end if;
  begin execute format('select * from public.%I',t); raise exception 'Anonymous read allowed'; exception when insufficient_privilege then null; end;
 end loop;
 if exists(select 1 from storage.objects) then raise exception 'Anonymous file access'; end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from storage.buckets where id in ('job-media','expense-receipts') and public) then raise exception 'Public bucket remains'; end if;
end $$;
rollback;
