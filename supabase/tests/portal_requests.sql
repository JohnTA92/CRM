begin;
insert into auth.users(id,email,raw_user_meta_data) values
('00000000-0000-4000-8000-000000000911','signup-check@example.invalid','{"business_name":"[TEST] Signup"}'),
('00000000-0000-4000-8000-000000000912','portal-check@example.invalid','{}');
do $$ begin
if exists(select 1 from public.business_members where user_id='00000000-0000-4000-8000-000000000911') then raise exception 'unconfirmed provisioned'; end if;
end $$;
update auth.users set email_confirmed_at=now() where id='00000000-0000-4000-8000-000000000911';
update auth.users set email_confirmed_at=now() where id='00000000-0000-4000-8000-000000000911';
do $$ begin
if (select count(*) from public.business_members where user_id='00000000-0000-4000-8000-000000000911' and role='owner')<>1 then raise exception 'signup membership/idempotency'; end if;
if not exists(select 1 from public.company_settings s join public.businesses b on b.id::text=s.id where b.owner_id='00000000-0000-4000-8000-000000000911') then raise exception 'signup settings'; end if;
end $$;
insert into public.customer_portal_access(user_id,customer_id,business_id) values
('00000000-0000-4000-8000-000000000912','9dbd99e1-c68a-4fc2-ac76-d9afac9a5c58','a3c15303-9344-48ae-800c-4e1d7b99fb09');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000912',true);
insert into public.service_requests(customer_id,description) values ('9dbd99e1-c68a-4fc2-ac76-d9afac9a5c58','[TEST SQL] service') returning id;
insert into public.portal_messages(customer_id,sender,body) values ('9dbd99e1-c68a-4fc2-ac76-d9afac9a5c58','customer','[TEST SQL] customer') returning id;
insert into public.job_schedule_requests(customer_id,job_id,request_type,requested_date) values ('9dbd99e1-c68a-4fc2-ac76-d9afac9a5c58','3cac05e5-f292-4ebc-aed3-5601f4d1e552','reschedule','2026-10-02') returning id;
do $$ declare n int; begin
if not exists(select 1 from public.service_requests where description='[TEST SQL] service') then raise exception 'customer read failed'; end if;
if exists(select 1 from public.customer_portal_access) then raise exception 'grant rows leaked'; end if;
update public.service_requests set status='scheduled' where description='[TEST SQL] service';
get diagnostics n=row_count; if n<>0 then raise exception 'customer can change status'; end if;
begin
insert into public.service_requests(customer_id,description,status) values ('9dbd99e1-c68a-4fc2-ac76-d9afac9a5c58','bad','scheduled');
raise exception 'forged status accepted'; exception when insufficient_privilege then null; end;
begin
insert into public.portal_messages(customer_id,sender,body) values ('9dbd99e1-c68a-4fc2-ac76-d9afac9a5c58','staff','bad');
raise exception 'forged sender accepted'; exception when insufficient_privilege then null; end;
begin
insert into public.service_requests(customer_id,description) values ('53ceaa14-5e80-49e5-870b-c9a85b6d0eaf','bad');
raise exception 'cross customer accepted'; exception when insufficient_privilege then null; end;
begin
insert into public.business_members(business_id,user_id,role) values ('a3c15303-9344-48ae-800c-4e1d7b99fb09','00000000-0000-4000-8000-000000000912','owner');
raise exception 'self promotion accepted'; exception when insufficient_privilege then null; end;
end $$;
do $$ begin
begin
insert into public.job_schedule_requests(customer_id,job_id,request_type) values ('9dbd99e1-c68a-4fc2-ac76-d9afac9a5c58','3cac05e5-f292-4ebc-aed3-5601f4d1e552','reschedule');
raise exception 'Missing date accepted';
exception when raise_exception then if sqlerrm<>'Choose a requested date' then raise; end if; end;
begin
insert into public.job_schedule_requests(customer_id,job_id,request_type) values ('9dbd99e1-c68a-4fc2-ac76-d9afac9a5c58','00000000-0000-4000-8000-000000000999','cancel');
raise exception 'Foreign job accepted';
exception when raise_exception then if sqlerrm<>'Job does not belong to this customer' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','e3793263-553a-4e2e-b822-788281fec004',true);
update public.service_requests set status='reviewed' where description='[TEST SQL] service';
update public.job_schedule_requests set status='approved' where requested_date='2026-10-02' and customer_id='9dbd99e1-c68a-4fc2-ac76-d9afac9a5c58';
insert into public.portal_messages(customer_id,sender,body) values ('9dbd99e1-c68a-4fc2-ac76-d9afac9a5c58','staff','[TEST SQL] reply');
do $$ begin
begin update public.businesses set stripe_charges_enabled=true where id='a3c15303-9344-48ae-800c-4e1d7b99fb09'; raise exception 'client billing writable'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000912',true);
do $$ begin
if not exists(select 1 from public.portal_messages where body='[TEST SQL] reply') then raise exception 'reply invisible'; end if;
if not exists(select 1 from public.service_requests where description='[TEST SQL] service' and status='reviewed') then raise exception 'status invisible'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000911',true);
do $$ begin
if exists(select 1 from public.service_requests) or exists(select 1 from public.portal_messages) or exists(select 1 from public.job_schedule_requests) then raise exception 'cross business leaked'; end if;
if (select count(*) from public.businesses)<>1 then raise exception 'new owner cannot read business'; end if;
end $$;
reset role;
update public.customer_portal_access set revoked_at=now() where user_id='00000000-0000-4000-8000-000000000912';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000912',true);
do $$ begin
if exists(select 1 from public.service_requests) or exists(select 1 from public.portal_messages) or exists(select 1 from public.job_schedule_requests) then raise exception 'revoked grant read'; end if;
begin insert into public.portal_messages(customer_id,sender,body) values ('9dbd99e1-c68a-4fc2-ac76-d9afac9a5c58','customer','bad'); raise exception 'revoked grant write'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.customer_portal_access set revoked_at=null,expires_at=now()-interval '1 minute' where user_id='00000000-0000-4000-8000-000000000912';
set local role authenticated;
do $$ begin
if exists(select 1 from public.service_requests) or exists(select 1 from public.portal_messages) or exists(select 1 from public.job_schedule_requests) then raise exception 'expired grant read'; end if;
begin insert into public.portal_messages(customer_id,sender,body) values ('9dbd99e1-c68a-4fc2-ac76-d9afac9a5c58','customer','bad'); raise exception 'expired grant write'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
begin perform * from public.portal_messages; raise exception 'anonymous message read'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
