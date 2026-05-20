import type { UseQueryResult } from "@tanstack/react-query";

/** Full list/page skeleton: first fetch only, not background refetch (global refetchInterval). */
export function showInitialQuerySkeleton(
  q: Pick<UseQueryResult<unknown>, "data" | "fetchStatus">,
): boolean {
  return q.fetchStatus === "fetching" && q.data === undefined;
}

/** Inline refresh hint while revalidating with cached data visible. */
export function showBackgroundQueryRefresh(
  q: Pick<UseQueryResult<unknown>, "data" | "fetchStatus">,
): boolean {
  return q.fetchStatus === "fetching" && q.data !== undefined;
}
