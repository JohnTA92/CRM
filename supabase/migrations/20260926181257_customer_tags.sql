-- Saved per-customer labels for search and filtering. Every value is entered by staff;
-- nothing is seeded. Tenant isolation is inherited rather than redefined: the existing
-- staff_business_access policy on public.customers is `for all`, and the existing
-- table-level grants already cover new columns, so no policy or grant change is needed.
alter table public.customers add column tags text[] not null default '{}'::text[];

-- Normalize on write so stored tags stay clean whatever the client sends: trim, drop
-- blanks, de-duplicate, and sort for stable display. Bounds are enforced here rather
-- than in a check constraint so the failure carries a message staff can act on.
create or replace function private.normalize_customer_tags() returns trigger
language plpgsql security invoker set search_path='' as $$
declare cleaned text[];
begin
 if new.tags is null then new.tags:='{}'::text[]; return new; end if;
 select coalesce(array_agg(distinct btrim(t) order by btrim(t)),'{}'::text[]) into cleaned
  from unnest(new.tags) as t where btrim(t)<>'';
 if coalesce(array_length(cleaned,1),0)>20 then
  raise exception 'A customer can have at most 20 tags.' using errcode='23514';
 end if;
 if exists(select 1 from unnest(cleaned) as t where length(t)>40) then
  raise exception 'Each tag must be 40 characters or fewer.' using errcode='23514';
 end if;
 new.tags:=cleaned;
 return new;
end $$;
revoke all on function private.normalize_customer_tags() from public,anon,authenticated;
create trigger normalize_customer_tags before insert or update on public.customers
 for each row execute function private.normalize_customer_tags();

create index customers_tags_idx on public.customers using gin(tags);
comment on column public.customers.tags is 'Staff-entered labels for search and filtering. Trimmed, de-duplicated and sorted on write; at most 20 tags of 40 characters each.';
