import { post, type FetchOptions } from "../client";
import type { GraphNeighborhoodParams } from "@/types/api";

export function retrieveGraphNeighborhood(params: GraphNeighborhoodParams, fetch?: FetchOptions) {
  return post<Record<string, unknown>>("/retrieve_graph_neighborhood", params, fetch);
}
