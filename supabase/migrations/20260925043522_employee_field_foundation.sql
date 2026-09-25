-- Employees deliberately receive no business_members row and no broad table grants.
create table private.employee_access(user_id uuid primary key references auth.users(id) on delete cascade, business_id uuid not null, crew_id uuid not null unique, foreign key(business_id,crew_id) references public.crew_members(business_id,id) on delete cascade);
create table private.employee_invites(token_hash text primary key, business_id uuid not null, crew_id uuid not null unique, email text not null, expires_at timestamptz not null, foreign key(business_id,crew_id) references public.crew_members(business_id,id) on delete cascade);
create table private.employee_positions(crew_id uuid primary key,business_id uuid not null,session_id uuid not null,enabled boolean not null default false,latitude double precision,longitude double precision,accuracy double precision,updated_at timestamptz not null default now(),foreign key(business_id,crew_id) references public.crew_members(business_id,id) on delete cascade);
create table public.customer_route_pins(business_id uuid not null,customer_id uuid not null,source_address text not null,latitude double precision not null check(latitude between -90 and 90),longitude double precision not null check(longitude between -180 and 180),primary key(business_id,customer_id),foreign key(business_id,customer_id) references public.customers(business_id,id) on delete cascade);
alter table private.employee_access enable row level security;
alter table private.employee_invites enable row level security;
alter table private.employee_positions enable row level security;
alter table public.customer_route_pins enable row level security;
revoke all on private.employee_access,private.employee_invites,private.employee_positions,public.customer_route_pins from public,anon,authenticated;
grant select,insert,update,delete on public.customer_route_pins to authenticated;
create policy office_route_pins on public.customer_route_pins for all to authenticated using(business_id in(select business_id from public.business_members where user_id=auth.uid())) with check(business_id in(select business_id from public.business_members where user_id=auth.uid()));

create function private.current_employee() returns private.employee_access language plpgsql stable security definer set search_path='' as $$
declare a private.employee_access;
begin
 if auth.uid() is null then raise exception 'Sign in to your employee account.' using errcode='42501'; end if;
 select e.* into a from private.employee_access e join public.crew_members c on c.id=e.crew_id and c.business_id=e.business_id where e.user_id=auth.uid() and c.active=true;
 if not found then raise exception 'Employee access is unavailable. Ask your manager for an invitation.' using errcode='42501'; end if;
 return a;
end $$;
revoke all on function private.current_employee() from public,anon,authenticated;

create function public.manage_employee_access(_crew_id uuid,_action text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.crew_members; token text;
begin
 select * into c from public.crew_members where id=_crew_id for update;
 if auth.uid() is null or not exists(select 1 from public.business_members where user_id=auth.uid() and business_id=c.business_id and role='owner') then raise exception 'Only the business owner can manage employee access.' using errcode='42501'; end if;
 if _action='revoke' then
  delete from private.employee_access where crew_id=c.id;
  delete from private.employee_invites where crew_id=c.id;
  delete from private.employee_positions where crew_id=c.id;
  return jsonb_build_object('revoked',true);
 end if;
 if _action<>'invite' or not c.active or nullif(trim(c.email),'') is null then raise exception 'An active crew member needs an email address before inviting.' using errcode='22023'; end if;
 if exists(select 1 from private.employee_access where crew_id=c.id) then raise exception 'This employee already has access. Revoke it before inviting a different account.' using errcode='23514'; end if;
 token:=gen_random_uuid()::text||gen_random_uuid()::text;
 insert into private.employee_invites(token_hash,business_id,crew_id,email,expires_at) values(encode(sha256(convert_to(token,'UTF8')),'hex'),c.business_id,c.id,lower(trim(c.email)),now()+interval '7 days') on conflict(crew_id) do update set token_hash=excluded.token_hash,email=excluded.email,expires_at=excluded.expires_at;
 return jsonb_build_object('token',token,'email',c.email,'expires_at',now()+interval '7 days');
end $$;

create function public.accept_employee_invite(_token text) returns void language plpgsql security definer set search_path='' as $$
declare i private.employee_invites; verified_email text;
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 select lower(email) into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 select * into i from private.employee_invites where token_hash=encode(sha256(convert_to(_token,'UTF8')),'hex') and expires_at>now() for update;
 if not found or verified_email is distinct from i.email then raise exception 'This invitation requires the matching, verified employee email.' using errcode='42501'; end if;
 if not exists(select 1 from public.crew_members where id=i.crew_id and business_id=i.business_id and active and lower(trim(email))=i.email) then raise exception 'This employee is inactive.' using errcode='42501'; end if;
 if exists(select 1 from public.business_members where user_id=auth.uid()) then raise exception 'Use a separate employee login, not an office account.' using errcode='23514'; end if;
 insert into private.employee_access(user_id,business_id,crew_id) values(auth.uid(),i.business_id,i.crew_id);
 delete from private.employee_invites where crew_id=i.crew_id;
end $$;

create function public.employee_context() returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.employee_access;
begin
 a:=private.current_employee();
 return jsonb_build_object('crew_id',a.crew_id,'business_id',a.business_id,'name',(select name from public.crew_members where id=a.crew_id),'business_name',(select name from public.businesses where id=a.business_id),
 'entries',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'clocked_in_at',clocked_in_at,'clocked_out_at',clocked_out_at,'break_type',break_type) order by clocked_in_at desc),'[]') from public.time_entries where crew_member_id=a.crew_id and business_id=a.business_id and job_id is null and (clocked_in_at>now()-interval '35 days' or clocked_out_at is null)),
 'jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'title',j.title,'status',j.status,'scheduled_date',j.scheduled_date,'scheduled_time',j.scheduled_time,'duration_minutes',j.duration_minutes,'checklist',j.checklist,'customer_name',c.name,'phone',c.phone,'address',concat_ws(', ',nullif(c.address,''),nullif(c.city,''),nullif(c.state,''),nullif(c.zip,'')),'latitude',p.latitude,'longitude',p.longitude) order by j.scheduled_date,j.scheduled_time),'[]') from public.jobs j join public.customers c on c.id=j.customer_id and c.business_id=a.business_id left join public.customer_route_pins p on p.customer_id=c.id and p.business_id=a.business_id and p.source_address=concat_ws(', ',nullif(c.address,''),nullif(c.city,''),nullif(c.state,''),nullif(c.zip,'')) where j.business_id=a.business_id and a.crew_id=any(j.crew_member_ids) and j.status<>'draft' and (j.scheduled_date>=current_date-30 or j.scheduled_date is null)));
