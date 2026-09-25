-- 0003_null_business_id_report.sql
-- READ-ONLY. No table is altered and no rows are updated by this file.
--
-- Every existing customers/jobs/invoices/estimates row currently has business_id =
-- null. There is no reliable relationship in the current data to infer the correct
-- business from (customers.created_by / customers.org_id / jobs.created_by /
-- jobs.org_id are null on every row; invoices and estimates don't even have a
-- created_by column). Guessing would risk assigning one business's real customer
-- data to a different business — not acceptable. This file only reports the
-- current ambiguity; you decide and fill in the manual block at the bottom
-- yourself, per business, after confirming ownership.
--
-- Run the report section below in the Supabase SQL editor to see exactly what's
-- affected right now:

select 'customers' as table_name, count(*) as null_business_id_rows
from customers where business_id is null
union all
select 'jobs', count(*) from jobs where business_id is null
union all
select 'invoices', count(*) from invoices where business_id is null
union all
select 'estimates', count(*) from estimates where business_id is null
union all
select 'crew_members', count(*) from crew_members where business_id is null;

-- Per-row detail, so you can match each one to the correct business by hand:
select id, name, email, phone, created_at
from customers
where business_id is null
order by created_at;

select b.id as business_id, b.name as business_name, b.owner_id
from businesses b
order by b.name;

-- ─────────────────────────────────────────────────────────────────────────────
-- MANUAL BACKFILL — commented out on purpose. Nothing below this line runs
-- automatically. Uncomment and fill in the real business_id(s) yourself once
-- you've confirmed ownership above. If more than one business is involved, split
-- this into one UPDATE per business, scoped by customer id list.
-- ─────────────────────────────────────────────────────────────────────────────

-- update customers   set business_id = '<paste-confirmed-business-id-here>' where business_id is null;
-- update jobs        set business_id = '<paste-confirmed-business-id-here>' where business_id is null;
-- update invoices    set business_id = '<paste-confirmed-business-id-here>' where business_id is null;
-- update estimates   set business_id = '<paste-confirmed-business-id-here>' where business_id is null;
-- update crew_members set business_id = '<paste-confirmed-business-id-here>' where business_id is null;

-- IMPORTANT: 0004 (RLS tightening) will make staff unable to see any row still left
-- with business_id = null after it's applied (neither the old public policy nor the
-- new business_members-scoped policy will match a null business_id). Run this
-- backfill BEFORE or immediately after applying 0004 — otherwise the 5 existing
-- test customers and their jobs/invoices/estimates will disappear from the staff UI
-- until backfilled.
