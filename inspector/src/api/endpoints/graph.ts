import { post } from "../client";
import type { GraphNeighborhoodParams } from "@/types/api";

export function retrieveGraphNeighborhood(params: GraphNeighborhoodParams) {
  return post<Record<string, unknown>>("/retrieve_graph_neighborhood", params);
}