end $$;

create function public.employee_work(_action text,_job_id uuid default null,_task_id text default null,_done boolean default null) returns void language plpgsql security definer set search_path='' as $$
declare a private.employee_access; j public.jobs; shift_id uuid; break_id uuid;
begin
 a:=private.current_employee();
 -- Serializes shift/break retries from multiple tabs on this employee.
 perform 1 from public.crew_members where id=a.crew_id for update;
 a:=private.current_employee();
 if _action in ('clock_in','clock_out','break_lunch','break_short','end_break') then
  select id into shift_id from public.time_entries where crew_member_id=a.crew_id and business_id=a.business_id and job_id is null and break_type is null and clocked_out_at is null order by clocked_in_at limit 1;
  select id into break_id from public.time_entries where crew_member_id=a.crew_id and business_id=a.business_id and job_id is null and break_type is not null and clocked_out_at is null order by clocked_in_at limit 1;
  if _action='clock_in' then
   if shift_id is null then insert into public.time_entries(business_id,crew_member_id) values(a.business_id,a.crew_id); end if;
  elsif _action='clock_out' then
   update public.time_entries set clocked_out_at=now() where crew_member_id=a.crew_id and business_id=a.business_id and job_id is null and clocked_out_at is null;
   delete from private.employee_positions where crew_id=a.crew_id;
  elsif _action='end_break' then update public.time_entries set clocked_out_at=now() where id=break_id;
  else
   if shift_id is null then raise exception 'Clock in before taking a break.' using errcode='23514'; end if;
   if break_id is null then insert into public.time_entries(business_id,crew_member_id,break_type) values(a.business_id,a.crew_id,case when _action='break_lunch' then 'lunch' else 'short' end); end if;
   delete from private.employee_positions where crew_id=a.crew_id;
  end if;
  return;
 end if;
 select * into j from public.jobs where id=_job_id and business_id=a.business_id and a.crew_id=any(crew_member_ids) for update;
 if not found then raise exception 'This job is not assigned to you.' using errcode='42501'; end if;
 if _action='start_job' and j.status in ('scheduled','in-progress') then update public.jobs set status='in-progress' where id=j.id;
 elsif _action='complete_job' and j.status in ('in-progress','complete') then update public.jobs set status='complete' where id=j.id;
 elsif _action='check_task' and j.status in ('scheduled','in-progress') and _done is not null then
  if not exists(select 1 from jsonb_array_elements(j.checklist) t where t->>'id'=_task_id) then raise exception 'Checklist item unavailable.'; end if;
  update public.jobs set checklist=(select jsonb_agg(case when t->>'id'=_task_id then jsonb_set(t,'{done}',to_jsonb(_done)) else t end order by n) from jsonb_array_elements(j.checklist) with ordinality as items(t,n)) where id=j.id;
 else raise exception 'This action is not available for the current job status.' using errcode='23514'; end if;
end $$;

