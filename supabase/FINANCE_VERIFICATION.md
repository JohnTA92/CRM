# Invoice and payment verification — September 24, 2026

## Delivered

Applied live migration `20260925040233_invoice_payment_integrity` to project `ekfnjswozausgebvbwew`.

- Server calculates document totals from validated line items, rounding each line to cents. Quantity accepts up to three decimal places; unit price accepts two. UI uses integer arithmetic for matching previews.
- Job-to-invoice uses approved estimate items or the job's positive price. Missing prices produce a clear error. Existing linked documents are reused on retry.
- Approved estimate-to-job creates an unscheduled draft job and links both records transactionally. Creating an estimate from a job also links both records in one transaction.
- Recording a payment locks the invoice, validates the remaining balance, inserts a payment with a client-generated retry ID, and updates invoice balance/status in the same transaction. Duplicate retries reuse the payment. Ledger entries cannot be overwritten/deleted; a future audited adjustment/refund workflow is required.
- Paid invoices require recorded payments. Payments cannot exceed the balance. Invoices with payments cannot be voided, reassigned to another customer/business, or reduced below the amount received.
- Invoice lists/details, customer totals, staff dashboard, revenue reports and portal balances use recorded payments. Invoice email content now distinguishes total, paid and remaining amount. No emails were sent.
- Financial forms keep errors visible and retain entered values. Financial list/report load failures show errors instead of silently accepting failed responses.
- Stripe remains disabled, as requested.

## Verification

`npm run test:finance`: PASS. Tests run entirely in disposable local PGlite PostgreSQL, not the live database. Covers fractional rounding, invalid quantities/prices, authoritative totals, missing job price, conversion retry/link integrity, partial/full payments, retry conflict, overpayment, payment precision, ledger immutability, total below payments, paid-total tampering, void prevention, cross-account denial, anonymous RPC denial, and staff portal balance/privacy. Existing security regression suite also passes.

`npm run build`: PASS. Existing large-bundle advisory remains (~1.29 MB JS before gzip).

`git diff --check`: PASS.

Live read-only checks after migration: 2 draft invoices totaling $1.00, paid_total $0.00, 0 payment records. Anonymous payment RPC execution denied; authenticated conversion RPC execution granted. The historical empty $0 draft is preserved and must be given valid charges before issuance.

Browser checks: refreshed dashboard and invoice/revenue pages load; invoice list/detail shows $1 remaining on the test invoice; payment form explains it records money already received and does not charge a card; unsaved edit preview of quantity 0.5 × $0.01 displays $0.01; edits canceled; staff customer portal still loads and hides drafts.

## Limits and remaining work

- Automatic approval review blocked the live browser Save Payment test because it could attempt a financial write. No browser payment was submitted. Positive payment and conversion writes were verified locally, not end-to-end through live PostgREST. Local tests do not simulate truly concurrent database sessions; transaction/row-lock behavior was reviewed.
- Refunds/adjustments, Stripe activation, actual email delivery, and dedicated customer-login testing are outside this batch.
- Supabase security advisor retains the existing intentional authenticated `get_portal_data` SECURITY DEFINER warning. The function checks business membership or unexpired customer access and returns allowlisted fields. [Advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- Supabase leaked-password protection remains disabled, an existing separate configuration item. [Supabase guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- App changes are local in the Tempo project; the database migration is live. No deployment, commit, or pull request was created.
