# Customer email foundation — deployed with sending disabled

## Scope

Manual invoice/estimate email uses an authenticated Edge Function. It loads the document and saved customer email under caller RLS, checks business membership explicitly, and builds escaped HTML from the existing document RPC. Browser-supplied recipients, subjects and HTML are rejected. Only published estimates and sent/overdue/paid invoices qualify (partial payments remain on sent/overdue invoices); emailing does not alter document status.

Migration 20260926180159_customer_email_delivery adds staff-readable, service-written attempt history, per-business serialization, 50/hour and one-per-document/minute limits, and durable request IDs. Processing/unknown outcomes block another attempt for that document until reconciled, even after a page reload. Provider acceptance is labelled acceptance, never inbox delivery.

## Activation requirements

Deploy the reviewed migration before the Edge Function. Keep JWT verification enabled. Set RESEND_API_KEY and CUSTOMER_EMAIL_FROM to an owned, provider-verified mailbox (not onboarding@resend.dev); store secrets only in Supabase. Release DELIVERY_RELEASED and set CUSTOMER_EMAIL_ENABLED=true only after sender verification and a separately authorized real delivery test. The business contact email must be valid for Reply-To. A read-only status action now supplies the email form with an accurate disabled/setup message. Migration and send-email v2 were deployed on September 26, 2026. No secret was configured and no email was sent. DELIVERY_RELEASED=false in the deployed entrypoint blocks sending even if environment secrets already exist.

Resend is retained from the pre-existing implementation, not a new provider purchase. No new dependency was added to the frontend. Function runtime dependency is pinned to supabase-js 2.110.0.

## Verification

Run `node --experimental-strip-types supabase/tests/local/email.test.mjs` and `npm run build`.
The tests use an in-memory PostgreSQL instance and mocked provider calls, never app records or live messages. They cover caller authentication, business authorization, injected recipient rejection, drafts, disabled configuration, HTML escaping, partial balance, accepted/failed/uncertain results, duplicate attempts, history isolation, and service-only writes.

## Still required before calling email complete

- Live RLS/grants and service-only claim access verified; unauthenticated Edge requests return 401. Advisors found no new email-specific warnings. Local tests cover owner/other-business history isolation. A signed-in browser check remains to be completed.
- Verify sender/domain and perform an explicitly authorized test delivery/reply.
- Add signed provider webhooks for delivered/bounced/complained events and an owner-visible reconciliation workflow. Until then, failed/unknown/processing attempts require provider-side review; do not blindly clear or resend.
- Add scheduled notifications only after manual delivery is verified. No scheduler, SMS, review requests or bulk email was enabled.
- Confirm actual mailbox rendering. HTML includes trusted document totals, customer name, line items, notes, business name and reply address. No online-payment link is added while Stripe is deferred.

Docs consulted: https://supabase.com/docs/guides/functions/auth, https://supabase.com/docs/guides/functions/auth-legacy-jwt, https://resend.com/docs/api-reference/emails/send-email, https://resend.com/docs/dashboard/emails/idempotency-keys.

## Live security verification, September 26

RLS enabled; anonymous SELECT and claim execution denied; authenticated INSERT/UPDATE and claim execution denied; authenticated SELECT uses business-membership policy; service role can claim. Zero attempts exist. Unauthenticated HTTP request returned 401. Existing advisory findings remain: intentional private deny-all tables ([RLS guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)), existing scoped definer RPCs ([RPC guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)), and previously disabled [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No new email advisory appeared.
