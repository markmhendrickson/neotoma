import { get, post, type FetchOptions } from "../client";
import type {
  RelationshipSnapshot,
  RelationshipSnapshotResponse,
  RelatedEntitiesParams,
} from "@/types/api";

export function listRelationships(fetch?: FetchOptions) {
  return get<{ relationships: RelationshipSnapshot[] }>("/relationships", undefined, fetch);
}

export function getRelationshipById(id: string, fetch?: FetchOptions) {
  return get<RelationshipSnapshot>(`/relationships/${encodeURIComponent(id)}`, undefined, fetch);
}

export function getRelationshipSnapshot(
  relationshipType: string,
  sourceEntityId: string,
  targetEntityId: string,
  fetch?: FetchOptions,
) {
  return post<RelationshipSnapshotResponse>(
    "/relationships/snapshot",
    {
      relationship_type: relationshipType,
      source_entity_id: sourceEntityId,
      target_entity_id: targetEntityId,
    },
    fetch,
  );
}

export function listRelationshipsForEntity(data: Record<string, unknown>, fetch?: FetchOptions) {
  return post<{ relationships: RelationshipSnapshot[] }>("/list_relationships", data, fetch);
}

export function createRelationship(data: Record<string, unknown>, fetch?: FetchOptions) {
  return post<RelationshipSnapshot>("/create_relationship", data, fetch);
}

export function deleteRelationship(
  relationshipType: string,
  sourceEntityId: string,
  targetEntityId: string,
  reason?: string,
  fetch?: FetchOptions,
) {
  return post<Record<string, unknown>>(
    "/delete_relationship",
    {
      relationship_type: relationshipType,
      source_entity_id: sourceEntityId,
      target_entity_id: targetEntityId,
      reason,
    },
    fetch,
  );
}

export function restoreRelationship(
  relationshipType: string,
  sourceEntityId: string,
  targetEntityId: string,
  reason?: string,
  fetch?: FetchOptions,
) {
  return post<Record<string, unknown>>(
    "/restore_relationship",
    {
      relationship_type: relationshipType,
      source_entity_id: sourceEntityId,
      target_entity_id: targetEntityId,
      reason,
    },
    fetch,
  );
}

export function retrieveRelatedEntities(params: RelatedEntitiesParams, fetch?: FetchOptions) {
  return post<Record<string, unknown>>("/retrieve_related_entities", params, fetch);
}
