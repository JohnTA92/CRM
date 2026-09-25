-- Preserve a job's saved service address; never guess a property for old jobs.
alter table public.customer_properties add constraint customer_properties_business_customer_id_key unique(business_id,customer_id,id);
alter table public.jobs add column property_id uuid, add column service_address text;
alter table public.jobs add constraint jobs_property_customer_fkey foreign key(business_id,customer_id,property_id) references public.customer_properties(business_id,customer_id,id) on delete restrict;
create index jobs_property_idx on public.jobs(business_id,customer_id,property_id) where property_id is not null;
update public.jobs j set service_address=concat_ws(', ',nullif(c.address,''),nullif(c.city,''),nullif(c.state,''),nullif(c.zip,'')) from public.customers c where c.id=j.customer_id and c.business_id=j.business_id;

create function private.set_job_service_address() returns trigger
language plpgsql security invoker set search_path='' as $$
declare address_value text;
begin
 if tg_op='UPDATE' and new.property_id is not distinct from old.property_id and new.customer_id is not distinct from old.customer_id and new.business_id is not distinct from old.business_id and new.service_address is not null then
  new.service_address:=old.service_address;
  return new;
 end if;
 if new.property_id is not null then
  select concat_ws(', ',nullif(p.address,''),nullif(p.city,''),nullif(p.state,''),nullif(p.zip,'')) into address_value from public.customer_properties p where p.id=new.property_id and p.customer_id=new.customer_id and p.business_id=new.business_id;
  if not found then raise exception 'Choose a property belonging to this customer and business.' using errcode='23503'; end if;
  if nullif(trim(address_value),'') is null then raise exception 'Add an address to this property before assigning a job.' using errcode='23514'; end if;
 else
  select concat_ws(', ',nullif(c.address,''),nullif(c.city,''),nullif(c.state,''),nullif(c.zip,'')) into address_value from public.customers c where c.id=new.customer_id and c.business_id=new.business_id;
 end if;
 new.service_address:=coalesce(address_value,'');
 return new;
end $$;
revoke all on function private.set_job_service_address() from public,anon,authenticated;
create trigger set_job_service_address before insert or update on public.jobs for each row execute function private.set_job_service_address();

create or replace function private.create_next_recurring_visit() returns trigger
language plpgsql security invoker set search_path='' as $$
declare next_date date; next_month date; tasks jsonb;
begin
 if new.status<>'complete' or old.status='complete' or new.recurring='none' or new.scheduled_date is null then return new; end if;
 if exists(select 1 from public.jobs where recurring_parent_id=new.id) then return new; end if;
 if new.recurring='weekly' then next_date:=new.scheduled_date+7;
 elsif new.recurring='biweekly' then next_date:=new.scheduled_date+14;
 else
  next_month:=(date_trunc('month',new.scheduled_date)+interval '1 month')::date;
  next_date:=next_month+(least(new.recurring_anchor_day,extract(day from next_month+interval '1 month - 1 day')::int)-1);
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'text',value->>'text','done',false)),'[]'::jsonb) into tasks from jsonb_array_elements(coalesce(new.checklist,'[]'::jsonb));
 insert into public.jobs(business_id,customer_id,title,service_type,status,scheduled_date,scheduled_time,duration_minutes,notes,price,recurring,recurring_parent_id,recurring_anchor_day,crew_member_ids,checklist,property_id)
 values(new.business_id,new.customer_id,new.title,new.service_type,'scheduled',next_date,new.scheduled_time,new.duration_minutes,new.notes,coalesce(new.price,(select total from public.estimates where id=new.estimate_id and business_id=new.business_id and status='approved')),new.recurring,new.id,new.recurring_anchor_day,new.crew_member_ids,tasks,new.property_id)
 on conflict(recurring_parent_id) do nothing;
 return new;
end $$;

create or replace function public.employee_context() returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.employee_access;
begin
 a:=private.current_employee();
 return jsonb_build_object('crew_id',a.crew_id,'business_id',a.business_id,'name',(select name from public.crew_members where id=a.crew_id),'business_name',(select name from public.businesses where id=a.business_id),
 'entries',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'clocked_in_at',clocked_in_at,'clocked_out_at',clocked_out_at,'break_type',break_type) order by clocked_in_at desc),'[]') from public.time_entries where crew_member_id=a.crew_id and business_id=a.business_id and job_id is null and (clocked_in_at>now()-interval '35 days' or clocked_out_at is null)),
 'jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'title',j.title,'status',j.status,'scheduled_date',j.scheduled_date,'scheduled_time',j.scheduled_time,'duration_minutes',j.duration_minutes,'checklist',j.checklist,'customer_name',c.name,'phone',c.phone,'address',j.service_address,'latitude',p.latitude,'longitude',p.longitude) order by j.scheduled_date,j.scheduled_time),'[]') from public.jobs j join public.customers c on c.id=j.customer_id and c.business_id=a.business_id left join public.customer_route_pins p on p.customer_id=c.id and p.business_id=a.business_id and j.property_id is null and p.source_address=j.service_address where j.business_id=a.business_id and a.crew_id=any(j.crew_member_ids) and j.status<>'draft' and (j.scheduled_date>=current_date-30 or j.scheduled_date is null)));
end $$;


CREATE OR REPLACE FUNCTION public.get_portal_data(_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare bid uuid; result jsonb;
begin
if auth.uid() is null then return null; end if;
select c.business_id into bid from public.customers c where c.id=_customer_id;
if bid is null or not (
exists(select 1 from public.business_members m where m.user_id=auth.uid() and m.business_id=bid)
or exists(select 1 from public.customer_portal_access a where a.user_id=auth.uid()
 and a.customer_id=_customer_id and a.business_id=bid and a.revoked_at is null and a.expires_at>now())
) then return null; end if;
select jsonb_build_object(
 'customer',jsonb_build_object('id',c.id,'name',c.name),
 'contact',jsonb_build_object('business_name',coalesce(s.business_name,b.name),
 'contact_phone',coalesce(s.contact_phone,s.phone),'contact_email',s.contact_email,'portal_welcome_message',s.portal_welcome_message),
 'jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'title',j.title,'status',j.status,'scheduled_date',j.scheduled_date,'scheduled_time',j.scheduled_time,'service_address',j.service_address) order by j.scheduled_date desc),'[]'::jsonb) from public.jobs j where j.customer_id=c.id and j.business_id=bid and j.status<>'draft'),
 'estimates',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'total',e.total,'status',e.status,'created_at',e.created_at,'sent_at',e.sent_at) order by e.created_at desc),'[]'::jsonb) from public.estimates e where e.customer_id=c.id and e.business_id=bid and e.status<>'draft'),
 'invoices',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'total',i.total,'paid_total',i.paid_total,'balance_due',greatest(0,i.total-i.paid_total),'status',i.status,'due_at',i.due_at,'created_at',i.created_at) order by i.created_at desc),'[]'::jsonb) from public.invoices i where i.customer_id=c.id and i.business_id=bid and i.status not in ('draft','voided'))
) into result from public.customers c join public.businesses b on b.id=c.business_id
left join public.company_settings s on s.id=b.id::text where c.id=_customer_id;
return result;
end $function$
;

revoke all on function public.get_portal_data(uuid) from public,anon;
grant execute on function public.get_portal_data(uuid) to authenticated;
