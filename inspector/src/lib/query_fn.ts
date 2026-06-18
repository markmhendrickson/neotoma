import type { QueryFunctionContext } from "@tanstack/react-query";
import type { FetchOptions } from "@/api/client";

export type QueryFnContext = Pick<QueryFunctionContext, "signal">;

/**
 * Wraps an API fetcher so React Query passes an AbortSignal. When the user
 * navigates away, observers drop and in-flight HTTP for that query is aborted.
 */
export function queryFnWithSignal<T>(
  fetcher: (fetch: FetchOptions) => Promise<T>,
): (context: QueryFnContext) => Promise<T> {
  return ({ signal }) => fetcher({ signal });
}
