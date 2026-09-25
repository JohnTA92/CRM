# Customer documents and estimate decisions

Live migration: `20260925051727_customer_documents_and_decisions`.

## Available workflows

- Staff can open estimates and invoices using View / Save PDF. Draft copies are clearly labeled DRAFT.
- Staff can publish a draft estimate to the customer portal without sending an email. The existing sent status represents availability to the customer; email delivery remains a separate action.
- Customers with active portal access can review issued documents, inspect line items and totals, and prepare a PDF. Invoice copies include recorded payments and remaining balance.
- Customers can approve or decline an open, unexpired, priced estimate after entering their name and confirming the displayed total. Staff preview cannot submit customer decisions.
- The private decision record stores authenticated actor, typed name, timestamp, decision, revision and the reviewed document snapshot. Repeated identical submissions return the existing decision. Conflicting responses fail.
- Decided estimates retain their reviewed document snapshot. Prices, terms, customer ownership and status cannot be changed afterward; create a new estimate for revised work. Linking the approved estimate to a job remains supported.
- PDF generation runs locally in the browser using pinned pdfmake 0.3.11 with bundled Roboto fonts, loaded only when requested. There is no external document conversion service or font request. Prepare PDF exposes Save PDF file and Open PDF links, plus a separate native print option.

## Access and validation

Authenticated document RPC checks business membership or active, unrevoked, unexpired access to the exact customer. Customers cannot see drafts or void invoices. Anonymous execute is revoked. Decision RPC rejects staff, revoked access, draft/expired/closed estimates and stale revisions; locks estimate and portal access through commit. Evidence table is private with RLS and no client grants. A private trigger protects decided content and a foreign key prevents deleting its source estimate.

## Verification

- `npm run test:documents`: passed. Local disposable PostgreSQL tests cover staff draft reads, customer document details/balances, draft/other-customer denial, staff decision denial, expired estimates, stale revisions, required signer, approve/decline, idempotent retry, conflicting decision rejection, private evidence access, immutable decided terms/status, job conversion, revoked reads/retries and anonymous denial. Prior security/finance/scheduling/property/employee suites also pass.
- Production build and diff whitespace checks passed. Existing large startup bundle warning remains; PDF engine/font chunks are lazy loaded.
- PDF generation test created one-page invoice and six-page/80-line estimate outside the app data. Rendered invoice and final estimate page inspected: wrapping, totals, page numbering, notes and decision record clear. Text extraction confirmed final item, total, accented text and decision. No test fixtures were seeded into live data.
- Browser: existing TEST invoice opened with correct DRAFT label, line item, $1 total, $0 recorded payments and $1 balance. Prepare PDF created visible Save PDF file/Open PDF links without error. The in-app browser did not expose a native print dialog or an observable file-download event; final file saving/opening in that embedded browser was not independently confirmed. Generated PDF bytes/layout were verified separately through the same generator.
- No live customer decision, new financial record, payment, email or SMS was submitted. Customer approval UI still needs an end-to-end check with an actual customer portal login; do not submit a live contractual approval automatically.
- Live read-only checks confirmed migration recorded, zero decisions created and anonymous execute denied for both new RPCs.

## Known follow-up work

- Email delivery is not implemented by this batch. Publish to portal does not send notification.
- This is typed-name decision evidence, not a drawn-signature service or legal-compliance certification.
- Automatic revised-estimate version chains and customer change requests are future work; decided documents are immutable.
- Optional property-specific route pins and real employee-device tests remain deferred.
- npm audit reported existing dependency advisories for router/build tooling, not pdfmake. Address those in a separate dependency-maintenance batch.
- Supabase advisor notices: four private deny-all RLS tables and ten intentionally callable scoped SECURITY DEFINER RPCs. Existing leaked-password protection warning remains. See [RLS advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [function advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

No production frontend deployment performed; database migration is live and source changes are tracked in Git.
