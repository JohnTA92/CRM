-- One successor per completed recurring visit. Historical visits are not replayed.
alter table public.jobs add column recurring_parent_id uuid;
alter table public.jobs add column recurring_anchor_day integer;
alter table public.jobs add column completed_at timestamptz;
alter table public.jobs add constraint jobs_recurring_parent_unique unique(recurring_parent_id);
alter table public.jobs add constraint jobs_recurring_parent_business_fk foreign key(recurring_parent_id,business_id) references public.jobs(id,business_id);
alter table public.jobs add constraint jobs_recurring_anchor_check check(recurring_anchor_day between 1 and 31);

create function private.validate_job_schedule() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.status not in ('draft','quoted','scheduled','in-progress','complete','invoiced','cancelled') then raise exception 'Choose a valid job status.' using errcode='23514'; end if;
 if new.recurring not in ('none','weekly','biweekly','monthly') then raise exception 'Choose a valid repeat interval.' using errcode='23514'; end if;
 if new.scheduled_time is not null and new.scheduled_date is null then raise exception 'Choose a date before setting a time.' using errcode='23514'; end if;
 if new.status in ('scheduled','in-progress') and new.scheduled_date is null then raise exception 'Scheduled jobs need a date.' using errcode='23514'; end if;
 if new.recurring<>'none' and new.scheduled_date is null then raise exception 'Repeating jobs need a starting date.' using errcode='23514'; end if;
 if new.duration_minutes is null or new.duration_minutes<1 or new.duration_minutes>1440 then raise exception 'Duration must be between 1 and 1440 minutes.' using errcode='23514'; end if;
 if new.price is not null and (new.price<0 or new.price::text in ('NaN','Infinity','-Infinity')) then raise exception 'Price must be zero or greater.' using errcode='23514'; end if;
 if tg_op='UPDATE' then
  if new.recurring_parent_id is distinct from old.recurring_parent_id then raise exception 'The recurring visit link cannot be changed.' using errcode='23514'; end if;
  if new.scheduled_date is distinct from old.scheduled_date or new.recurring is distinct from old.recurring then new.recurring_anchor_day:=extract(day from new.scheduled_date); end if;
  if new.customer_id is distinct from old.customer_id and (old.invoice_id is not null or old.estimate_id is not null) then raise exception 'This job has linked financial records. Its customer cannot be changed.' using errcode='23514'; end if;
 end if;
 new.recurring_anchor_day:=coalesce(new.recurring_anchor_day,extract(day from new.scheduled_date));
 if new.status='complete' then new.completed_at:=coalesce(new.completed_at,now()); end if;
 return new;
end $$;
create trigger validate_job_schedule before insert or update on public.jobs for each row execute function private.validate_job_schedule();

create function private.create_next_recurring_visit() returns trigger
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
 insert into public.jobs(business_id,customer_id,title,service_type,status,scheduled_date,scheduled_time,duration_minutes,notes,price,recurring,recurring_parent_id,recurring_anchor_day,crew_member_ids,checklist)
 values(new.business_id,new.customer_id,new.title,new.service_type,'scheduled',next_date,new.scheduled_time,new.duration_minutes,new.notes,coalesce(new.price,(select total from public.estimates where id=new.estimate_id and business_id=new.business_id and status='approved')),new.recurring,new.id,new.recurring_anchor_day,new.crew_member_ids,tasks)
 on conflict(recurring_parent_id) do nothing;
 return new;
end $$;
create trigger create_next_recurring_visit after update of status on public.jobs for each row execute function private.create_next_recurring_visit();
revoke all on function private.validate_job_schedule(),private.create_next_recurring_visit() from public,anon,authenticated;

-- A staff approval and its calendar change must succeed together.
create function private.apply_schedule_decision() returns trigger
language plpgsql security invoker set search_path='' as $$
declare j public.jobs;
begin
 if new.status is not distinct from old.status then return new; end if;
 if old.status<>'pending' then raise exception 'This request has already been decided.' using errcode='23514'; end if;
 if new.status<>'approved' then return new; end if;
 select * into j from public.jobs where id=new.job_id and business_id=new.business_id and customer_id=new.customer_id for update;
 if not found then raise exception 'The requested job is unavailable.' using errcode='42501'; end if;
 if j.status in ('complete','invoiced','cancelled') then raise exception 'This job is already closed. Review the request before changing it.' using errcode='23514'; end if;
 if new.request_type='cancel' then update public.jobs set status='cancelled' where id=j.id;
 else
  if new.requested_date is null then raise exception 'A reschedule request needs a date.' using errcode='23514'; end if;
  update public.jobs set scheduled_date=new.requested_date,scheduled_time=coalesce(nullif(new.requested_time,'')::time,j.scheduled_time),status='scheduled' where id=j.id;
 end if;
 return new;
end $$;
create trigger apply_schedule_decision before update of status on public.job_schedule_requests for each row execute function private.apply_schedule_decision();
revoke all on function private.apply_schedule_decision() from public,anon,authenticated;
