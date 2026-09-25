-- Disposable local PostgreSQL fixtures; no live accounts or records are created.
begin;
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002'),('10000000-0000-4000-8000-000000000003');
insert into businesses(id,owner_id,name) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Documents test');
insert into business_members(business_id,user_id) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into customers(id,business_id,name,phone) values ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Customer',''),('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Other','');
insert into customer_portal_access(user_id,customer_id,business_id,expires_at) values ('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',now()+interval '1 day');
insert into estimates(id,business_id,customer_id,status,line_items) values
('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','sent','[{"type":"service","description":"Service","quantity":2,"unitPrice":25}]'),
('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','draft','[{"type":"service","description":"Draft","quantity":1,"unitPrice":25}]'),
('40000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','sent','[{"type":"service","description":"Private","quantity":1,"unitPrice":25}]'),
('40000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','sent','[{"type":"service","description":"Expired","quantity":1,"unitPrice":25}]');
insert into estimates(id,business_id,customer_id,status,line_items) select '40000000-0000-4000-8000-000000000005',business_id,customer_id,status,line_items from estimates where id='40000000-0000-4000-8000-000000000001';
update estimates set expires_at=now()-interval '1 hour' where id='40000000-0000-4000-8000-000000000004';
insert into invoices(id,business_id,customer_id,status,line_items) values ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','sent','[{"type":"service","description":"Invoice","quantity":1,"unitPrice":75}]');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ begin
 if get_customer_document('estimate','40000000-0000-4000-8000-000000000002')->>'status'<>'draft' then raise exception 'Staff draft missing'; end if;
 begin perform decide_customer_estimate('40000000-0000-4000-8000-000000000001','approved','Staff','x'); raise exception 'Staff decision allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ declare d jsonb; response jsonb; rev text;
begin
 d:=get_customer_document('estimate','40000000-0000-4000-8000-000000000001'); rev:=d->>'revision';
 if d->>'total'<>'50.00' or not (d->>'can_decide')::boolean then raise exception 'Estimate detail incorrect: %',d; end if;
 if get_customer_document('invoice','50000000-0000-4000-8000-000000000001')->>'balance_due'<>'75.00' then raise exception 'Invoice balance incorrect'; end if;
 begin perform get_customer_document('estimate','40000000-0000-4000-8000-000000000002'); raise exception 'Draft exposed'; exception when insufficient_privilege then null; end;
 begin perform get_customer_document('estimate','40000000-0000-4000-8000-000000000003'); raise exception 'Other customer exposed'; exception when insufficient_privilege then null; end;
 begin perform decide_customer_estimate('40000000-0000-4000-8000-000000000004','approved','Customer','x'); raise exception 'Expired accepted'; exception when check_violation then null; end;
 begin perform decide_customer_estimate('40000000-0000-4000-8000-000000000001','approved','Customer','stale'); raise exception 'Stale accepted'; exception when serialization_failure then null; end;
 begin perform decide_customer_estimate('40000000-0000-4000-8000-000000000001','approved','',rev); raise exception 'Missing name accepted'; exception when invalid_parameter_value then null; end;
 response:=decide_customer_estimate('40000000-0000-4000-8000-000000000001','approved','Customer',rev);
 if response->>'status'<>'approved' or response->'decision'->>'signer_name'<>'Customer' then raise exception 'Decision missing'; end if;
 perform decide_customer_estimate('40000000-0000-4000-8000-000000000001','approved','Customer',rev);
 begin perform decide_customer_estimate('40000000-0000-4000-8000-000000000001','declined','Customer',rev); raise exception 'Decision changed'; exception when check_violation then null; end;
 response:=get_customer_document('estimate','40000000-0000-4000-8000-000000000005');
 response:=decide_customer_estimate('40000000-0000-4000-8000-000000000005','declined','Customer',response->>'revision');
 if response->>'status'<>'declined' then raise exception 'Decline failed'; end if;
 begin perform 1 from private.estimate_decisions; raise exception 'Private evidence exposed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ begin
 begin update estimates set notes='Changed terms' where id='40000000-0000-4000-8000-000000000001'; raise exception 'Decided terms changed'; exception when check_violation then null; end;
 begin update estimates set status='sent' where id='40000000-0000-4000-8000-000000000001'; raise exception 'Decision reset'; exception when check_violation then null; end;
 perform convert_estimate_to_job('40000000-0000-4000-8000-000000000001');
end $$;
reset role;
do $$ begin
 if (select count(*) from private.estimate_decisions)<>2 then raise exception 'Duplicate evidence'; end if;
end $$;
update customer_portal_access set revoked_at=now();
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ begin
 begin perform get_customer_document('estimate','40000000-0000-4000-8000-000000000001'); raise exception 'Revoked read allowed'; exception when insufficient_privilege then null; end;
 begin perform decide_customer_estimate('40000000-0000-4000-8000-000000000001','approved','Customer','x'); raise exception 'Revoked retry allowed'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform get_customer_document('estimate','40000000-0000-4000-8000-000000000001'); raise exception 'Anonymous read allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;