create function public.employee_location(_session uuid,_action text,_latitude double precision default null,_longitude double precision default null,_accuracy double precision default null) returns void language plpgsql security definer set search_path='' as $$
declare a private.employee_access;
begin
 a:=private.current_employee();
 perform 1 from public.crew_members where id=a.crew_id for update;
 a:=private.current_employee();
 if _action='stop' then update private.employee_positions set enabled=false,latitude=null,longitude=null,accuracy=null,updated_at=now() where crew_id=a.crew_id and session_id=_session; return; end if;
 if not exists(select 1 from public.time_entries where crew_member_id=a.crew_id and business_id=a.business_id and job_id is null and break_type is null and clocked_out_at is null) or exists(select 1 from public.time_entries where crew_member_id=a.crew_id and business_id=a.business_id and break_type is not null and clocked_out_at is null) then raise exception 'Location sharing requires an active shift outside a break.' using errcode='23514'; end if;
 if _session is null then raise exception 'A sharing session is required.'; end if;
 if _action='start' then
  insert into private.employee_positions(crew_id,business_id,session_id,enabled) values(a.crew_id,a.business_id,_session,true) on conflict(crew_id) do update set session_id=excluded.session_id,enabled=true,latitude=null,longitude=null,accuracy=null,updated_at=now();
 elsif _action='update' then
  if _latitude is null or not (_latitude between -90 and 90) or _longitude is null or not (_longitude between -180 and 180) or _accuracy is null or not (_accuracy between 0 and 100000) then raise exception 'Invalid location.' using errcode='22023'; end if;
  update private.employee_positions set latitude=_latitude,longitude=_longitude,accuracy=_accuracy,updated_at=now() where crew_id=a.crew_id and session_id=_session and enabled and updated_at>now()-interval '2 minutes';
  if not found then raise exception 'Sharing session expired or stopped. Start again.' using errcode='23514'; end if;
 else raise exception 'Invalid location action.' using errcode='22023'; end if;
end $$;

create function public.employee_team_status(_business_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.business_members where user_id=auth.uid() and business_id=_business_id and role='owner') then raise exception 'Only the owner can view employee access and locations.' using errcode='42501'; end if;
 -- Expired fixes are discarded whenever the manager refreshes this panel.
 update private.employee_positions set enabled=false,latitude=null,longitude=null,accuracy=null where business_id=_business_id and updated_at<now()-interval '2 minutes';
 return (select coalesce(jsonb_agg(jsonb_build_object('crew_id',c.id,'connected',a.user_id is not null,'invited',i.expires_at>now(),'sharing',coalesce(p.enabled,false),'latitude',case when c.active and p.enabled then p.latitude end,'longitude',case when c.active and p.enabled then p.longitude end,'accuracy',case when c.active and p.enabled then p.accuracy end,'updated_at',p.updated_at)),'[]') from public.crew_members c left join private.employee_access a on a.crew_id=c.id left join private.employee_invites i on i.crew_id=c.id left join private.employee_positions p on p.crew_id=c.id where c.business_id=_business_id);
end $$;

create function private.employee_photo_path(_path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from private.employee_access a join public.crew_members c on c.id=a.crew_id and c.business_id=a.business_id and c.active join public.jobs j on j.business_id=a.business_id and a.crew_id=any(j.crew_member_ids) where a.user_id=auth.uid() and split_part(_path,'/',1)=a.business_id::text and split_part(_path,'/',2)=j.id::text and split_part(_path,'/',3)<>'' and j.status in ('scheduled','in-progress','complete'))
$$;
revoke all on function private.employee_photo_path(text) from public,anon;
grant execute on function private.employee_photo_path(text) to authenticated;
create policy employee_photo_insert on storage.objects for insert to authenticated with check(bucket_id='job-media' and private.employee_photo_path(name));

create function public.employee_attach_photo(_job_id uuid,_path text,_file_name text,_file_type text) returns void language plpgsql security definer set search_path='' as $$
declare a private.employee_access; j public.jobs;
begin
 a:=private.current_employee();
 select * into j from public.jobs where id=_job_id and business_id=a.business_id and a.crew_id=any(crew_member_ids);
 if not found or split_part(_path,'/',2)<>j.id::text or not private.employee_photo_path(_path) then raise exception 'Photo upload is not allowed for this job.' using errcode='42501'; end if;
 if not exists(select 1 from storage.objects where bucket_id='job-media' and name=_path) then raise exception 'Upload the photo first.'; end if;
 if not exists(select 1 from public.job_media where url=_path and business_id=a.business_id) then
 insert into public.job_media(business_id,job_id,customer_id,url,file_name,file_type,tag,notes) values(a.business_id,j.id,j.customer_id,_path,left(_file_name,200),_file_type,'after','Uploaded by employee');
 end if;
end $$;

revoke all on function public.manage_employee_access(uuid,text),public.accept_employee_invite(text),public.employee_context(),public.employee_work(text,uuid,text,boolean),public.employee_location(uuid,text,double precision,double precision,double precision),public.employee_team_status(uuid),public.employee_attach_photo(uuid,text,text,text) from public,anon;
grant execute on function public.manage_employee_access(uuid,text),public.accept_employee_invite(text),public.employee_context(),public.employee_work(text,uuid,text,boolean),public.employee_location(uuid,text,double precision,double precision,double precision),public.employee_team_status(uuid),public.employee_attach_photo(uuid,text,text,text) to authenticated;
