// Customer search normalization and non-destructive duplicate identification.
// Pure and dependency-free so it can be unit-tested directly (see
// supabase/tests/local/customers.test.mjs). Nothing here writes, merges or deletes —
// duplicates are only ever *identified* and explained for a human to act on.

export type MatchableCustomer = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  tags?: string[] | null;
};

/** Digits only, with a leading US country code dropped so +1 (555) 123-4567 === 5551234567. */
export function normalizePhone(value?: string | null): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function normalizeEmail(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

/** Trim, collapse runs of whitespace, lowercase — so "  Jane   SMITH " === "jane smith". */
export function normalizeName(value?: string | null): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Single comparable string for the street/city/state/zip block. */
export function normalizeAddress(customer: MatchableCustomer): string {
  return [customer.address, customer.city, customer.state, customer.zip]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// A query needs at least this many digits before we treat it as a phone search, so a
// house number in an address query doesn't drag in unrelated phone matches.
const MIN_PHONE_QUERY_DIGITS = 3;

/**
 * Forgiving, normalization-aware match used by the customer list search box.
 * Name tokens may arrive in any order ("smith jane" finds "Jane Smith"); phone matches
 * ignore formatting entirely.
 */
export function matchesCustomerQuery(customer: MatchableCustomer, query: string): boolean {
  const raw = query.trim();
  if (!raw) return true;
  const needle = normalizeName(raw);

  const name = normalizeName(customer.name);
  if (name && needle.split(" ").every((token) => name.includes(token))) return true;

  if (normalizeEmail(customer.email).includes(needle)) return true;
  if (normalizeAddress(customer).includes(needle)) return true;
  if ((customer.tags ?? []).some((tag) => normalizeName(tag).includes(needle))) return true;

  const queryDigits = raw.replace(/\D/g, "");
  if (queryDigits.length >= MIN_PHONE_QUERY_DIGITS) {
    const phone = normalizePhone(customer.phone);
    if (phone && phone.includes(normalizePhone(queryDigits))) return true;
  }
  return false;
}

export type DuplicateReason = "phone" | "email" | "name-address" | "name";

export type DuplicateGroup = {
  /** Stable id for React keys: reason + the shared value that grouped these records. */
  key: string;
  reason: DuplicateReason;
  /** Human-readable explanation of exactly why these were flagged. */
  label: string;
  customers: MatchableCustomer[];
};

// Ordered strongest signal first. Each rule returns "" for a record it cannot judge,
// and those records are skipped rather than grouped together on emptiness.
const RULES: { reason: DuplicateReason; label: string; key: (c: MatchableCustomer) => string }[] = [
  { reason: "phone", label: "Same phone number", key: (c) => normalizePhone(c.phone) },
  { reason: "email", label: "Same email address", key: (c) => normalizeEmail(c.email) },
  {
    reason: "name-address",
    label: "Same name and address",
    key: (c) => {
      const name = normalizeName(c.name);
      const address = normalizeAddress(c);
      return name && address ? `${name}|${address}` : "";
    },
  },
  { reason: "name", label: "Same name", key: (c) => normalizeName(c.name) },
];

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Groups customers that look like the same person, each with the reason they matched.
 * Conservative by design: exact-after-normalization only, no fuzzy/edit-distance
 * matching, so every flagged group has a reason a human can verify at a glance.
 *
 * A weaker rule is suppressed when it would only restate a grouping an earlier, stronger
 * rule already reported (e.g. two records sharing a phone are not re-reported as
 * "Same name"), but it still surfaces when it genuinely pairs new records.
 */
export function findDuplicateGroups(customers: MatchableCustomer[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const reportedPairs = new Set<string>();

  for (const rule of RULES) {
    const byKey = new Map<string, MatchableCustomer[]>();
    for (const customer of customers) {
      const key = rule.key(customer);
      if (!key) continue;
      const bucket = byKey.get(key);
      if (bucket) bucket.push(customer);
      else byKey.set(key, [customer]);
    }

    for (const [key, members] of byKey) {
      if (members.length < 2) continue;

      const pairs: string[] = [];
      for (let i = 0; i < members.length; i++)
        for (let k = i + 1; k < members.length; k++) pairs.push(pairKey(members[i].id, members[k].id));
      if (pairs.every((pair) => reportedPairs.has(pair))) continue;

      for (const pair of pairs) reportedPairs.add(pair);
      groups.push({
        key: `${rule.reason}:${key}`,
        reason: rule.reason,
        label: rule.label,
        customers: [...members].sort((a, b) => normalizeName(a.name).localeCompare(normalizeName(b.name))),
      });
    }
  }
  return groups;
}
