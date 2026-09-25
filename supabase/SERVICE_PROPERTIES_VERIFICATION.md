# Job service properties

Live migration: `20260925050149_job_service_properties`.

## Behavior

- Add service properties on the customer detail page. New Job and Edit Job allow selecting that customer's saved property or main address.
- The database enforces business/customer/property consistency and derives the saved service address. Existing jobs retain the current customer address as their initial snapshot; no property is guessed.
- Changing a customer/property address does not silently change a job's saved address. Saving job edits refreshes it from the selected source; the form explains this.
- Repeat visits retain the property selection and use its current saved address. Job details, staff routes, employee context and customer portal appointments use the job address.
- Referenced properties cannot be deleted. Property creation/edit/deletion errors are displayed instead of silently discarding the form or hiding the record.
- Employee route pins remain main-address pins only. Property jobs do not reuse those coordinates; property-specific pin entry remains future work. Address-based navigation remains available.

## Verification

- Production build and diff whitespace checks passed. Existing large JavaScript bundle warning remains.
- Local PostgreSQL suite passed: same-business/wrong-customer rejection, other-business rejection, blank property rejection, snapshot preservation, derived address overriding supplied text, recurrence, customer changes, portal address and restricted deletion.
- Employee context check passed: selected service address returned, main-address coordinates not incorrectly reused for property jobs. Existing scheduling and employee suites passed after the migration.
- Live migration applied; initial read-only check confirmed two existing jobs preserved with address snapshots and no guessed property assignments.
- Browser: entered a clearly labeled fictional property through the customer form, selected it on the existing TEST job through Edit Job, saved, and confirmed the address persisted after reload. Staff preview of the customer portal displayed the same address.
- Test record remains visible for review: TEST Alex Demo → [TEST] Secondary service location → 200 Test Lane. It is linked to the existing [TEST] Fake Verification Job — DO NOT SERVICE. This information was entered through normal app forms, not hardcoded or seeded.

No new employee accounts, invitations, GPS fixes, payments or customer communications were created during this batch. Real employee-device tests remain deferred. Frontend changes are local/source-controlled; no production frontend deployment was performed.
