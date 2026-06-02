import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isApiUrlConfigured } from "@/api/client";
import {
  queryEntities,
  getEntityById,
  getEntityObservations,
  getEntityRelationships,
  getFieldProvenance,
} from "@/api/endpoints/entities";
import type { EntitiesQueryParams } from "@/types/api";

export function useEntitiesQuery(params: EntitiesQueryParams) {
  return useQuery({
    queryKey: ["entities", params],
    queryFn: ({ signal }) => queryEntities(params, { signal }),
    placeholderData: keepPreviousData,
    enabled: isApiUrlConfigured(),
  });
}

export function useEntityById(id: string | undefined) {
  return useQuery({
    queryKey: ["entity", id],
    queryFn: ({ signal }) => getEntityById(id!, { signal }),
    enabled: isApiUrlConfigured() && !!id,
  });
}

export function useEntityObservations(
  id: string | undefined,
  options?: { limit?: number; offset?: number },
) {
  return useQuery({
    queryKey: ["entity-observations", id, options?.limit ?? null, options?.offset ?? null],
    queryFn: ({ signal }) => getEntityObservations(id!, { ...options, signal }),
    enabled: isApiUrlConfigured() && !!id,
  });
}

export function useEntityRelationships(
  id: string | undefined,
  options?: { expand_entities?: boolean },
) {
  const expand = options?.expand_entities ?? false;
  return useQuery({
    queryKey: ["entity-relationships", id, expand],
    queryFn: ({ signal }) => getEntityRelationships(id!, { expand_entities: expand, signal }),
    enabled: isApiUrlConfigured() && !!id,
  });
}

export function useFieldProvenance(entityId: string | undefined, field: string | undefined) {
  return useQuery({
    queryKey: ["field-provenance", entityId, field],
    queryFn: ({ signal }) => getFieldProvenance(entityId!, field!, { signal }),
    enabled: isApiUrlConfigured() && !!entityId && !!field,
  });
}
