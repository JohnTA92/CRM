# Customer management verification — 2026-09-26

- Applied customer_tags migration to live project; local filename matches remote 20260926181257.
- Permanently wired customer normalization tests and customer_tags SQL regression into npm run test:customers.
- Added npm run test:email for the existing email regression suite.
- Customer and email suites passed; production TypeScript/build passed.
- Refreshed localhost preview by restarting the Codex-owned development server.
- Signed-in owner checks: formatted +1 phone search matched TEST Alex Demo; duplicate panel identified the existing three records sharing a phone number and explained the reason.
- Entered TEST verification tag through the existing test customer's form; persisted after reload and matched list search. Removed through UI and verified removal after reload.
- Checked 390px mobile customer list/detail. Fixed overlapping contact information/tags using responsive rows and wrapping. Verified corrected render. Restored normal viewport.
- No customer merge/deletion, generated customer records, emails, or payments performed.
- Customer email button interaction was blocked by automatic approval review because it could send a live message; no alternate sending attempt was made. Email handler and SQL checks passed separately. Sending remains release-disabled.
- Included in the coordinated September 26 GitHub update.
