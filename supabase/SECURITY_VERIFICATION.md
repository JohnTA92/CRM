# Security repair batch — September 24, 2026

## Applied

Remote migration `20260925033819_security_and_private_storage` on project `ekfnjswozausgebvbwew`, after explicit user approval. Local migration filename matches remote history.

- Replaced legacy public policies on expenses, services, job media, crew, payments, time entries, and customer properties with authenticated business membership rules.
- Revoked anonymous table privileges and authenticated TRUNCATE/REFERENCES/TRIGGER privileges on these tables.
- Added tenant-consistent references among customers, jobs, estimates, invoices, properties, expenses, media, payments, and time entries; checked crew assignments against the job business.
- Required business ownership for new/updated records in the seven repaired tables. Historical null-owned records are preserved by NOT VALID constraints, not guessed or deleted.
- Made job-media private and created private expense-receipts, with business-prefixed object paths, scoped read/write/delete rules, and upload limits.
- Scoped service keys to their business and added crew pay fields used by the existing editor.

## Application changes

- Media uploads persist object paths; display components request one-hour signed URLs and refresh them while mounted.
- Expense receipt upload completes before expense creation; upload/record failures keep the form open and show an error. Failed record creation attempts to remove its newly uploaded file.
- Media and receipt deletion reports failures instead of silently claiming success.
- Crew routes require actual staff authentication, including in development mode. Crew time/media writes include business ownership; settings load by the crew business.
- Service lists are queried per business and user lifecycle, with no shared account-data cache.
- Onboarding uses the actual service schema, reports save errors, refreshes business state on completion, and saves the portal contact phone. Removed the nonfunctional default-price field; prices remain editable on estimates/jobs.

## Verification

- Production build passes. Existing large-bundle warning remains.
- `npm run test:security` passes against a disposable local PostgreSQL-compatible PGlite database. It exercises the exact migration and SQL regression test with synthetic records: staff reads/updates, business reassignment denial, cross-business read/update/delete denial, invalid customer/crew links, missing business IDs, scoped storage, anonymous privileges, and same service keys in different businesses.
- `supabase/tests/local/schema.sql` is a structural snapshot of relevant live tables, without customer data. The harness models auth identity, roles, membership policies, and storage tables/functions; it is not a full Supabase Auth/Storage server integration test.
- Live read-only checks: no anonymous grants remain on the seven repaired tables; anonymous crew/time reads and payment inserts lack privileges; anonymous file listing returns zero; both buckets are private.
- Browser: media and expenses screens load for the owner; customer staff-preview portal still loads requests/messages/appointments; the legacy unassigned crew link shows access unavailable.
- No existing storage objects required migration. One unassigned crew record and three unassigned time records remain preserved and hidden from staff until ownership is verified.
- `git diff --check` passes.

## Approval and testing boundary

Automatic review rejected a combined live schema/test SQL batch and then required explicit approval for the exact migration. The user approved the migration and it was applied successfully. Automatic review separately rejected temporary live test-user/data writes, even with rollback. Those writes were not executed; write-policy tests ran locally instead. Actual browser file upload/download and independent signed-out/employee end-to-end tests remain to be completed in an approved test environment.

## Remaining work

- Dedicated employee invitation/login mapping and assignment-only permissions. Current crew access is limited to business staff, not a completed least-privilege employee portal.
- Verify ownership before assigning the four legacy records; validate historical constraints after cleanup.
- Invoice/partial-payment consistency, recurring jobs, scheduling, mobile layout, missing email/admin functions, and the rest of the full-review roadmap remain open.
- Supabase advisors still flag the intentionally authenticated, internally authorized `get_portal_data` definer RPC and disabled leaked-password protection. This batch adds no public definer RPC.
- Dependency audit reports nine existing findings (four high, four moderate, one low) across Vite/PostCSS/router and transitive tooling packages. The added pinned PGlite dev dependency is not in that finding list. Dependency updates need their own compatibility pass.
- Stripe activation and final branding remain deferred.

## References checked

- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/storage/buckets/fundamentals
- https://supabase.com/changelog
- https://pglite.dev/docs/
