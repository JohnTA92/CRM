# Employee field foundation — September 24, 2026

Live migration: `20260925043522_employee_field_foundation`.

## What is available

Owner: Crew → Employee access & locations. Add an active crew member and email; generate a seven-day invitation and share it manually. A replacement invalidates the previous unused token. Revoke removes the employee mapping, outstanding invite and latest location. No invitations were created or sent during development.

Employee: `/employee`. Create a separate login without a business name, verify its email, reopen the invitation, sign in and accept. The invitation is bound to the crew member’s current email; token replay and office-account acceptance are rejected. Existing owner/staff accounts remain separate. Invited employees arriving at the main app are redirected to their workspace.

Workspace: assigned-job/customer contact subset, shift clock-in/out, short/lunch breaks, assigned-job start/completion, task completion, photo uploads, recent own time entries, selected-day route, navigation links, foreground location controls. `/employee-preview` displays an empty workspace with writes and GPS disabled, available through Employee Hub in the sidebar and the Crew page. Hardcoded employee/customer/jobs/coordinates were removed; test records must be entered through the normal forms.

## Access model

Employees receive no business_members row or direct CRM data policies. Three private, RLS-enabled tables hold invitations (SHA-256 of a 244-bit random token), user-to-crew mapping and latest location. All client grants on these tables are revoked. Authenticated RPCs have empty search paths and explicit owner/employee/assignment checks; anonymous execution is revoked. Only owners manage access and see shared locations. RPCs are intentionally SECURITY DEFINER to perform narrowly allowed operations without granting employees broad job/customer/time-entry rights.

Job context omits prices, internal notes, email, payroll and financial documents. Storage upload permission checks the current employee, active crew, business and assigned job path; receipt storage remains unavailable. Photo attachment verifies an uploaded object and assignment before creating metadata. Employee completion invokes the existing recurring-visit transaction.

## Location behavior

- Off by default; Start requires an active shift outside a break and the device’s explicit browser permission.
- Collection and transmission only while the employee page is visible. Stop, break, clock-out, offline, pagehide and unmount clear collection. No automatic resume after hiding.
- Fresh fixes are throttled to at most one upload per 15 seconds, with a fresh-position request every 30 seconds while visible. A stopped/replaced sharing session cannot submit subsequent fixes. Break/clock-out/revocation clears server location state.
- The owner sees accuracy and last-update time. After two minutes without a fix, location is treated as stale and hidden; owner refresh clears expired coordinates. Only the latest fix is stored, no breadcrumb history. On a crash/offline stop, old coordinates can remain in the private table until a manager refresh, later start/stop, or revocation clears them; this is not an automatic timed retention purge.
- Browser location requires HTTPS in production (localhost is a development exception). This is foreground web location, not native/background tracking or proof of employee presence. Device coordinates can be inaccurate/spoofed.

Reference: [MDN geolocation watchPosition](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition).

## Route foundation

Owner saves verified coordinates for customer service addresses under Route setup. Pins are bound to the saved address; changing that address removes the old pin from employee route results until resaved. No automatic third-party geocoding is performed.

Employee route suggestions preserve timed appointment order and then order flexible, pinned stops using nearest-neighbor straight-line distance. The final timed stop (or current voluntarily shared location when there are no timed stops) is the starting point. Without an origin, the first flexible stop is the starting point. Missing-pin stops stay visible for manual review. Suggestions do not change schedules or promise road/traffic-aware optimal routes. Employees choose Google Maps navigation for individual stops. Travel-time constraints, map-provider optimization, depots, multi-property pins, offline work and persisted route plans are future work.

## Verification

- `npm run test:employee`: PASS. Pure route/lifecycle tests use fake device callbacks, never real GPS. Covers route order, closed/missing-pin stops, throttling, stale fixes, hidden-page and stop callbacks, permission denial.
- Disposable local PGlite SQL suite: PASS. Covers matching verified-email invitation/replay, outsider invitation/revocation denial, no office-table access, unassigned-job mutation/upload denial, whitelisted job context, idempotent shift/break actions, job checklist/completion/recurrence, valid/invalid/stopped/off-shift/on-break location sessions, receipt-storage denial, owner visibility and revocation. Prior financial/security/scheduling suites continue to pass.
- Production build and diff whitespace checks: PASS. Existing ~1.31 MB pre-gzip JavaScript bundle advisory remains.
- Earlier browser verification covered the owner setup panel and mobile workspace. The hardcoded sample workspace used during that check has since been removed at the user’s request. No live GPS permission requested.
- Live read-only checks: 0 employee accounts, 0 invitations, 0 locations; anonymous employee_context execution denied. No employees granted access during development.
- Advisor: expected informational notices for private tables with deny-all RLS/no client grants; intentional authenticated SECURITY DEFINER notices for seven constrained employee RPCs plus existing customer portal. Existing leaked-password protection warning remains. [Function advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [RLS advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [password guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Before real employee rollout

Deploy to an HTTPS address, verify Supabase email-confirmation redirect allowlist for `/employee`, create a designated employee test login, and test invitation confirmation, real phone GPS start/hide/stop, photos, breaks and revocation end-to-end. Localhost invitation links only work on the computer hosting that address. Live PostgREST employee mutations, real email delivery, physical-device GPS and storage upload have not been exercised. No production frontend deployment, commit or PR was created; app changes are local and the database migration is live.
