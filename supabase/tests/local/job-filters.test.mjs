import assert from 'node:assert/strict';
import {
  computeDateRange, isJobInDateRange, matchesStatusTab, matchesJobType,
  matchesEmployeeFilter, matchesJobQuery, formatJobIdRef,
} from '../../../src/lib/jobFilters.ts';

const TODAY = '2026-10-19';

// --- computeDateRange ---
assert.deepEqual(computeDateRange('all', undefined, TODAY), { startISO: null, endExclusiveISO: null });
assert.deepEqual(computeDateRange('last30', undefined, TODAY), { startISO: '2026-09-20', endExclusiveISO: '2026-10-20' });
assert.deepEqual(computeDateRange('last90', undefined, TODAY), { startISO: '2026-07-22', endExclusiveISO: '2026-10-20' });
assert.deepEqual(computeDateRange('thisYear', undefined, TODAY), { startISO: '2026-01-01', endExclusiveISO: '2027-01-01' });
assert.deepEqual(computeDateRange('lastYear', undefined, TODAY), { startISO: '2025-01-01', endExclusiveISO: '2026-01-01' });
// Custom range: inclusive start, exclusive day-after-end.
assert.deepEqual(computeDateRange('custom', { start: '2026-10-01', end: '2026-10-19' }, TODAY), { startISO: '2026-10-01', endExclusiveISO: '2026-10-20' });
// Year-boundary custom range still adds one day correctly.
assert.deepEqual(computeDateRange('custom', { start: '2026-12-01', end: '2026-12-31' }, TODAY), { startISO: '2026-12-01', endExclusiveISO: '2027-01-01' });
// Missing custom bounds degrade to no filter rather than throwing.
assert.deepEqual(computeDateRange('custom', undefined, TODAY), { startISO: null, endExclusiveISO: null });

// --- isJobInDateRange ---
const allRange = computeDateRange('all', undefined, TODAY);
const last30 = computeDateRange('last30', undefined, TODAY);
// "All dates" includes unscheduled jobs.
assert.equal(isJobInDateRange(null, allRange), true);
assert.equal(isJobInDateRange(undefined, allRange), true);
// A specific range excludes unscheduled jobs.
assert.equal(isJobInDateRange(null, last30), false);
// Inclusive start boundary (midnight UTC of the start date is IN range).
assert.equal(isJobInDateRange('2026-09-20', last30), true);
// Exclusive end boundary: the end-exclusive date itself is NOT in range.
assert.equal(isJobInDateRange('2026-10-20', last30), false);
// The day before the exclusive end IS in range.
assert.equal(isJobInDateRange('2026-10-19', last30), true);
// One day before the start is out of range.
assert.equal(isJobInDateRange('2026-09-19', last30), false);
// A date-time string is compared on its date portion only (no timezone conversion).
assert.equal(isJobInDateRange('2026-10-19T00:00:00.000Z', last30), true);

// --- matchesStatusTab ---
assert.equal(matchesStatusTab({ status: 'scheduled' }, 'all', TODAY), true);

// Overdue: open status + date strictly before today.
assert.equal(matchesStatusTab({ status: 'scheduled', scheduled_date: '2026-10-18' }, 'overdue', TODAY), true);
assert.equal(matchesStatusTab({ status: 'in-progress', scheduled_date: '2026-10-01' }, 'overdue', TODAY), true);
// A completed job with an old date is NEVER overdue.
assert.equal(matchesStatusTab({ status: 'complete', scheduled_date: '2026-01-01' }, 'overdue', TODAY), false);
assert.equal(matchesStatusTab({ status: 'cancelled', scheduled_date: '2026-01-01' }, 'overdue', TODAY), false);
assert.equal(matchesStatusTab({ status: 'invoiced', scheduled_date: '2026-01-01' }, 'overdue', TODAY), false);
assert.equal(matchesStatusTab({ status: 'draft', scheduled_date: '2026-01-01' }, 'overdue', TODAY), false);
// No scheduled date at all is never overdue.
assert.equal(matchesStatusTab({ status: 'scheduled', scheduled_date: null }, 'overdue', TODAY), false);
// Today itself is not overdue (overdue requires strictly before today).
assert.equal(matchesStatusTab({ status: 'scheduled', scheduled_date: TODAY }, 'overdue', TODAY), false);

// Upcoming: open status + date today or later.
assert.equal(matchesStatusTab({ status: 'scheduled', scheduled_date: TODAY }, 'upcoming', TODAY), true);
assert.equal(matchesStatusTab({ status: 'quoted', scheduled_date: '2026-11-01' }, 'upcoming', TODAY), true);
assert.equal(matchesStatusTab({ status: 'scheduled', scheduled_date: '2026-10-18' }, 'upcoming', TODAY), false);
assert.equal(matchesStatusTab({ status: 'complete', scheduled_date: '2026-11-01' }, 'upcoming', TODAY), false);
assert.equal(matchesStatusTab({ status: 'scheduled', scheduled_date: null }, 'upcoming', TODAY), false);

// Done: complete or invoiced, regardless of date.
assert.equal(matchesStatusTab({ status: 'complete' }, 'done', TODAY), true);
assert.equal(matchesStatusTab({ status: 'invoiced' }, 'done', TODAY), true);
assert.equal(matchesStatusTab({ status: 'scheduled' }, 'done', TODAY), false);

