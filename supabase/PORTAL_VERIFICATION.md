# Portal foundation verification — 2026-09-24

## Applied

- Project: CRM (`ekfnjswozausgebvbwew`).
- Test Business (`a3c15303-9344-48ae-800c-4e1d7b99fb09`) belongs to the existing admin owner. Five customers, two jobs, two invoices and one estimate are assigned. No payment status was changed.
- Migration `20260925022819_portal_access_foundation_reviewed` is applied remotely. The matching file in migrations is the canonical version. Earlier 0001–0005 drafts were moved to migration-drafts to prevent duplicate application; their comments describe the old draft state.
- `portal-invite` version 2 is deployed with JWT verification enabled and caller membership checked in the function.
- Direct customer/job/estimate/invoice table access is staff-only. Customer display uses `get_portal_data` with explicit caller/customer/business/expiry/revocation checks and a fixed output field list. Drafts, void invoices, internal notes and payment secrets are excluded.
- Nonrecursive membership policy replaces the original self-referencing policy. Staff preview is explicit and uses the staff client. Customer and staff sessions use separate storage.
- Every invite gets a dedicated synthetic Auth principal, never a login for a customer's real email or an existing staff/admin account. It has no business membership. Revocation blocks its portal grant. No actual email or SMS is sent. The generated link is a credential and must only be shared with its intended customer.
- Stripe stays unavailable. APP_URL currently falls back explicitly to the localhost development URL; a real deployment URL must be configured before customer launch.

## Verified

- `supabase/tests/portal_access.sql` passed before application inside a rolled-back migration rehearsal, then again against the applied schema. It uses database roles and JWT subject settings to exercise actual RLS and RPC authorization; it is not an end-to-end Auth test. All temporary fixtures roll back.
- Owner and employee access to their business; another business excluded; customer direct table reads and invoice writes blocked; scoped customer RPC access; other-customer denial; revoked and expired denial; unauthenticated table/RPC denial; hidden drafts and internal fields.
- Browser: existing admin customer page loads, generate fake-customer invitation, redeem once, load scheduled fake job, omit draft invoice, refresh persists, another customer's URL denied, revoke through staff UI, subsequent customer request denied, staff preview still loads. Test invitations were revoked at the end.
- Vite production bundling passes (existing large-chunk warning).
- `git diff --check` passes.

## Remaining / limits

- Full `npm run build` fails in TypeScript checking in other app/canvas areas (ImportMeta.env types, MediaModal, MediaPage, RoutePage and Tempo canvas types). The root `npm run typecheck` uses a references-only config and is not sufficient evidence of a full typecheck. Do not describe the full build as passing.
- Supabase security advisor reports the intentionally callable, explicitly authorized SECURITY DEFINER portal RPC and existing disabled leaked-password protection. Review this privileged endpoint on changes; do not remove its access checks. Email confirmation was not disabled.
- Real onboarding must maintain business_members for future owners/employees, and staff login/business selection currently remains owner-oriented. Current owner test account is verified; ordinary employee UI onboarding is not verified.
- No public app deployment, real customer messaging, or payment occurred. Portal expansion phases beyond this foundation remain pending.
- Do not rerun old 0001–0005 drafts or overwrite this tested foundation with the prior plan. Extend the timestamped migration history with new migrations.

## Phase 2 fixes verified — 2026-09-24 (Pacific)

Applied remote migration `20260925030206_portal_requests_and_confirmed_signup_reviewed` to CRM. The three previously unapplied draft migrations have been consolidated into this canonical file; do not reapply the old drafts.

- Created service_requests, portal_messages, job_schedule_requests with tenant-scoped staff permissions and customer-only INSERT/SELECT policies. The private authorization helper checks the caller's current, unexpired grant and matching customer/business without exposing grant rows. Customer status forgery and staff sender impersonation are blocked.
- Derived business_id from customer on the server; validated job/customer relationships and required reschedule dates; prevented reassigning request ownership.
- Confirmed signup provisions business, owner membership, and company settings atomically. Unconfirmed signup does not attempt browser writes. User metadata supplies a display name only. Portal-only principals are excluded. Billing/ownership fields cannot be updated by the browser.
- Added load, mutation, and messaging error displays; retry for staff inbox; duplicate-send guards and per-customer reply drafts. Staff preview is read-only.
- Fixed the TypeScript errors in the application and Tempo canvases. `npm run build` passes (remaining non-failing large-bundle warning).

### Verification

Both `supabase/tests/portal_access.sql` and `supabase/tests/portal_requests.sql` passed on the connected database with all fixtures rolled back. Coverage includes confirmed/unconfirmed signup, idempotent provisioning, customer inserts/read-back, staff updates/replies, unrelated-business isolation, forged status/sender denial, private grant rows, missing date/foreign job rejection, expiry/revocation, anonymous denial, and protected billing fields.

Browser test with TEST Alex Demo passed: submit service request, send message, submit reschedule request, staff marks request Reviewed, approves reschedule, sends reply; customer refresh shows status and reply. Missing date displays validation. Subsequent cancellation saves and staff can decline. Revoking test access blocks the portal and further writes. Fake service/message/schedule rows remain clearly marked TEST for review; the test invite was revoked. No email/SMS or payment was sent. The actual job date was not changed.

Signup's database provisioning was tested using rolled-back synthetic auth records. Actual email delivery/confirmation was not exercised; this requires a real mailbox test before launch.

### Remaining intentional limits / follow-up

- Schedule approval records a decision only; staff must edit the actual job schedule in Jobs. The inbox states this.
- Stripe activation and final branding remain deferred.
- New employee invitation UI is still a separate backlog feature.
- Security advisor reported no new findings from these changes. Existing intentional `get_portal_data` SECURITY DEFINER endpoint remains explicitly scoped and regression-tested: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- Existing leaked-password protection setting is disabled; assess/enable before launch: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
