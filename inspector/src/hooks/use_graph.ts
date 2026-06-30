import { useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { retrieveGraphNeighborhood, retrieveGraphNeighborhoodWithBase } from "@/api/endpoints/graph";
import { retrieveRelatedEntities } from "@/api/endpoints/relationships";
import type { GraphNeighborhoodParams, RelatedEntitiesParams } from "@/types/api";

export function useGraphNeighborhood(params: GraphNeighborhoodParams | null) {
  return useQuery({
    queryKey: ["graph-neighborhood", params],
    queryFn: ({ signal }) => retrieveGraphNeighborhood(params!, { signal }),
    enabled: isApiUrlConfigured() && !!params?.node_id,
    refetchInterval: false,
  });
}

/**
 * Phase 1 — apiBase-override variant (#1606).
 *
 * Like `useGraphNeighborhood` but uses an explicit API base origin instead of
 * reading from localStorage/proxy. Used by embed routes where the base comes
 * from `ApiBaseContext` (injected via `?apiBase=` query param).
 */
export function useGraphNeighborhoodWithBase(
  apiBase: string,
  params: GraphNeighborhoodParams | null,
) {
  return useQuery({
    queryKey: ["graph-neighborhood-embed", apiBase, params],
    queryFn: ({ signal }) =>
      retrieveGraphNeighborhoodWithBase(apiBase, params!, { signal }),
    enabled: !!apiBase.trim() && !!params?.node_id,
    refetchInterval: false,
  });
}

export function useRelatedEntities(params: RelatedEntitiesParams | null) {
  return useQuery({
    queryKey: ["related-entities", params],
    queryFn: ({ signal }) => retrieveRelatedEntities(params!, { signal }),
    enabled: isApiUrlConfigured() && !!params?.entity_id,
    refetchInterval: false,
  });
}
