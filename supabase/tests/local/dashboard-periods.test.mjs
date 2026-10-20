import assert from 'node:assert/strict';
import {
  computePeriodRange, computeComparisonRange, isDateInRange, trendPct, formatRangeLabel,
} from '../../../src/lib/dashboardPeriods.ts';

// 2026-10-19 is a Monday.
const MONDAY = '2026-10-19';
// 2026-10-22 is a Thursday (3 days after the Monday above).
const THURSDAY = '2026-10-22';

// --- computePeriodRange: calendar periods run through today ---
assert.deepEqual(computePeriodRange('today', undefined, THURSDAY), { ok: true, range: { startISO: '2026-10-22', endExclusiveISO: '2026-10-23' } });

// Week starts Monday, computed in UTC, through today (not the full week).
assert.deepEqual(computePeriodRange('thisWeek', undefined, THURSDAY), { ok: true, range: { startISO: '2026-10-19', endExclusiveISO: '2026-10-23' } });
// On the Monday itself, "this week" is just that one day so far.
assert.deepEqual(computePeriodRange('thisWeek', undefined, MONDAY), { ok: true, range: { startISO: '2026-10-19', endExclusiveISO: '2026-10-20' } });
// A Sunday belongs to the week that started the PRECEDING Monday.
assert.deepEqual(computePeriodRange('thisWeek', undefined, '2026-10-25'), { ok: true, range: { startISO: '2026-10-19', endExclusiveISO: '2026-10-26' } });

assert.deepEqual(computePeriodRange('thisMonth', undefined, '2026-10-19'), { ok: true, range: { startISO: '2026-10-01', endExclusiveISO: '2026-10-20' } });
assert.deepEqual(computePeriodRange('thisQuarter', undefined, '2026-11-05'), { ok: true, range: { startISO: '2026-10-01', endExclusiveISO: '2026-11-06' } });
assert.deepEqual(computePeriodRange('thisQuarter', undefined, '2026-02-01'), { ok: true, range: { startISO: '2026-01-01', endExclusiveISO: '2026-02-02' } });
assert.deepEqual(computePeriodRange('thisYear', undefined, '2026-10-19'), { ok: true, range: { startISO: '2026-01-01', endExclusiveISO: '2026-10-20' } });

assert.deepEqual(computePeriodRange('last30', undefined, '2026-10-19'), { ok: true, range: { startISO: '2026-09-20', endExclusiveISO: '2026-10-20' } });
assert.deepEqual(computePeriodRange('last90', undefined, '2026-10-19'), { ok: true, range: { startISO: '2026-07-22', endExclusiveISO: '2026-10-20' } });

// Custom range: inclusive both ends.
assert.deepEqual(computePeriodRange('custom', { start: '2026-10-01', end: '2026-10-19' }, '2026-10-19'), { ok: true, range: { startISO: '2026-10-01', endExclusiveISO: '2026-10-20' } });
// Reversed range is rejected, not silently swapped.
{
  const result = computePeriodRange('custom', { start: '2026-10-19', end: '2026-10-01' }, '2026-10-19');
  assert.equal(result.ok, false);
}
// Missing bounds rejected too.
assert.equal(computePeriodRange('custom', undefined, '2026-10-19').ok, false);
assert.equal(computePeriodRange('custom', { start: '', end: '2026-10-19' }, '2026-10-19').ok, false);

// --- computeComparisonRange: calendar presets shift exact dates back one year ---
{
  const monthRange = computePeriodRange('thisMonth', undefined, '2026-10-19').range;
  assert.deepEqual(computeComparisonRange('thisMonth', monthRange), { startISO: '2025-10-01', endExclusiveISO: '2025-10-20' });
}
{
  const yearRange = computePeriodRange('thisYear', undefined, '2026-10-19').range;
  assert.deepEqual(computeComparisonRange('thisYear', yearRange), { startISO: '2025-01-01', endExclusiveISO: '2025-10-20' });
}

// Leap-year Feb 29 comparison clamps to Feb 28 in the non-leap prior year.
// 2028 is a leap year; "today" = 2028-02-29.
{
  const yearRange = computePeriodRange('thisYear', undefined, '2028-02-29').range;
  const comparison = computeComparisonRange('thisYear', yearRange);
  // 2027 is not a leap year, so Feb 29 2027 doesn't exist -> clamped to Feb 28.
  assert.equal(comparison.endExclusiveISO, '2027-03-01');
}

// Month-boundary shift: a 31-day month's last day shifts correctly even when
// the prior year's same month has a different length relationship.
{
  const monthRange = computePeriodRange('thisMonth', undefined, '2026-01-31').range;
  assert.deepEqual(computeComparisonRange('thisMonth', monthRange), { startISO: '2025-01-01', endExclusiveISO: '2025-02-01' });
}

// Rolling periods: preceding equal-length period immediately before.
{
  const last30 = computePeriodRange('last30', undefined, '2026-10-19').range; // Sep20 - Oct20(excl), 30 days
  assert.deepEqual(computeComparisonRange('last30', last30), { startISO: '2026-08-21', endExclusiveISO: '2026-09-20' });
}
{
  const custom = computePeriodRange('custom', { start: '2026-10-01', end: '2026-10-10' }, '2026-10-19').range; // 10 days
  assert.deepEqual(computeComparisonRange('custom', custom), { startISO: '2026-09-21', endExclusiveISO: '2026-10-01' });
}

// --- isDateInRange ---
const range = { startISO: '2026-10-01', endExclusiveISO: '2026-10-20' };
assert.equal(isDateInRange(null, range), false);
assert.equal(isDateInRange(undefined, range), false);
assert.equal(isDateInRange('2026-10-01', range), true); // inclusive start
assert.equal(isDateInRange('2026-10-19', range), true); // last included day
assert.equal(isDateInRange('2026-10-20', range), false); // exclusive end
assert.equal(isDateInRange('2026-09-30', range), false);
assert.equal(isDateInRange('2026-10-05T14:30:00.000Z', range), true); // timestamp, date portion only

// --- trendPct ---
assert.equal(trendPct(150, 100), 50);
assert.equal(trendPct(50, 100), -50);
assert.equal(trendPct(100, 0), null); // zero denominator -> no percentage
assert.equal(trendPct(0, 0), null);

// --- formatRangeLabel ---
assert.equal(formatRangeLabel({ startISO: '2026-10-19', endExclusiveISO: '2026-10-20' }), 'Oct 19, 2026 (UTC)');
assert.equal(formatRangeLabel({ startISO: '2026-10-01', endExclusiveISO: '2026-10-20' }), 'Oct 1 – Oct 19, 2026 (UTC)');
assert.equal(formatRangeLabel({ startISO: '2025-12-15', endExclusiveISO: '2026-01-05' }), 'Dec 15, 2025 – Jan 4, 2026 (UTC)');

console.log('PASS: dashboard period/comparison UTC boundaries, leap-year and month-boundary shifts, and range labeling.');
