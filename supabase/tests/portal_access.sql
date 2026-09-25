begin;

insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000901','portal-test@example.invalid'),('00000000-0000-4000-8000-000000000902','other-test@example.invalid');
insert into public.businesses(id,owner_id,name) values ('00000000-0000-4000-8000-000000000903','00000000-0000-4000-8000-000000000902','[TEST] other');
insert into public.customers(id,name,phone,business_id) values ('00000000-0000-4000-8000-000000000904','[TEST] other customer','2025550100','00000000-0000-4000-8000-000000000903');
insert into public.customer_portal_access(user_id,customer_id,business_id) values ('00000000-0000-4000-8000-000000000901','9dbd99e1-c68a-4fc2-ac76-d9afac9a5c58','a3c15303-9344-48ae-800c-4e1d7b99fb09');
set local role authenticated;
select set_config('request.jwt.claim.sub','e3793263-553a-4e2e-b822-788281fec004',true);
do $$ begin
if (select count(*) from public.customers)<>5 then raise exception 'owner access failed'; end if;
if public.get_portal_data('9dbd99e1-c68a-4fc2-ac76-d9afac9a5c58') is null then raise exception 'staff preview failed'; end if;
if public.get_portal_data('00000000-0000-4000-8000-000000000904') is not null then raise exception 'cross business leaked'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
do $$ declare d jsonb; n int; begin
if exists(select 1 from public.customers) or exists(select 1 from public.jobs) or exists(select 1 from public.invoices) or exists(select 1 from public.estimates) then raise exception 'direct table leaked'; end if;
d:=public.get_portal_data('9dbd99e1-c68a-4fc2-ac76-d9afac9a5c58');
if d is null or d->'customer'->>'name'<>'TEST Alex Demo' then raise exception 'customer read failed'; end if;
if d::text like '%notes%' or d::text like '%stripe_%' then raise exception 'internal field leaked'; end if;
if exists(select 1 from jsonb_array_elements(d->'invoices') x where x->>'status' in ('draft','voided')) then raise exception 'draft leaked'; end if;
if public.get_portal_data('53ceaa14-5e80-49e5-870b-c9a85b6d0eaf') is not null then raise exception 'other customer leaked'; end if;
update public.invoices set status='paid'; get diagnostics n=row_count; if n<>0 then raise exception 'customer write allowed'; end if;
begin insert into public.customers(name,phone,business_id) values ('bad','2025550101','a3c15303-9344-48ae-800c-4e1d7b99fb09'); raise exception 'customer insert allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.customer_portal_access set revoked_at=now() where user_id='00000000-0000-4000-8000-000000000901';
set local role authenticated;
do $$ begin if public.get_portal_data('9dbd99e1-c68a-4fc2-ac76-d9afac9a5c58') is not null then raise exception 'revoked access'; end if; end $$;
reset role;
update public.customer_portal_access set revoked_at=null,expires_at=now()-interval '1 minute' where user_id='00000000-0000-4000-8000-000000000901';
set local role authenticated;
do $$ begin if public.get_portal_data('9dbd99e1-c68a-4fc2-ac76-d9afac9a5c58') is not null then raise exception 'expired access'; end if; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000902',true);
do $$ begin if exists(select 1 from public.customers) or public.get_portal_data('9dbd99e1-c68a-4fc2-ac76-d9afac9a5c58') is not null then raise exception 'unrelated account access'; end if; end $$;
reset role;
insert into public.business_members(user_id,business_id,role) values ('00000000-0000-4000-8000-000000000901','a3c15303-9344-48ae-800c-4e1d7b99fb09','staff');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
do $$ begin if (select count(*) from public.customers)<>5 then raise exception 'employee access failed'; end if; end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
begin perform * from public.customers; raise exception 'anon table access'; exception when insufficient_privilege then null; end;
begin perform public.get_portal_data('9dbd99e1-c68a-4fc2-ac76-d9afac9a5c58'); raise exception 'anon rpc access'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;

