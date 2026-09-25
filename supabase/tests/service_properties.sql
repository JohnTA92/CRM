-- Isolated local fixtures only; never seeded into the live app.
begin;
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into businesses(id,owner_id,name) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Property test'),('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Other');
insert into business_members(business_id,user_id) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into customers(id,business_id,name,phone,address) values ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','First','','Main address'),('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Second','','Other address'),('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','Outsider','','Private');
insert into customer_properties(id,business_id,customer_id,label,address) values ('40000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003','Other business','Private');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$
declare bid uuid:='20000000-0000-4000-8000-000000000001'; cid uuid:='30000000-0000-4000-8000-000000000001'; pid uuid; other_id uuid; empty_id uuid; j jobs; child jobs;
begin
 insert into customer_properties(business_id,customer_id,label,address) values(bid,cid,'Rental','Rental address') returning id into pid;
 insert into customer_properties(business_id,customer_id,label,address) values(bid,'30000000-0000-4000-8000-000000000002','Different customer','Wrong address') returning id into other_id;
 insert into customer_properties(business_id,customer_id,label) values(bid,cid,'Empty') returning id into empty_id;
 insert into jobs(business_id,customer_id,property_id,title,status,scheduled_date,recurring,service_address) values(bid,cid,pid,'Property visit','scheduled','2028-01-01','weekly','Forged') returning * into j;
 if j.service_address<>'Rental address' then raise exception 'Property address was not derived'; end if;
 begin update jobs set property_id=other_id where id=j.id; raise exception 'Wrong customer accepted'; exception when foreign_key_violation then null; end;
 begin update jobs set property_id='40000000-0000-4000-8000-000000000003' where id=j.id; raise exception 'Wrong business accepted'; exception when foreign_key_violation then null; end;
 begin update jobs set property_id=empty_id where id=j.id; raise exception 'Empty property accepted'; exception when check_violation then null; end;
 begin update jobs set customer_id='30000000-0000-4000-8000-000000000002' where id=j.id; raise exception 'Stale property accepted'; exception when foreign_key_violation then null; end;
 update customer_properties set address='Updated rental' where id=pid;
 update jobs set notes='Preserve snapshot',service_address='Forged' where id=j.id;
 if (select service_address from jobs where id=j.id)<>'Rental address' then raise exception 'Snapshot overwritten'; end if;
 update jobs set status='complete' where id=j.id;
 select * into child from jobs where recurring_parent_id=j.id;
 if child.property_id<>pid or child.service_address<>'Updated rental' then raise exception 'Recurring property lost'; end if;
 if not exists(select 1 from jsonb_array_elements(get_portal_data(cid)->'jobs') x where x->>'id'=j.id::text and x->>'service_address'='Rental address') then raise exception 'Portal address missing'; end if;
 begin delete from customer_properties where id=pid; raise exception 'Linked property deleted'; exception when foreign_key_violation or restrict_violation then null; end;
 update jobs set service_address=null where id=child.id;
 update jobs set property_id=null where id=child.id returning * into child;
 if child.service_address<>'Main address' then raise exception 'Main address fallback failed'; end if;
 update jobs set customer_id='30000000-0000-4000-8000-000000000002',property_id=other_id where id=child.id returning * into child;
 if child.service_address<>'Wrong address' then raise exception 'Customer switch address failed'; end if;
end $$;
reset role;
insert into auth.users(id,email,email_confirmed_at) values ('10000000-0000-4000-8000-000000000004','employee@example.invalid',now());
insert into crew_members(id,business_id,name,active) values ('50000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','Local test employee',true);
insert into private.employee_access(user_id,business_id,crew_id) values ('10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000004');
update jobs set crew_member_ids=array['50000000-0000-4000-8000-000000000004'::uuid] where recurring_parent_id is not null;
insert into customer_route_pins(business_id,customer_id,source_address,latitude,longitude) values('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','Wrong address',1,1);
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
do $$ begin
 if not exists(select 1 from jsonb_array_elements(employee_context()->'jobs') x where x->>'address'='Wrong address' and x->>'latitude' is null) then raise exception 'Employee property address missing or wrong main-address pin exposed'; end if;
end $$;
rollback;
