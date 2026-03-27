import { DOC_NAV_CATEGORIES } from "@/site/site_data";

function internalPathFromDocNavHref(href: string): string | null {
  if (!href.startsWith("/")) return null;
  const [pathPart] = href.split("#");
  const [path] = pathPart.split("?");
  return path || "/";
}

/**
 * Locale-stripped path prefixes for every in-app href in {@link DOC_NAV_CATEGORIES}
 * (excludes external links).
 */
export const DOC_SIDEBAR_NAV_BASE_PATHS: readonly string[] = (() => {
  const set = new Set<string>();
  for (const cat of DOC_NAV_CATEGORIES) {
    for (const item of cat.items) {
      const p = internalPathFromDocNavHref(item.href);
      if (p) set.add(p);
    }
  }
  return [...set];
})();

/**
 * @param normalizedPath — output of {@link normalizeToDefaultRoute} (locale stripped, no trailing slash except `/`).
 * @returns true when the path is exactly a doc-nav target or nested under one (e.g. `/install/foo` under `/install`).
 */
export function isPathUnderDocsSidebarNav(normalizedPath: string): boolean {
  if (normalizedPath === "/") return false;
  return DOC_SIDEBAR_NAV_BASE_PATHS.some(
    (base) => normalizedPath === base || normalizedPath.startsWith(`${base}/`),
  );
}
