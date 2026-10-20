-- Disposable fixtures: always roll back. Covers additional-contact CRUD (add/edit,
-- no delete path is exposed by the app), field bounds, and the tenant isolation the
-- new table inherits from the same staff_business_access policy shape as every
-- other customer-adjacent table.
begin;
insert into auth.users(id,email) values
 ('21000000-0000-4000-8000-000000000001','contacts-owner@example.invalid'),
 ('21000000-0000-4000-8000-000000000002','contacts-staff@example.invalid'),
 ('21000000-0000-4000-8000-000000000003','contacts-other@example.invalid');
insert into public.businesses(id,owner_id,name) values
 ('22000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','Contacts test A'),
 ('22000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000003','Contacts test B');
insert into public.business_members(business_id,user_id,role) values
 ('22000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','owner'),
 ('22000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000002','staff'),
 ('22000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000003','owner');
insert into public.customers(id,name,phone,business_id) values
 ('23000000-0000-4000-8000-000000000001','Contacts customer A','2025550300','22000000-0000-4000-8000-000000000001'),
 ('23000000-0000-4000-8000-000000000002','Contacts customer B','2025550301','22000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub','21000000-0000-4000-8000-000000000001',true);

-- Owner can add an additional contact for their own customer.
insert into public.customer_contacts(id,business_id,customer_id,role,name,email,phone) values
 ('24000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','Property Manager','Pat Jordan','pat@example.invalid','5551230000');
do $$ begin
 if not exists(select 1 from public.customer_contacts where id='24000000-0000-4000-8000-000000000001')
  then raise exception 'Owner could not add an additional contact'; end if;
end $$;

-- A blank/whitespace-only name is rejected with an actionable error.
do $$ begin
 begin
  insert into public.customer_contacts(business_id,customer_id,name) values
   ('22000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','   ');
  raise exception 'Blank name was accepted';
 exception when check_violation then null; end;
end $$;

-- Over-length role/name are rejected; exactly at the bound is accepted.
do $$ begin
 begin
  insert into public.customer_contacts(business_id,customer_id,name,role) values
   ('22000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','Someone',repeat('x',81));
  raise exception 'Over-length role was accepted';
 exception when check_violation then null; end;

 begin
  insert into public.customer_contacts(business_id,customer_id,name) values
   ('22000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001',repeat('x',121));
  raise exception 'Over-length name was accepted';
 exception when check_violation then null; end;

 insert into public.customer_contacts(business_id,customer_id,name,role) values
  ('22000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001',repeat('x',120),repeat('y',80));
end $$;

-- A contact cannot be attached to a customer belonging to a different business.
do $$ begin
 begin
  insert into public.customer_contacts(business_id,customer_id,name) values
   ('22000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000002','Cross tenant');
  raise exception 'Cross-business customer_id was accepted';
 exception when foreign_key_violation then null; end;
end $$;

-- Edit (the only correction path — there is no delete action in the app).
update public.customer_contacts set phone='5559998888', role='Site Manager'
 where id='24000000-0000-4000-8000-000000000001';
do $$ begin
 if (select phone from public.customer_contacts where id='24000000-0000-4000-8000-000000000001')<>'5559998888'
  then raise exception 'Edit did not persist'; end if;
end $$;

-- Staff on the same business may read and write.
select set_config('request.jwt.claim.sub','21000000-0000-4000-8000-000000000002',true);
do $$ declare n int; begin
 update public.customer_contacts set role='Updated by staff' where id='24000000-0000-4000-8000-000000000001';
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Staff edit failed'; end if;
end $$;

-- Another business can neither read nor write this contact.
select set_config('request.jwt.claim.sub','21000000-0000-4000-8000-000000000003',true);
do $$ declare n int; begin
 if exists(select 1 from public.customer_contacts where id='24000000-0000-4000-8000-000000000001')
  then raise exception 'Other business can read a contact it does not own'; end if;
 update public.customer_contacts set role='stolen' where id='24000000-0000-4000-8000-000000000001';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Other business wrote a contact across tenants'; end if;
end $$;

-- Anonymous callers have no access to the table at all.
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 begin
  perform 1 from public.customer_contacts;
  raise exception 'Anonymous read allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