// Paid: only the linked invoice's own status, never inferred from job status.
assert.equal(matchesStatusTab({ status: 'invoiced' }, 'paid', TODAY, 'paid'), true);
assert.equal(matchesStatusTab({ status: 'invoiced' }, 'paid', TODAY, 'sent'), false);
assert.equal(matchesStatusTab({ status: 'invoiced' }, 'paid', TODAY, null), false);
assert.equal(matchesStatusTab({ status: 'complete' }, 'paid', TODAY, undefined), false);

// --- matchesJobType ---
assert.equal(matchesJobType('weekly', 'all'), true);
assert.equal(matchesJobType('weekly', 'recurring'), true);
assert.equal(matchesJobType('none', 'recurring'), false);
assert.equal(matchesJobType('none', 'oneoff'), true);
assert.equal(matchesJobType('monthly', 'oneoff'), false);
// The column is NOT NULL at the schema level, but the function still treats a
// missing value defensively as non-recurring rather than trusting that forever.
assert.equal(matchesJobType(null, 'recurring'), false);
assert.equal(matchesJobType(undefined, 'recurring'), false);
assert.equal(matchesJobType(null, 'oneoff'), true);
assert.equal(matchesJobType(undefined, 'all'), true);

// --- matchesEmployeeFilter ---
assert.equal(matchesEmployeeFilter(['a', 'b'], [], false), true); // no filter active
assert.equal(matchesEmployeeFilter(['a', 'b'], ['b'], false), true);
assert.equal(matchesEmployeeFilter(['a', 'b'], ['c'], false), false);
assert.equal(matchesEmployeeFilter([], ['a'], false), false);
assert.equal(matchesEmployeeFilter([], [], true), true); // Unassigned only, empty array matches
assert.equal(matchesEmployeeFilter(null, [], true), true);
assert.equal(matchesEmployeeFilter(['a'], [], true), false); // Unassigned only, assigned job excluded
assert.equal(matchesEmployeeFilter([], ['a'], true), true); // Unassigned OR employee a

// --- matchesJobQuery ---
const job = { idRef: 'A1B2C3D4', title: 'Weekly Lawn Mow', serviceAddress: '123 Main St, Austin' };
assert.equal(matchesJobQuery(job, '', 'Jane Smith'), true);
assert.equal(matchesJobQuery(job, 'a1b2c3d4', 'Jane Smith'), true); // case-insensitive id ref
assert.equal(matchesJobQuery(job, 'lawn', 'Jane Smith'), true); // partial title
assert.equal(matchesJobQuery(job, 'jane', 'Jane Smith'), true); // customer name
assert.equal(matchesJobQuery(job, 'main st', 'Jane Smith'), true); // address
assert.equal(matchesJobQuery(job, 'nomatch', 'Jane Smith'), false);
assert.equal(matchesJobQuery({ idRef: 'X', title: 'Y' }, 'anything', 'Z'), false); // missing serviceAddress never throws

// --- formatJobIdRef ---
assert.equal(formatJobIdRef('a1b2c3d4-0000-4000-8000-000000000000'), 'A1B2C3D4');
assert.equal(formatJobIdRef('12345678901234567890'), '12345678');

// --- Combined filters use AND, not OR (mirrors JobsPage.tsx's baseFiltered/filtered) ---
function passesAllFilters(job, { status, jobType, dateRange, employeeIds, includeUnassigned, query, customerName }) {
  if (status !== 'all' && job.status !== status) return false;
  if (!matchesJobType(job.recurring, jobType)) return false;
  if (!isJobInDateRange(job.scheduled_date, dateRange)) return false;
  if (!matchesEmployeeFilter(job.crew_member_ids, employeeIds, includeUnassigned)) return false;
  if (!matchesJobQuery({ idRef: formatJobIdRef(job.id), title: job.title, serviceAddress: job.service_address }, query, customerName)) return false;
  return true;
}

const candidate = {
  id: 'a1b2c3d4-0000-4000-8000-000000000000',
  status: 'scheduled',
  recurring: 'weekly',
  scheduled_date: '2026-10-15',
  crew_member_ids: ['crew-1'],
  title: 'Weekly Lawn Mow',
  service_address: '123 Main St',
};
const within = { status: 'scheduled', jobType: 'recurring', dateRange: last30, employeeIds: ['crew-1'], includeUnassigned: false, query: 'lawn', customerName: 'Jane Smith' };
// Matches every individual filter -> passes overall.
assert.equal(passesAllFilters(candidate, within), true);
// Changing exactly ONE filter to something that excludes it must exclude the whole job (AND, not OR).
assert.equal(passesAllFilters(candidate, { ...within, status: 'complete' }), false);
assert.equal(passesAllFilters(candidate, { ...within, jobType: 'oneoff' }), false);
assert.equal(passesAllFilters(candidate, { ...within, employeeIds: ['crew-2'] }), false);
assert.equal(passesAllFilters(candidate, { ...within, query: 'nomatch' }), false);
assert.equal(passesAllFilters(candidate, { ...within, dateRange: computeDateRange('last30', undefined, '2026-01-01') }), false);

// Clear filters = every control back to its default is equivalent to no filtering at all.
const clearedRange = computeDateRange('all');
const cleared = { status: 'all', jobType: 'all', dateRange: clearedRange, employeeIds: [], includeUnassigned: false, query: '', customerName: 'Jane Smith' };
assert.equal(passesAllFilters(candidate, cleared), true);
assert.equal(passesAllFilters({ ...candidate, scheduled_date: null, crew_member_ids: [], status: 'draft', recurring: 'none' }, cleared), true);

console.log('PASS: job date-range boundaries, status-tab definitions, job-type/employee filters, search matching and combined-filter AND logic.');
