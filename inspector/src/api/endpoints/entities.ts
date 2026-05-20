import { get, post } from "../client";
import type {
  EntitySnapshot,
  EntitiesQueryParams,
  Observation,
  EntityRelationshipsResponse,
} from "@/types/api";

export function queryEntities(params: EntitiesQueryParams) {
  return post<{ entities: EntitySnapshot[]; total: number; limit: number; offset: number }>("/entities/query", params);
}

type EntityDetailResponse = EntitySnapshot | { entity: EntitySnapshot };

function unwrapEntityDetail(res: EntityDetailResponse): EntitySnapshot {
  if (res && typeof res === "object" && "entity" in res && res.entity && typeof res.entity === "object") {
    return res.entity;
  }
  return res as EntitySnapshot;
}

export function getEntityById(id: string) {
  return get<EntityDetailResponse>(`/entities/${encodeURIComponent(id)}`).then(unwrapEntityDetail);
}

export type EntityObservationsResponse = {
  observations: Observation[];
  total: number;
  limit: number;
  offset: number;
};

export function getEntityObservations(
  id: string,
  options?: { limit?: number; offset?: number },
) {
  const params = new URLSearchParams();
  if (options?.limit != null) params.set("limit", String(options.limit));
  if (options?.offset != null) params.set("offset", String(options.offset));
  const qs = params.toString();
  return get<EntityObservationsResponse>(
    `/entities/${encodeURIComponent(id)}/observations${qs ? `?${qs}` : ""}`,
  );
}

export function getEntityRelationships(
  id: string,
  options?: { expand_entities?: boolean }
) {
  const qs = options?.expand_entities ? "?expand_entities=true" : "";
  return get<EntityRelationshipsResponse>(
    `/entities/${encodeURIComponent(id)}/relationships${qs}`
  );
}

export function getEntitySnapshot(entityId: string) {
  return post<EntitySnapshot>("/get_entity_snapshot", { entity_id: entityId });
}

export function getFieldProvenance(entityId: string, field: string) {
  return post<Record<string, unknown>>("/get_field_provenance", { entity_id: entityId, field });
}

export function mergeEntities(fromEntityId: string, toEntityId: string, mergeReason?: string) {
  return post<{ observations_moved: number; merged_at: string }>("/entities/merge", {
    from_entity_id: fromEntityId,
    to_entity_id: toEntityId,
    merge_reason: mergeReason,
  });
}

export function deleteEntity(entityId: string, entityType: string, reason?: string) {
  return post<Record<string, unknown>>("/delete_entity", {
    entity_id: entityId,
    entity_type: entityType,
    reason,
  });
}

export function restoreEntity(entityId: string, entityType: string, reason?: string) {
  return post<Record<string, unknown>>("/restore_entity", {
    entity_id: entityId,
    entity_type: entityType,
    reason,
  });
}
