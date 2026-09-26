# Admin operations — deployed with explicit approval

September 26, 2026. Migration: 20260926183939_admin_operations.sql.

## Prepared changes

- Replace eight admin Edge entrypoints with a shared authenticated handler. JWT verification must remain enabled when deployed.
- Service-only admin_operation RPC checks current server-owned admin flags; ordinary app roles cannot invoke it or access the audit/announcement tables directly. Authenticated users can retrieve only the active banner's public fields through the authenticated endpoint.
- Business changes, support updates, announcements, and team changes commit with their audit evidence in one database transaction. Failed audit inserts roll back the mutation. Announcement replacement is serialized.
- Super admins alone can manage ordinary admin flags. Self-changes and changes to super-admin accounts are rejected. Team changes update only server-owned is_admin metadata and preserve other keys; no accounts or emails are created. Every admin endpoint rechecks current flags, including after revocation.
- Input validation, record-not-found errors, support reopen timestamps, and owner email joins are corrected. Lists no longer rely on the first page of Auth users.
- Frontend displays backend errors, preserves failed input, removes client-authored audit requests, and displays billing revenue as unavailable rather than calculating businesses × $49.
- Stripe sync and admin password-reset email remain disabled, with an explicit setup message. No external messages or billing actions were tested.

## Validation

npm run test:admin passes SQL and HTTP regressions using an isolated in-memory database. Covers permissions, invalid actions, not-found records, support reopen, announcement replacement, audit rollback, admin grant/revoke, metadata preservation, authentication, and error responses.

Existing customer, finance/security/scheduling/employee/document suites and email tests pass. Production build passes (existing large-bundle warning).

Signed-in browser: Businesses and Revenue render existing records; revenue clearly states billing is not connected. Missing deployed audit backend now surfaces an error rather than presenting a successful empty list. Live admin mutations are not exercised before deployment approval.

## Deployment status

Deployed September 26 after the user's explicit approval. Migration version 20260926183939 is applied. All eight admin endpoints are ACTIVE with JWT verification enabled. No user's admin status was changed, no records were deleted, and no announcement or email was sent.

Live privilege checks: anon/authenticated cannot invoke admin_operation; service_role can. Direct authenticated audit reads and anonymous announcement reads are denied; RLS remains enabled. Unauthenticated HTTP calls to all eight endpoints return 401. Signed-in Businesses, Support, Announcements, Audit Log, and Team load successfully. Team shows the existing account as super admin; empty support/announcement/audit tabs return successful empty states.

Security advisors report no new admin findings. Existing findings remain: intentional private deny-all tables, scoped authenticated definer RPCs, and disabled leaked-password protection. References: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy ; https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable ; https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .

Local admin tests pass after deployment and filename alignment. Real access grants/revocations and announcement publication were deliberately not used as live tests. They are covered by isolated SQL/HTTP tests. Included in the coordinated September 26 GitHub update.
