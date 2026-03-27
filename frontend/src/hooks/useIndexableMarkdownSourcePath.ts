import { useLocation } from "react-router-dom";
import { appPathFromBrowserPathname } from "@/site/spa_path";
import { isIndexableSitePagePath } from "@/site/site_page_markdown";

/**
 * Default-locale path for the current browser URL when it maps to an indexable sitemap page.
 * Handles SPA basename (e.g. /neotoma) and product-at-root URLs (e.g. /neotoma-with-claude-code).
 */
export function useIndexableMarkdownSourcePath(): string | null {
  const { pathname } = useLocation();
  if (typeof window === "undefined") return null;
  void pathname;
  const logical = appPathFromBrowserPathname(window.location.pathname);
  return isIndexableSitePagePath(logical) ? logical : null;
}
