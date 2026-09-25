// Builds the customer-facing portal URL. Prefers an explicitly configured public
// origin (VITE_PUBLIC_APP_URL) so a deployed environment can hand out a real,
// shareable domain instead of whatever localhost port the dev server happens to be
// on. Falls back to the current browser origin — no domain is invented.
export function getPortalUrl(customerId: string): string {
  const configured = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim();
  const origin = configured ? configured.replace(/\/+$/, "") : window.location.origin;
  return `${origin}/portal/${customerId}`;
}
