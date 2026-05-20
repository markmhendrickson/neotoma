import { useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { retrieveGraphNeighborhood } from "@/api/endpoints/graph";
import { retrieveRelatedEntities } from "@/api/endpoints/relationships";
import type { GraphNeighborhoodParams, RelatedEntitiesParams } from "@/types/api";

export function useGraphNeighborhood(params: GraphNeighborhoodParams | null) {
  return useQuery({
    queryKey: ["graph-neighborhood", params],
    queryFn: () => retrieveGraphNeighborhood(params!),
    enabled: isApiUrlConfigured() && !!params?.node_id,
  });
}

export function useRelatedEntities(params: RelatedEntitiesParams | null) {
  return useQuery({
    queryKey: ["related-entities", params],
    queryFn: () => retrieveRelatedEntities(params!),
    enabled: isApiUrlConfigured() && !!params?.entity_id,
  });
}
