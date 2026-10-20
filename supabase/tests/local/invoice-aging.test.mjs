import assert from 'node:assert/strict';
import {
  classifyInvoiceAging, sortInvoices, matchesInvoiceSearch, formatInvoiceIdRef,
} from '../../../src/lib/invoiceAging.ts';

const TODAY = '2026-10-19';

// --- classifyInvoiceAging: due-date based, never "days since sent" ---
assert.equal(classifyInvoiceAging({ due_at: null }, TODAY), 'noDueDate');
assert.equal(classifyInvoiceAging({}, TODAY), 'noDueDate');
assert.equal(classifyInvoiceAging({ due_at: '2026-10-19' }, TODAY), 'notYetDue'); // due today = not yet due
assert.equal(classifyInvoiceAging({ due_at: '2026-11-01' }, TODAY), 'notYetDue');
assert.equal(classifyInvoiceAging({ due_at: '2026-10-18' }, TODAY), 'under30'); // 1 day overdue
assert.equal(classifyInvoiceAging({ due_at: '2026-09-20' }, TODAY), 'under30'); // 29 days overdue
assert.equal(classifyInvoiceAging({ due_at: '2026-09-19' }, TODAY), 'between30and60'); // 30 days overdue
assert.equal(classifyInvoiceAging({ due_at: '2026-08-21' }, TODAY), 'between30and60'); // 59 days overdue
assert.equal(classifyInvoiceAging({ due_at: '2026-08-20' }, TODAY), 'over60'); // 60 days overdue
assert.equal(classifyInvoiceAging({ due_at: '2026-01-01T00:00:00.000Z' }, TODAY), 'over60'); // timestamp input

// --- sortInvoices: deterministic ties, no-due-date sorts last either direction ---
const invoices = [
  { id: 'b', dueDate: '2026-10-10', balance: 100 },
  { id: 'a', dueDate: '2026-10-10', balance: 100 }, // same date+balance as 'b' -> tie broken by id
  { id: 'c', dueDate: null, balance: 500 },
  { id: 'd', dueDate: '2026-10-01', balance: 50 },
];

{
  const oldest = sortInvoices(invoices, 'oldest');
  assert.deepEqual(oldest.map((i) => i.id), ['d', 'a', 'b', 'c']); // earliest date first, tie a<b, no-date last
}
{
  const newest = sortInvoices(invoices, 'newest');
  assert.deepEqual(newest.map((i) => i.id), ['a', 'b', 'd', 'c']); // latest date first, tie a<b, no-date still last
}
{
  const largest = sortInvoices(invoices, 'largestBalance');
  assert.deepEqual(largest.map((i) => i.id), ['c', 'a', 'b', 'd']); // 500, then 100/100 tie a<b, then 50
}
// Sorting is non-mutating.
assert.deepEqual(invoices.map((i) => i.id), ['b', 'a', 'c', 'd']);
// Repeated sorts are stable (idempotent ordering).
assert.deepEqual(sortInvoices(sortInvoices(invoices, 'oldest'), 'oldest').map((i) => i.id), ['d', 'a', 'b', 'c']);

// --- matchesInvoiceSearch ---
const inv = { idRef: 'A1B2C3D4', customerName: 'Jane Smith' };
assert.equal(matchesInvoiceSearch(inv, ''), true);
assert.equal(matchesInvoiceSearch(inv, 'a1b2c3d4'), true); // case-insensitive id ref
assert.equal(matchesInvoiceSearch(inv, 'jane'), true); // customer name, partial
assert.equal(matchesInvoiceSearch(inv, 'smith'), true);
assert.equal(matchesInvoiceSearch(inv, 'nomatch'), false);

// --- formatInvoiceIdRef ---
assert.equal(formatInvoiceIdRef('a1b2c3d4-0000-4000-8000-000000000000'), 'A1B2C3D4');

console.log('PASS: due-date invoice aging classification, deterministic sort tie-breaks, and invoice search matching.');
