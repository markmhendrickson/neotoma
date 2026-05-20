import type { UseQueryResult } from "@tanstack/react-query";

type QueryLoadingSlice = Pick<
  UseQueryResult<unknown>,
  "data" | "fetchStatus" | "isPending" | "isPlaceholderData"
>;

/**
 * Full-page / list skeleton: first fetch for this query key, including while
 * `keepPreviousData` still shows the prior route's rows.
 */
export function showInitialQuerySkeleton(q: QueryLoadingSlice): boolean {
  if (q.isPlaceholderData) return true;
  if (q.isPending && q.data === undefined) return true;
  return q.fetchStatus === "fetching" && q.data === undefined;
}

/**
 * Detail routes keyed by a URL segment: skeleton until the loaded record matches
 * the active route (guards stale rows when query keys or cache overlap).
 */
export function showRouteDetailSkeleton<T>(
  q: Pick<UseQueryResult<T>, "data" | "fetchStatus" | "isPending" | "isPlaceholderData">,
  matchesRoute: (data: T) => boolean,
): boolean {
  if (showInitialQuerySkeleton(q)) return true;
  if (q.data !== undefined && q.fetchStatus === "fetching" && !matchesRoute(q.data)) {
    return true;
  }
  return false;
}

/** Safe to render "not found" only after the query finished without data. */
export function querySettledWithoutData(
  q: Pick<UseQueryResult<unknown>, "data" | "isPending" | "fetchStatus">,
): boolean {
  return q.data === undefined && !q.isPending && q.fetchStatus !== "fetching";
}

/** Inline refresh hint while revalidating with cached data visible. */
export function showBackgroundQueryRefresh(
  q: Pick<UseQueryResult<unknown>, "data" | "fetchStatus">,
): boolean {
  return q.fetchStatus === "fetching" && q.data !== undefined;
}
