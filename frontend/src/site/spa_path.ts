import { normalizeToDefaultRoute, stripLocaleFromPath } from "@/i18n/routing";

/**
 * Product doc roots that render at router "/" when the URL is only the basename (e.g. /neotoma-with-claude-code).
 */
export const PRODUCT_MARKETING_BASENAMES = new Set([
  "/neotoma-with-cursor",
  "/neotoma-with-claude",
  "/neotoma-with-claude-code",
  "/neotoma-with-chatgpt",
  "/neotoma-with-codex",
  "/neotoma-with-openclaw",
]);

const PRODUCT_MARKETING_FIRST_SEGMENTS = new Set(
  [...PRODUCT_MARKETING_BASENAMES].map((path) => path.slice(1).toLowerCase()),
);

/**
 * Path prefix where the SPA is mounted. Matches {@link getRouterBasename} in `src/main.tsx`.
 * Only known deploy / product-at-root segments count—not every path under /neotoma-* (e.g.
 * /neotoma-with-claude-agent-sdk is a normal in-app route and must not become the router basename).
 */
export function getSpaBasename(): string {
  if (typeof window === "undefined") return "";
  const p = window.location.pathname;
  if (!p || p === "/") return "";
  const firstSegment = p.replace(/^\//, "").split("/")[0] ?? "";
  if (!firstSegment) return "";
  const lower = firstSegment.toLowerCase();
  if (lower === "neotoma") return "/neotoma";
  if (PRODUCT_MARKETING_FIRST_SEGMENTS.has(lower)) return `/${firstSegment}`;
  return "";
}

/**
 * Default-locale route path for SEO/markdown (strips SPA basename, locale prefix, trailing slashes).
 */
export function appPathFromBrowserPathname(browserPathname: string): string {
  const basename = getSpaBasename();
  let path = browserPathname;
  if (basename && (path === basename || path.startsWith(`${basename}/`))) {
    path = path === basename ? "/" : path.slice(basename.length);
    if (!path.startsWith("/")) path = `/${path}`;
  }
  let normalized = normalizeToDefaultRoute(stripLocaleFromPath(path));
  if (normalized === "/" && PRODUCT_MARKETING_BASENAMES.has(basename)) {
    normalized = basename;
  }
  return normalized;
}
