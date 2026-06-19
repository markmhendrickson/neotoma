import { post, postWithBase, type FetchOptions } from "../client";
import type { GraphNeighborhoodParams } from "@/types/api";

export function retrieveGraphNeighborhood(params: GraphNeighborhoodParams, fetch?: FetchOptions) {
  return post<Record<string, unknown>>("/retrieve_graph_neighborhood", params, fetch);
}

/**
 * Phase 1 — apiBase-override variant (#1606).
 *
 * Same as `retrieveGraphNeighborhood` but routes the request through an
 * explicitly provided API origin instead of reading from localStorage/proxy.
 * Used by embed routes where the base is injected via `ApiBaseContext`.
 */
export function retrieveGraphNeighborhoodWithBase(
  apiBase: string,
  params: GraphNeighborhoodParams,
  fetch?: FetchOptions,
) {
  return postWithBase<Record<string, unknown>>(
    apiBase,
    "/retrieve_graph_neighborhood",
    params,
    fetch,
  );
}
