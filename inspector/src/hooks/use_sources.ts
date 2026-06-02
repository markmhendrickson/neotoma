import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { listSources, getSourceById, getSourceRelationships } from "@/api/endpoints/sources";

export function useSources(params?: { search?: string; mime_type?: string; source_type?: string; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["sources", params],
    queryFn: ({ signal }) => listSources(params, { signal }),
    placeholderData: keepPreviousData,
    enabled: isApiUrlConfigured(),
  });
}

export function useSourceById(id: string | undefined) {
  return useQuery({
    queryKey: ["source", id],
    queryFn: ({ signal }) => getSourceById(id!, { signal }),
    enabled: isApiUrlConfigured() && !!id,
  });
}

export function useSourceRelationships(id: string | undefined) {
  return useQuery({
    queryKey: ["source-relationships", id],
    queryFn: ({ signal }) => getSourceRelationships(id!, { expand_entities: true, signal }),
    enabled: isApiUrlConfigured() && !!id,
  });
}
