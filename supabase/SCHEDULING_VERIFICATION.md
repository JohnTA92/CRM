# Scheduling verification — September 24, 2026

Applied live migration `20260925041650_scheduling_integrity`.

## Changes

- Recurring successors are created by a database trigger in the same transaction as job completion, covering detail edits and crew completion. A unique parent-visit link prevents duplicate generation after retries/reopening. Weekly and biweekly intervals use calendar dates; monthly intervals preserve the anchor day and clamp to the last day of shorter months. Recurrence creates one next visit on completion, not a full future series.
- New visits retain the crew, time, duration, notes and price (or approved estimate total when price is absent). Checklist tasks are copied with new IDs and unchecked state. Old financial-document links are not reused.
- Staff approval of a portal request now reschedules or cancels the job atomically. Closed jobs cannot be changed this way; failed approval leaves the request pending. Cancellation is a job status, not deletion, and does not generate a recurring successor.
- Server validates schedule date/time, repeat interval, duration and nonnegative prices. Editing job duration is available in the app.
- Calendar uses crew_member_ids consistently, offers crew filtering and a New job shortcut with selected-date prefill. Invoiced visits remain visible; time-not-set visits have a separate day-view entry. Date buttons support keyboard navigation.
- Crew board flags overlapping timed visits sharing crew, including midnight crossings. Conflicts are warnings, not booking locks. Unknown start times cannot be checked, and the UI says so.
- Completed, invoiced and cancelled portal appointments move to appointment history. Completion timestamps support dashboard reporting.
- Crew/checklist/status save failures remain visible. Job/calendar/crew-board load failures show retry controls.
- Mobile navigation collapses into a menu; calendar/job detail fit narrow screens; wide crew weeks scroll within their panel.

## Checks

- `npm run test:scheduling`: PASS. Disposable local PGlite database exercises creation, leap-year/month-end/year rollover, repeat completion, preserved amount/reset checklist, approval rescheduling/cancellation, closed-job rejection/rollback, invalid duration and time without date. JavaScript tests cover shared/different crew, midnight overlaps, back-to-back appointments, cancelled visits, unknown times and portal grouping. Prior finance/security tests also pass.
- Production build: PASS; existing large-bundle advisory remains.
- Browser at 390×844: calendar and job detail fit viewport; menu opens and closes on navigation; crew week does not widen the page; October 1 day view shows the test visit without a time; New job prefilled October 1; unsaved form cancelled. Temporary viewport override reset.
- Live read-only verification: original 2 jobs preserved, 0 generated visits, 0 new completion timestamps. No existing requests approved or visits completed during testing.
- Supabase advisor: no new warnings; previous intentional portal SECURITY DEFINER and disabled leaked-password protection warnings remain. See [function guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [password guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Limits

Live lifecycle writes were not tested; tests used a disposable local database. Local tests do not simulate concurrent PostgreSQL sessions. Browser crew-conflict fixtures were not added to the live account. Recurrence has no end date/series editor yet; disabling repeats on the next visit stops future generation. Conflict warnings do not include travel time or availability rules. Dedicated field-worker invitations and live payment-save verification remain separate work.

App edits are local in the Tempo project; the database migration is live. No deployment, commit or pull request was created.
