import { get, post, type FetchOptions } from "../client";
import type {
  EntitySnapshot,
  EntitiesQueryParams,
  Observation,
  EntityRelationshipsResponse,
} from "@/types/api";

export function queryEntities(params: EntitiesQueryParams, fetch?: FetchOptions) {
  return post<{ entities: EntitySnapshot[]; total: number; limit: number; offset: number }>(
    "/entities/query",
    params,
    fetch,
  );
}

type EntityDetailResponse = EntitySnapshot | { entity: EntitySnapshot };

function unwrapEntityDetail(res: EntityDetailResponse): EntitySnapshot {
  if (res && typeof res === "object" && "entity" in res && res.entity && typeof res.entity === "object") {
    return res.entity;
  }
  return res as EntitySnapshot;
}

export function getEntityById(id: string, fetch?: FetchOptions) {
  return get<EntityDetailResponse>(`/entities/${encodeURIComponent(id)}`, undefined, fetch).then(
    unwrapEntityDetail,
  );
}

export type EntityObservationsResponse = {
  observations: Observation[];
  total: number;
  limit: number;
  offset: number;
};

export type EntityObservationsOptions = {
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
};

export function getEntityObservations(id: string, options?: EntityObservationsOptions) {
  const params = new URLSearchParams();
  if (options?.limit != null) params.set("limit", String(options.limit));
  if (options?.offset != null) params.set("offset", String(options.offset));
  const qs = params.toString();
  return get<EntityObservationsResponse>(
    `/entities/${encodeURIComponent(id)}/observations${qs ? `?${qs}` : ""}`,
    undefined,
    { signal: options?.signal },
  );
}

export type EntityRelationshipsOptions = {
  expand_entities?: boolean;
  signal?: AbortSignal;
};

export function getEntityRelationships(id: string, options?: EntityRelationshipsOptions) {
  const qs = options?.expand_entities ? "?expand_entities=true" : "";
  return get<EntityRelationshipsResponse>(
    `/entities/${encodeURIComponent(id)}/relationships${qs}`,
    undefined,
    { signal: options?.signal },
  );
}

export function getEntitySnapshot(entityId: string, fetch?: FetchOptions) {
  return post<EntitySnapshot>("/get_entity_snapshot", { entity_id: entityId }, fetch);
}

export function getFieldProvenance(entityId: string, field: string, fetch?: FetchOptions) {
  return post<Record<string, unknown>>(
    "/get_field_provenance",
    { entity_id: entityId, field },
    fetch,
  );
}

export function mergeEntities(
  fromEntityId: string,
  toEntityId: string,
  mergeReason?: string,
  fetch?: FetchOptions,
) {
  return post<{ observations_moved: number; merged_at: string }>(
    "/entities/merge",
    {
      from_entity_id: fromEntityId,
      to_entity_id: toEntityId,
      merge_reason: mergeReason,
    },
    fetch,
  );
}

export function deleteEntity(
  entityId: string,
  entityType: string,
  reason?: string,
  fetch?: FetchOptions,
) {
  return post<Record<string, unknown>>(
    "/delete_entity",
    {
      entity_id: entityId,
      entity_type: entityType,
      reason,
    },
    fetch,
  );
}

export function restoreEntity(
  entityId: string,
  entityType: string,
  reason?: string,
  fetch?: FetchOptions,
) {
  return post<Record<string, unknown>>(
    "/restore_entity",
    {
      entity_id: entityId,
      entity_type: entityType,
      reason,
    },
    fetch,
  );
}
