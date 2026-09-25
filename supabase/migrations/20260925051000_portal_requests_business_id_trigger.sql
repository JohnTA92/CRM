-- 20260925051000_portal_requests_business_id_trigger.sql
-- PREPARED, NOT APPLIED. Extends 20260925050000_portal_requests_and_messages.sql.
--
-- business_id on service_requests/portal_messages/job_schedule_requests is never
-- client-controlled: this trigger always derives it server-side from the row's
-- customer_id (the one thing a portal session's insert is already validated
-- against via customer_portal_access), so the frontend never needs to know or
-- send a business_id for these inserts, and a client can't attempt to pair a
-- real customer_id with a mismatched business_id.

create or replace function set_portal_request_business_id()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select business_id into new.business_id from customers where id = new.customer_id;
  return new;
end;
$$;

drop trigger if exists service_requests_set_business_id on service_requests;
create trigger service_requests_set_business_id
  before insert on service_requests
  for each row execute function set_portal_request_business_id();

drop trigger if exists portal_messages_set_business_id on portal_messages;
create trigger portal_messages_set_business_id
  before insert on portal_messages
  for each row execute function set_portal_request_business_id();

drop trigger if exists job_schedule_requests_set_business_id on job_schedule_requests;
create trigger job_schedule_requests_set_business_id
  before insert on job_schedule_requests
  for each row execute function set_portal_request_business_id();
