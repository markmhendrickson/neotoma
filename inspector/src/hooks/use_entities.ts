import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import { queryEntities, getEntityById, getEntityObservations, getEntityRelationships, getFieldProvenance } from "@/api/endpoints/entities";
import type { EntitiesQueryParams } from "@/types/api";

export function useEntitiesQuery(params: EntitiesQueryParams) {
  return useQuery({
    queryKey: ["entities", params],
    queryFn: () => queryEntities(params),
    placeholderData: keepPreviousData,
    enabled: isApiUrlConfigured(),
  });
}

export function useEntityById(id: string | undefined) {
  return useQuery({
    queryKey: ["entity", id],
    queryFn: () => getEntityById(id!),
    enabled: isApiUrlConfigured() && !!id,
  });
}

export function useEntityObservations(
  id: string | undefined,
  options?: { limit?: number; offset?: number },
) {
  return useQuery({
    queryKey: ["entity-observations", id, options?.limit ?? null, options?.offset ?? null],
    queryFn: () => getEntityObservations(id!, options),
    enabled: isApiUrlConfigured() && !!id,
  });
}

export function useEntityRelationships(
  id: string | undefined,
  options?: { expand_entities?: boolean }
) {
  const expand = options?.expand_entities ?? false;
  return useQuery({
    queryKey: ["entity-relationships", id, expand],
    queryFn: () => getEntityRelationships(id!, { expand_entities: expand }),
    enabled: isApiUrlConfigured() && !!id,
  });
}

export function useFieldProvenance(entityId: string | undefined, field: string | undefined) {
  return useQuery({
    queryKey: ["field-provenance", entityId, field],
    queryFn: () => getFieldProvenance(entityId!, field!),
    enabled: isApiUrlConfigured() && !!entityId && !!field,
  });
}
