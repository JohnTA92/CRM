import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {createAdminHandler} from '../../functions/_shared/admin-handler.ts';
const db=new PGlite();
const owner='10000000-0000-4000-8000-000000000001', admin='10000000-0000-4000-8000-000000000002', member='10000000-0000-4000-8000-000000000003';
const bid='20000000-0000-4000-8000-000000000001', ticket='30000000-0000-4000-8000-000000000001';
try {
await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,created_at timestamptz default now(),updated_at timestamptz);
create table public.businesses(id uuid primary key,owner_id uuid,name text,subscription_status text,subscription_id text,trial_ends_at timestamptz,onboarding_complete boolean,created_at timestamptz default now());
create table public.support_requests(id uuid primary key,business_id uuid,business_name text,status text,admin_notes text,resolved_at timestamptz,created_at timestamptz default now());
create table public.announcements(id uuid primary key default gen_random_uuid(),message text,type text,active boolean,created_by uuid,created_by_email text,created_at timestamptz default now());
create table public.admin_audit_log(id uuid primary key default gen_random_uuid(),admin_id uuid,admin_email text,action text not null,target_business_id uuid,target_business_name text,details text,created_at timestamptz default now());
insert into auth.users(id,email,raw_app_meta_data) values
('${owner}','owner@example.test','{"is_admin":true,"is_super_admin":true}'),
('${admin}','admin@example.test','{"is_admin":true}'),
('${member}','member@example.test','{"provider":"email","custom":"preserve"}');
insert into public.businesses values('${bid}','${member}','Local fixture','trialing',null,null,true,now());
insert into public.support_requests(id,business_id,business_name,status) values('${ticket}','${bid}','Local fixture','open');`);
const dir=new URL('../../migrations/',import.meta.url);
const migration=readdirSync(dir).find(x=>x.endsWith('_admin_operations.sql'));
await db.exec(readFileSync(new URL(migration,dir),'utf8'));
const op=async(actor,area,body={})=>(await db.query('select public.admin_operation($1,$2,$3) result',[actor,area,JSON.stringify(body)])).rows[0].result;
await assert.rejects(()=>op(member,'businesses'),/Admin access/);
await assert.rejects(()=>op(admin,'team',{action:'list'}),/Super admin/);
await db.exec('set role authenticated');
await assert.rejects(()=>op(owner,'businesses'),/permission denied/);
await assert.rejects(()=>db.query('select * from public.admin_audit_log'),/permission denied/);
await db.exec('reset role');
assert.equal((await op(owner,'businesses')).businesses[0].owner_email,'member@example.test');
await assert.rejects(()=>op(owner,'update-business',{action:'set_status',business_id:bid,status:'fake'}),/Invalid status/);
await assert.rejects(()=>op(owner,'update-business',{action:'set_status',business_id:member,status:'active'}),/not found/);
await op(owner,'update-business',{action:'extend_trial',business_id:bid,trial_ends_at:new Date(Date.now()+86400000).toISOString()});
assert.equal((await op(owner,'update-business',{action:'grant_free',business_id:bid})).business.subscription_id,'comped');
let resolved=await op(owner,'update-support',{request_id:ticket,status:'resolved',admin_notes:'local note'});
assert.ok(resolved.request.resolved_at);
assert.equal((await op(owner,'update-support',{request_id:ticket,status:'open',admin_notes:'local note'})).request.resolved_at,null);
const a=await op(owner,'announcements',{action:'create',message:'Local test one',type:'info'});
await assert.rejects(()=>op(owner,'announcements',{action:'create',message:'',type:'bad'}),/Enter a message/);
assert.equal((await op(member,'announcements',{action:'get_active'})).announcement.id,a.announcement.id);
await op(owner,'announcements',{action:'create',message:'Local test two',type:'warning'});
assert.equal((await db.query('select count(*)::int n from announcements where active')).rows[0].n,1);
// Audit failure must roll back both the announcement creation and deactivation.
await db.exec(`create function public.fail_audit() returns trigger language plpgsql as $$begin raise exception 'audit unavailable'; end$$;
create trigger fail_audit before insert on admin_audit_log for each row execute function public.fail_audit();`);
await assert.rejects(()=>op(owner,'announcements',{action:'create',message:'Must rollback'}),/audit unavailable/);
assert.equal((await op(member,'announcements',{action:'get_active'})).announcement.message,'Local test two');
await db.exec('drop trigger fail_audit on admin_audit_log');
await op(owner,'team',{action:'grant',email:' MEMBER@EXAMPLE.TEST '});
assert.equal((await db.query('select raw_app_meta_data from auth.users where id=$1',[member])).rows[0].raw_app_meta_data.custom,'preserve');
assert.equal((await op(member,'businesses')).businesses.length,1);
await op(owner,'team',{action:'revoke',user_id:member});
await assert.rejects(()=>op(member,'businesses'),/Admin access/);
await assert.rejects(()=>op(owner,'team',{action:'revoke',user_id:owner}),/own admin/);
assert.ok((await op(owner,'audit')).logs.some(x=>x.action==='revoke_admin'&&x.admin_id===owner));
console.log('PASS admin SQL: current permissions, service-only access, input validation, support reopen, announcement replacement, audit rollback, admin grant/revoke and preserved metadata.');
let calls=0;
const handler=createAdminHandler('businesses',{user:async()=>({data:{user:{id:owner}}}),rpc:async(actor,area,body)=>{calls++;assert.equal(actor,owner);return {data:{businesses:[]}};}});
assert.equal((await handler(new Request('http://test',{method:'POST'}))).status,401);
assert.equal(calls,0);
const req=body=>new Request('http://test',{method:'POST',headers:{Authorization:'Bearer fixture'},body});
assert.equal((await handler(req('{'))).status,400);
assert.equal((await handler(req('[]'))).status,400);
assert.equal((await handler(req('{}'))).status,200);
for(const [code,status] of [['42501',403],['P0002',404],['22023',400],['XX000',500]]){
 const h=createAdminHandler('audit',{user:async()=>({data:{user:{id:owner}}}),rpc:async()=>({error:{code,message:'test'}})});
 assert.equal((await h(req('{}'))).status,status);
}
console.log('PASS admin HTTP: missing session, malformed input, server actor identity and error classification.');
}finally{await db.close();}
