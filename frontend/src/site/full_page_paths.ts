/**
 * First URL segment (after {@link normalizeToDefaultRoute}) for marketing use case
 * pages that use the full-page shell: no docs sidebar, no developer-preview badge.
 * Covers `/use-cases`, `/use-cases/…`, locale-prefixed `/es/use-cases`, trailing slashes, etc.
 */
const MARKETING_FULL_PAGE_FIRST_SEGMENTS = new Set([
  "use-cases",
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
  "personal-data",
  "crypto-engineering",
]);

/**
 * @param normalizedPath - output of {@link normalizeToDefaultRoute} (locale stripped, no trailing slash except `/`).
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
