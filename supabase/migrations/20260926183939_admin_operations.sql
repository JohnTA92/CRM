-- Admin commands and their audit evidence commit together. Only the authenticated
-- Edge handler (service role) can supply an actor; browser roles cannot invoke it.
alter table public.admin_audit_log enable row level security;
alter table public.announcements enable row level security;
revoke all on public.admin_audit_log, public.announcements from anon, authenticated;
grant select, insert on public.admin_audit_log to service_role;
grant select, insert, update on public.announcements to service_role;

create or replace function public.admin_operation(p_actor uuid, p_area text, p_body jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor auth.users%rowtype; target auth.users%rowtype; biz public.businesses%rowtype;
 ticket public.support_requests%rowtype; announcement public.announcements%rowtype;
 action text:=p_body->>'action'; result jsonb; target_id uuid; details jsonb;
 audit_action text; target_business uuid; target_name text; trial timestamptz;
begin
 if p_body is null or jsonb_typeof(p_body)<>'object' then raise exception 'Invalid request' using errcode='22023'; end if;
 -- Serialize administrative mutations, including concurrent permission changes.
 perform pg_advisory_xact_lock(81649236);
 select * into actor from auth.users where id=p_actor;
 if not found then raise exception 'Not authenticated' using errcode='28000'; end if;
 if p_area='announcements' and action='get_active' then
  select jsonb_build_object('id',a.id,'message',a.message,'type',a.type) into result from public.announcements a where active order by created_at desc,id desc limit 1;
  return jsonb_build_object('announcement',result);
 end if;
 if actor.raw_app_meta_data->'is_admin' is distinct from 'true'::jsonb then
  raise exception 'Admin access required' using errcode='42501';
 end if;
 if p_area='businesses' then
  select coalesce(jsonb_agg(row_data order by created_at desc),'[]') into result from
   (select to_jsonb(b)||jsonb_build_object('owner_email',u.email) row_data,b.created_at from public.businesses b left join auth.users u on u.id=b.owner_id) q;
  return jsonb_build_object('businesses',result);
 elsif p_area='support' then
  select coalesce(jsonb_agg(to_jsonb(s) order by created_at desc),'[]') into result from public.support_requests s;
  return jsonb_build_object('requests',result);
 elsif p_area='audit' then
  select coalesce(jsonb_agg(to_jsonb(q) order by created_at desc),'[]') into result from
   (select * from public.admin_audit_log order by created_at desc,id desc limit 200) q;
  return jsonb_build_object('logs',result);
 elsif p_area='announcements' then
  if action='list' then
   select coalesce(jsonb_agg(to_jsonb(q) order by created_at desc),'[]') into result from
    (select * from public.announcements order by created_at desc,id desc limit 50) q;
   return jsonb_build_object('announcements',result);
  elsif action='create' then
   if jsonb_typeof(p_body->'message') is distinct from 'string' or length(btrim(p_body->>'message')) not between 1 and 2000
    or coalesce(p_body->>'type','info') not in ('info','warning','success') then raise exception 'Enter a message (1–2000 characters) and valid type' using errcode='22023'; end if;
   update public.announcements set active=false where active;
   insert into public.announcements(message,type,active,created_by,created_by_email)
    values(btrim(p_body->>'message'),coalesce(p_body->>'type','info'),true,actor.id,actor.email) returning * into announcement;
   audit_action:='announcement_created';
  elsif action='dismiss' then
   update public.announcements set active=false where id=(p_body->>'id')::uuid returning * into announcement;
   if not found then raise exception 'Announcement not found' using errcode='P0002'; end if;
   audit_action:='announcement_dismissed';
  else raise exception 'Unknown action' using errcode='22023'; end if;
  details:=jsonb_build_object('announcement_id',announcement.id);
  result:=jsonb_build_object('ok',true,'announcement',to_jsonb(announcement));
 elsif p_area='update-business' then
  select * into biz from public.businesses where id=(p_body->>'business_id')::uuid for update;
  if not found then raise exception 'Business not found' using errcode='P0002'; end if;
  target_business:=biz.id; target_name:=biz.name;
  details:=jsonb_build_object('previous_status',biz.subscription_status,'previous_trial_end',biz.trial_ends_at);
  if action='set_status' then
   if coalesce(p_body->>'status','') not in ('active','cancelled','past_due','trialing') then raise exception 'Invalid status' using errcode='22023'; end if;
   update public.businesses set subscription_status=p_body->>'status' where id=biz.id;
  elsif action='extend_trial' then
   trial:=(p_body->>'trial_ends_at')::timestamptz;
   if trial is null or trial<=now() or trial>now()+interval '2 years' then raise exception 'Trial end must be in the next two years' using errcode='22023'; end if;
   update public.businesses set subscription_status='trialing',trial_ends_at=trial where id=biz.id;
  elsif action='grant_free' then
   if biz.subscription_id is not null and biz.subscription_id<>'comped' then raise exception 'Manage the existing paid subscription before granting free access' using errcode='22023'; end if;
   update public.businesses set subscription_status='active',subscription_id='comped' where id=biz.id;
  elsif action='reset_onboarding' then
   update public.businesses set onboarding_complete=false where id=biz.id;
  elsif action in ('sync_stripe','send_password_reset') then
   raise exception 'This integration is not enabled yet' using errcode='22023';
  else raise exception 'Unknown action' using errcode='22023'; end if;
  select * into biz from public.businesses where id=biz.id;
  audit_action:=action;
  details:=details||jsonb_build_object('status',biz.subscription_status,'trial_end',biz.trial_ends_at);
  result:=jsonb_build_object('business',to_jsonb(biz)||jsonb_build_object('owner_email',(select email from auth.users where id=biz.owner_id)));
 elsif p_area='update-support' then
  select * into ticket from public.support_requests where id=(p_body->>'request_id')::uuid for update;
  if not found then raise exception 'Support request not found' using errcode='P0002'; end if;
  if coalesce(p_body->>'status','') not in ('open','resolved') or length(coalesce(p_body->>'admin_notes',''))>10000 then raise exception 'Invalid support status or notes' using errcode='22023'; end if;
  details:=jsonb_build_object('request_id',ticket.id,'previous_status',ticket.status,'status',p_body->>'status');
  update public.support_requests set status=p_body->>'status',admin_notes=coalesce(p_body->>'admin_notes',''),
   resolved_at=case when p_body->>'status'='resolved' then coalesce(resolved_at,now()) else null end
   where id=ticket.id returning * into ticket;
  target_business:=ticket.business_id; target_name:=ticket.business_name; audit_action:='support_updated';
  result:=jsonb_build_object('ok',true,'request',to_jsonb(ticket));
 elsif p_area='team' then
  if actor.raw_app_meta_data->'is_super_admin' is distinct from 'true'::jsonb then raise exception 'Super admin access required' using errcode='42501'; end if;
  if action='list' then
   select coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email,'is_super_admin',coalesce(raw_app_meta_data->'is_super_admin'='true'::jsonb,false),'created_at',created_at) order by email),'[]') into result from auth.users where raw_app_meta_data->'is_admin'='true'::jsonb;
   return jsonb_build_object('admins',result);
  elsif action='grant' then
   if coalesce(length(btrim(p_body->>'email')),0) not between 3 and 254 then raise exception 'Email required' using errcode='22023'; end if;
   select * into target from auth.users where lower(email)=lower(btrim(p_body->>'email')) for update;
  elsif action='revoke' then
   select * into target from auth.users where id=(p_body->>'user_id')::uuid for update;
  else raise exception 'Unknown action' using errcode='22023'; end if;
  if not found then raise exception 'Account not found. They must sign up first.' using errcode='P0002'; end if;
  if target.id=actor.id then raise exception 'You cannot change your own admin access' using errcode='22023'; end if;
  if target.raw_app_meta_data->'is_super_admin'='true'::jsonb then raise exception 'Super admin access cannot be changed here' using errcode='42501'; end if;
  -- Only server-owned authorization metadata is changed. Other keys are preserved.
  update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}')||jsonb_build_object('is_admin',action='grant'),updated_at=now() where id=target.id;
  audit_action:=case when action='grant' then 'grant_admin' else 'revoke_admin' end;
  details:=jsonb_build_object('target_user_id',target.id,'target_email',target.email);
  result:=jsonb_build_object('ok',true,'message','Admin access updated. The user should sign in again.');
 else raise exception 'Unknown operation' using errcode='22023'; end if;
 insert into public.admin_audit_log(admin_id,admin_email,action,target_business_id,target_business_name,details)
 values(actor.id,actor.email,audit_action,target_business,target_name,details::text);
 return result;
end $$;
revoke all on function public.admin_operation(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_operation(uuid,text,jsonb) to service_role;
