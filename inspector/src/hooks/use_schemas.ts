import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { listSchemas, getSchemaByEntityType, analyzeSchemaCandidates, getSchemaRecommendations } from "@/api/endpoints/schemas";

export function useSchemas() {
  return useQuery({
    queryKey: ["schemas"],
    queryFn: () => listSchemas(),
    placeholderData: keepPreviousData,
    enabled: isApiUrlConfigured(),
  });
}

export function useSchemaByType(entityType: string | undefined) {
  return useQuery({
    queryKey: ["schema", entityType],
    queryFn: () => getSchemaByEntityType(entityType!),
    enabled: isApiUrlConfigured() && !!entityType,
  });
}

export function useSchemaCandidates(entityType?: string) {
  return useQuery({
    queryKey: ["schema-candidates", entityType],
    queryFn: () => analyzeSchemaCandidates(entityType ? { entity_type: entityType } : undefined),
    placeholderData: keepPreviousData,
    enabled: false,
  });
}

export function useSchemaRecommendations(entityType: string | undefined) {
  return useQuery({
    queryKey: ["schema-recommendations", entityType],
    queryFn: () => getSchemaRecommendations(entityType!),
    placeholderData: keepPreviousData,
    enabled: isApiUrlConfigured() && !!entityType,
  });
}
