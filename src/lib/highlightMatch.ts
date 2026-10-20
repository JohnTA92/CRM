import { createElement, Fragment, type ReactNode } from "react";

/**
 * Wraps the first case-insensitive literal match of `query` inside `text` in a
 * highlighted span. Used only where the displayed text and the search query share
 * the same literal characters (e.g. a customer's name) — phone/email search is
 * digit/case-normalized and doesn't map back to a reliable substring position in
 * the formatted display text, so callers should not use this for those fields.
 *
 * Plain `.ts` (no JSX) so this stays importable by the house unit-test convention,
 * which runs test files directly via `node --experimental-strip-types` — a feature
 * that strips TypeScript types but does not transpile JSX syntax.
 */
export function highlightMatch(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const index = text.toLowerCase().indexOf(q.toLowerCase());
  if (index === -1) return text;
  const before = text.slice(0, index);
  const match = text.slice(index, index + q.length);
  const after = text.slice(index + q.length);
  return createElement(
    Fragment,
    null,
    before,
    createElement("span", { className: "bg-[#fef3c7] text-ink rounded-sm" }, match),
    after,
  );
}
