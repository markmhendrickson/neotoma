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
 * Paths that use the docs shell (collapsible rail + main column) but are not links in
 * {@link DOC_NAV_CATEGORIES} (e.g. deep-linked guides reached from other pages).
 */
export const DOCS_SHELL_PATHS_EXCLUDED_FROM_NAV: readonly string[] = [
  "/neotoma-with-claude-agent-sdk",
];

/**
 * @param normalizedPath — output of {@link normalizeToDefaultRoute} (locale stripped, no trailing slash except `/`).
 * @returns true when the path is exactly a doc-nav target or nested under one (e.g. `/install/foo` under `/install`),
 * or listed in {@link DOCS_SHELL_PATHS_EXCLUDED_FROM_NAV}.
 */
export function isPathUnderDocsSidebarNav(normalizedPath: string): boolean {
  if (normalizedPath === "/") return false;
  if (
    DOCS_SHELL_PATHS_EXCLUDED_FROM_NAV.some(
      (base) => normalizedPath === base || normalizedPath.startsWith(`${base}/`),
    )
  ) {
    return true;
  }
  return DOC_SIDEBAR_NAV_BASE_PATHS.some(
    (base) => normalizedPath === base || normalizedPath.startsWith(`${base}/`),
  );
}
