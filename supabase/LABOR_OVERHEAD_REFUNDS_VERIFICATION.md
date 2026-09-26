# Labor costing, overhead allocation, and recorded refunds

September 26, 2026. Implementation and local tests complete. User explicitly approved the exact live migration; it was applied successfully as 20260926210207. Read-only live checks confirmed RLS enabled, anonymous access denied, no authenticated refund updates/deletes, and security-invoker functions. No new advisor findings. No live refund or labor records were inserted.

## Behavior

- Job detail has a cost panel, actual job-time entry form, employee rate link, and labor-source selector. Time is entered explicitly; no sample data or invented hours are saved.
- New job-time entries save the current hourly crew rate server-side. Subsequent rate changes do not rewrite the saved rate. Existing historical time is not backfilled with guessed rates. Salary/missing-rate labor requires the manual logged-expense option or review.
- Overlapping job intervals for one employee are rejected. Completed time is split by UTC month, recorded breaks are subtracted as a union, and open/overlapping/invalid entries are flagged. Shift-only entries do not count as job work.
- **User-selected overhead method:** each month's unassigned `overhead` expenses are divided by that month's recorded job hours after breaks. Largest remainders distribute every cent once. Months without eligible hours stay unallocated and visible. Job-linked overhead remains a direct job cost.
- Each job chooses automatic time-based labor or logged `labor` expenses. The two sources are never added together. Recorded payroll/expenses still count in cash flow; automatic labor and allocation are estimates and are not additional cash transactions.
- Owner-only refund records refer to one original payment and require amount, return method, actual date/time, reason, and confirmation money was already returned. Each record includes the authenticated actor and server recording timestamp. No Stripe or bank request occurs.
- Refunds also credit the same invoice amount: original unpaid debt does not reopen. Original invoice total and gross payments are preserved; net billed and net retained receipts subtract refunds. Outstanding = original total minus gross payments. Historical cash flow subtracts refunds on their actual return date.
- Database locking caps cumulative refunds at the original payment amount. Same-reference retries are idempotent; conflicting retries fail. Refund records cannot be edited/deleted. Foreign-business and non-owner writes and anonymous access are rejected.
- Revenue, dashboard, customer/invoice totals, job estimates, customer document/PDF and portal refund totals use the new records. Stripe and outbound email remain deferred.

## Supabase migration

Prepared file: `20260926210207_labor_overhead_refunds.sql` (CLI-generated filename).

Adds `jobs.labor_cost_source`, `time_entries.labor_hourly_rate`, `invoices.refunded_total`, the RLS-protected `invoice_refunds` table, validation/cache triggers, and security-invoker `record_job_time` / `record_invoice_refund` functions. Existing portal/document functions retain their authorization checks and expose only the aggregate refund amount. Existing rows are preserved; no historical time/rate/payment/refund is invented.

## Tests passed

- `npm run test:reporting`: manual vs automatic labor, saved rates, break union, cross-month intervals, missing rates, open/overlapping time, exact-cent overhead, no-hours fallback, no cash double counting, and cross-year refunds. Includes prior reconciliation/1,207-row pagination tests.
- `npm run test:finance`: disposable PGlite migration and regression suite. New tests cover server rate capture, snapshot tampering, rate changes, interval overlap/future-time rejection, time retry, partial/full refunds, over-refund, duplicate/conflicting retry, precision/dates/reason, immutable records, cached-total tampering, staff vs owner vs foreign access, anonymous denial, and portal/document totals.
- `npm run build`: pass, existing large-bundle warning remains.
- `git diff --check`: pass.

## Remaining verification and limits

Live migration and post-deployment read-only checks passed. Signed-in browser checks passed for Revenue and job costing. Changed the existing test job from automatic labor to manual expenses, reloaded to confirm persistence, then restored automatic labor. Opened the actual job-time form and confirmed empty user-entry fields and the existing crew member’s missing-rate notice; no time was saved. Populated cases were tested locally; no live financial test transactions have been recorded.

- This is costing and refund record-keeping, not payroll, overtime calculation, tax accounting, or payment-provider refund processing.
- Unlogged labor/costs cannot be inferred. Historical entries with missing rate snapshots stay flagged. Manual entry uses the current rate shown in the form; it does not claim to know a historical rate.
- Cash flow and estimated profit deliberately use different cost bases. Costing is all-time with monthly overhead pools; it is not a closed-period accounting ledger. New/corrected job hours can change prior allocations.
- Separate paginated reads are not a transactionally consistent reporting snapshot. Existing count/duplicate checks and ledger mismatch checks remain; refresh after concurrent changes.
- Refunds are immutable; a future audited reversal/correction workflow is needed for erroneous refund records. The form explains this before saving.
- Local locking behavior is reviewed and tested sequentially; truly concurrent sessions are not simulated by the single-connection local harness.

Pre-deployment advisor baseline: four intentionally private deny-all RLS tables, ten existing scoped security-definer RPC warnings, and existing disabled leaked-password protection. [RLS advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [function advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Deployment verification

Live migration: `20260926210207_labor_overhead_refunds`. Read-only checks confirmed `invoice_refunds` RLS, no anonymous reads or function execution, and no authenticated refund update/delete privileges. Both new RPCs are security invoker. Security advisor findings are unchanged from the baseline above. The live ledger remains at zero refunds and zero saved hourly-rate entries. App validation completed before release; see Git history for the release commit.

Final browser check: the existing unpaid draft invoice displays Refunds and credits with no refund action available until a payment exists. The live crew member has no hourly rate; the job-time form correctly labels it missing rather than supplying a generated rate. No hours, payments, or refunds were submitted.
