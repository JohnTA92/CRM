# Reporting and job contributions — September 26, 2026

## Changes

- Revenue reports distinguish selected-year recorded payments/expenses from all-time issued invoice reconciliation and job contributions.
- Invoice reconciliation uses the payment ledger, excludes draft/voided invoices, shows billed/received/outstanding/overdue, and warns on cached paid-balance mismatches, missing invoices, overpayments, and payments on unissued documents.
- Job reporting includes every issued invoice and logged expense linked to each job. It separates billed less costs from received cash less costs. Unassigned expenses and invoices are disclosed separately.
- Job detail economics now totals all issued invoices linked to that job, rather than treating one draft invoice or estimate as revenue. Errors loading its financial records hide the calculation.
- Costs and differences are summed in cents. Dashboard expenses stop at today for current-period totals, matching its payments. Cash-flow labels no longer call these totals a profit-and-loss statement.
- Revenue, dashboard, and job financial queries load all ordered pages within existing business filters/RLS. Failed pages, changed counts, or duplicate IDs fail with an error instead of displaying partial totals. Loading/no-business states do not display stale financial totals on Revenue/Dashboard.
- Revenue layout stacks summary cards and charts on small screens. Tables have their own horizontal scrolling.

## Validation

- `npm run test:reporting`: PASS. Covers partial payments, cross-year cash vs billed values, multiple invoices per job, draft/void exclusions, overdue boundaries, UTC offsets, unassigned costs/revenue, negative/empty cash flow, numeric strings/cent precision, ledger inconsistencies, and 1,207 rows with a server page cap smaller than requested. Also covers failed, empty, shifted, and duplicate pages.
- `npm run test:finance`: PASS, including existing isolated PostgreSQL finance/security regression coverage.
- `npm run build`: PASS. Existing large JavaScript bundle warning remains.
- `git diff --check`: PASS.
- Signed-in live Revenue page loads existing Test Business data. Desktop (1280 px) and narrow layout inspected. Its $0 issued/$0 received/$0 expense values and no-balance-mismatch result match a separate read-only Supabase aggregate query. Two existing draft invoices remain excluded.
- No live data was inserted or changed. No test customers, invoices, payments, or expenses were generated in the app. No migration or permission change required.

## Limits

- Populated financial cases were tested using local fixtures, not written to the live project. Current live business has no issued revenue or expenses, so a populated job table has not been visually verified with real records.
- Contribution is not final accounting profit. Automatic labor costing, hour-weighted overhead allocation, and recorded refunds were added in the follow-up documented in LABOR_OVERHEAD_REFUNDS_VERIFICATION.md. Tax treatment, refund reversals, and Stripe remain deferred.
- Selected-year charts cover the entire calendar year. Invoice and job reconciliation is explicitly all-time, not a historical balance-as-of report. Timestamp grouping uses UTC; expense dates retain the entered calendar day.
- Separate paginated reads are not a transactional database snapshot. Count/duplicate checks catch common concurrent changes, and invoice ledger checks highlight mismatches, but same-count edits can still occur during loading. Refresh if records change while viewing; a server-side snapshot/reporting RPC is a future scaling improvement.
- Validation completed before release; see Git history for the release commit.

## Reference

Pagination follows the Supabase [range documentation](https://supabase.com/docs/reference/javascript/using-modifiers-range): stable ordering and inclusive range bounds. The September 26 changelog was reviewed; current changes use existing select/count/range APIs and require no database upgrade or extension changes.
