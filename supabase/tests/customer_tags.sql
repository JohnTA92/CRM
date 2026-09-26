-- Disposable fixtures: always roll back. Covers tag normalization, bounds and the
-- tenant isolation the new column inherits from the existing customers policy.
begin;
insert into auth.users(id,email) values
 ('11000000-0000-4000-8000-000000000001','tags-owner@example.invalid'),
 ('11000000-0000-4000-8000-000000000002','tags-staff@example.invalid'),
 ('11000000-0000-4000-8000-000000000003','tags-other@example.invalid');
insert into public.businesses(id,owner_id,name) values
 ('12000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','Tags test A'),
 ('12000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000003','Tags test B');
insert into public.business_members(business_id,user_id,role) values
 ('12000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','owner'),
 ('12000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','staff'),
 ('12000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000003','owner');
insert into public.customers(id,name,phone,business_id) values
 ('13000000-0000-4000-8000-000000000001','Tags customer A','2025550200','12000000-0000-4000-8000-000000000001'),
 ('13000000-0000-4000-8000-000000000002','Tags customer B','2025550201','12000000-0000-4000-8000-000000000002');

-- Existing rows default to an empty array rather than null.
do $$ begin
 if (select tags from public.customers where id='13000000-0000-4000-8000-000000000001')<>'{}'::text[]
  then raise exception 'Tags default is not an empty array'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);

-- Owner writes are trimmed, de-duplicated, blank-stripped and sorted.
update public.customers set tags=array['  VIP ','net-30','VIP','','   ']
 where id='13000000-0000-4000-8000-000000000001';
do $$ begin
 if (select tags from public.customers where id='13000000-0000-4000-8000-000000000001')<>array['VIP','net-30']
  then raise exception 'Tag normalization failed: %',(select tags::text from public.customers where id='13000000-0000-4000-8000-000000000001'); end if;
end $$;

-- Null collapses to empty; bounds are enforced with actionable errors.
do $$ declare n int; begin
 update public.customers set tags=null where id='13000000-0000-4000-8000-000000000001';
 if (select tags from public.customers where id='13000000-0000-4000-8000-000000000001')<>'{}'::text[]
  then raise exception 'Null tags did not collapse to an empty array'; end if;

 begin
  update public.customers set tags=array(select 'tag'||g from generate_series(1,21) g)
   where id='13000000-0000-4000-8000-000000000001';
  raise exception 'Tag count limit not enforced';
 exception when check_violation then null; end;

 begin
  update public.customers set tags=array[repeat('x',41)] where id='13000000-0000-4000-8000-000000000001';
  raise exception 'Tag length limit not enforced';
 exception when check_violation then null; end;

 -- Exactly at the bounds is accepted.
 update public.customers set tags=array(select 'tag'||g from generate_series(1,20) g)
  where id='13000000-0000-4000-8000-000000000001';
 update public.customers set tags=array[repeat('x',40)] where id='13000000-0000-4000-8000-000000000001';
 select array_length(tags,1) into n from public.customers where id='13000000-0000-4000-8000-000000000001';
 if n<>1 then raise exception 'Boundary tag write failed'; end if;
end $$;

-- Staff on the same business may read and write tags.
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
do $$ declare n int; begin
 update public.customers set tags=array['staff-set'] where id='13000000-0000-4000-8000-000000000001';
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Staff tag update failed'; end if;
end $$;

-- Another tenant can neither read nor write those tags.
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000003',true);
do $$ declare n int; begin
 if exists(select 1 from public.customers where id='13000000-0000-4000-8000-000000000001')
  then raise exception 'Other business can read tagged customer'; end if;
 update public.customers set tags=array['stolen'] where id='13000000-0000-4000-8000-000000000001';
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Other business wrote tags across tenants'; end if;
end $$;

-- Anonymous callers have no access to the column at all.
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 begin
  perform tags from public.customers;
  raise exception 'Anonymous tag read allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
