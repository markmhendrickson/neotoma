import { useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { retrieveGraphNeighborhood } from "@/api/endpoints/graph";
import { retrieveRelatedEntities } from "@/api/endpoints/relationships";
import type { GraphNeighborhoodParams, RelatedEntitiesParams } from "@/types/api";

export function useGraphNeighborhood(params: GraphNeighborhoodParams | null) {
  return useQuery({
    queryKey: ["graph-neighborhood", params],
    queryFn: ({ signal }) => retrieveGraphNeighborhood(params!, { signal }),
    enabled: isApiUrlConfigured() && !!params?.node_id,
  });
}

export function useRelatedEntities(params: RelatedEntitiesParams | null) {
  return useQuery({
    queryKey: ["related-entities", params],
    queryFn: ({ signal }) => retrieveRelatedEntities(params!, { signal }),
    enabled: isApiUrlConfigured() && !!params?.entity_id,
  });
}
