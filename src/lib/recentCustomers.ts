const KEY = "crm-recent-customers";
const MAX_ENTRIES = 20;

/**
 * Client-side "recently viewed customers" list, scoped to this browser only (no
 * schema, no server round trip). Most-recent-first; a repeat visit moves the id back
 * to the front instead of duplicating it. Mirrors the localStorage convention already
 * used for theme (src/lib/theme.tsx) rather than introducing a new persistence layer.
 */
export function getRecentCustomerIds(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function addRecentCustomerId(id: string): void {
  try {
    const current = getRecentCustomerIds().filter((existing) => existing !== id);
    current.unshift(id);
    localStorage.setItem(KEY, JSON.stringify(current.slice(0, MAX_ENTRIES)));
  } catch {
    // Private browsing / storage disabled: Recent simply stays empty, never breaks the page.
  }
}

export function clearRecentCustomerIds(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // no-op
  }
}
