/** Inspector search URL helpers: `/search/:query` with `kind` / `type` in query string. */

export const SEARCH_BASE_PATH = "/search";

export function parseSearchQueryFromPathname(pathname: string): string {
  if (!pathname.startsWith(SEARCH_BASE_PATH)) {
    return "";
  }
  const rest = pathname.slice(SEARCH_BASE_PATH.length);
  if (!rest || rest === "/") {
    return "";
  }
  const segment = rest.replace(/^\//, "").split("/")[0] ?? "";
  if (!segment) {
    return "";
  }
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function resolveSearchQuery(pathname: string, searchParams: URLSearchParams): string {
  const fromPath = parseSearchQueryFromPathname(pathname);
  if (fromPath) {
    return fromPath;
  }
  return searchParams.get("search") ?? "";
}

export function buildSearchPathname(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) {
    return SEARCH_BASE_PATH;
  }
  return `${SEARCH_BASE_PATH}/${encodeURIComponent(trimmed)}`;
}

export type SearchLocationOptions = {
  query: string;
  kind?: string | null;
  entityType?: string | null;
  /** Existing params to preserve (e.g. pagination) except `search`, which is path-only. */
  searchParams?: URLSearchParams;
};

export function buildSearchLocation({
  query,
  kind,
  entityType,
  searchParams,
}: SearchLocationOptions): { pathname: string; search: string } {
  const params = new URLSearchParams(searchParams);
  params.delete("search");

  if (kind) {
    params.set("kind", kind);
  } else {
    params.delete("kind");
  }

  if (entityType) {
    params.set("type", entityType);
  } else {
    params.delete("type");
  }

  const search = params.toString();
  return {
    pathname: buildSearchPathname(query),
    search: search ? `?${search}` : "",
  };
}

export function locationsMatchForSearch(
  current: { pathname: string; search: string },
  next: { pathname: string; search: string },
): boolean {
  return current.pathname === next.pathname && current.search === next.search;
}

export function isSearchPath(pathname: string): boolean {
  return pathname === SEARCH_BASE_PATH || pathname.startsWith(`${SEARCH_BASE_PATH}/`);
}
