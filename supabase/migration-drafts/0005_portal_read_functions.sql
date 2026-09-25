-- Explicit authorization plus allowlisted output; no direct customer table access.
alter table public.company_settings add column if not exists contact_phone text,
add column if not exists contact_email text, add column if not exists portal_welcome_message text;
create or replace function public.get_portal_data(_customer_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
 'jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'title',j.title,'status',j.status,'scheduled_date',j.scheduled_date,'scheduled_time',j.scheduled_time) order by j.scheduled_date desc),'[]'::jsonb) from public.jobs j where j.customer_id=c.id and j.business_id=bid and j.status<>'draft'),
 'estimates',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'total',e.total,'status',e.status,'created_at',e.created_at,'sent_at',e.sent_at) order by e.created_at desc),'[]'::jsonb) from public.estimates e where e.customer_id=c.id and e.business_id=bid and e.status<>'draft'),
 'invoices',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'total',i.total,'status',i.status,'due_at',i.due_at,'created_at',i.created_at) order by i.created_at desc),'[]'::jsonb) from public.invoices i where i.customer_id=c.id and i.business_id=bid and i.status not in ('draft','voided'))
) into result from public.customers c join public.businesses b on b.id=c.business_id
left join public.company_settings s on s.id=b.id::text where c.id=_customer_id;
return result;
end $$;
revoke all on function public.get_portal_data(uuid) from public,anon;
grant execute on function public.get_portal_data(uuid) to authenticated;
