/**
 * First URL segment (after {@link normalizeToDefaultRoute}) for marketing vertical
 * pages that use the full-page shell: no docs sidebar, no developer-preview badge.
 * Covers `/verticals`, `/verticals/…`, locale-prefixed `/es/verticals`, trailing slashes, etc.
 */
const MARKETING_FULL_PAGE_FIRST_SEGMENTS = new Set([
  "verticals",
  "crm",
  "compliance",
  "contracts",
  "diligence",
  "portfolio",
  "cases",
  "financial-ops",
  "procurement",
  "agent-auth",
  "healthcare",
  "government",
  "customer-ops",
  "logistics",
]);

/**
 * @param normalizedPath — output of {@link normalizeToDefaultRoute} (locale stripped, no trailing slash except `/`).
 */
export function isMarketingFullPageRoute(normalizedPath: string): boolean {
  if (normalizedPath === "/") return false;
  const first =
    normalizedPath
      .replace(/^\//, "")
      .split("/")
      .filter(Boolean)[0] ?? "";
  return MARKETING_FULL_PAGE_FIRST_SEGMENTS.has(first);
}
