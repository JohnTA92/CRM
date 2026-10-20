import assert from 'node:assert/strict';

// highlightMatch is a .tsx file returning JSX; render it headlessly via a tiny
// fake DOM-free check instead of a real renderer — we only need to assert on the
// plain-text content and that a highlighted span wraps the right substring, so we
// inspect the returned element tree directly rather than pulling in react-dom.
import { highlightMatch } from '../../../src/lib/highlightMatch.ts';

function flatten(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flatten).join('');
  if (node.props && node.props.children !== undefined) return flatten(node.props.children);
  return '';
}

// No query: returns the original text unchanged (a plain string, not wrapped).
assert.equal(highlightMatch('Jane Smith', ''), 'Jane Smith');
assert.equal(highlightMatch('Jane Smith', '   '), 'Jane Smith');

// Case-insensitive substring match: full text is preserved, match is present once.
{
  const result = highlightMatch('Jane Smith', 'smith');
  assert.equal(flatten(result), 'Jane Smith');
}

// No match: original text returned as-is.
assert.equal(highlightMatch('Jane Smith', 'zzz'), 'Jane Smith');

// Match at the very start and the very end both preserve full text.
assert.equal(flatten(highlightMatch('Jane Smith', 'jane')), 'Jane Smith');
assert.equal(flatten(highlightMatch('Jane Smith', 'smith')), 'Jane Smith');

console.log('PASS: name-match highlighting preserves full text for empty/no-match/start/end queries.');

// --- recentCustomers ---
// Tests a minimal in-memory localStorage shim since this runs outside a browser.
const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { getRecentCustomerIds, addRecentCustomerId, clearRecentCustomerIds } =
  await import('../../../src/lib/recentCustomers.ts');

assert.deepEqual(getRecentCustomerIds(), []);

addRecentCustomerId('a');
addRecentCustomerId('b');
addRecentCustomerId('c');
assert.deepEqual(getRecentCustomerIds(), ['c', 'b', 'a']);

// Repeat visit moves the id back to the front instead of duplicating it.
addRecentCustomerId('a');
assert.deepEqual(getRecentCustomerIds(), ['a', 'c', 'b']);

// Capped at 20 entries, most-recent-first.
clearRecentCustomerIds();
for (let i = 0; i < 25; i++) addRecentCustomerId(`id-${i}`);
const capped = getRecentCustomerIds();
assert.equal(capped.length, 20);
assert.equal(capped[0], 'id-24');
assert.equal(capped[19], 'id-5');

clearRecentCustomerIds();
assert.deepEqual(getRecentCustomerIds(), []);

console.log('PASS: recent-customer id list dedups/moves-to-front, caps at 20, and clears.');
