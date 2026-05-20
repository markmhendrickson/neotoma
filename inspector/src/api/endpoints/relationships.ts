import { get, post } from "../client";
import type {
  RelationshipSnapshot,
  RelationshipSnapshotResponse,
  RelatedEntitiesParams,
} from "@/types/api";

export function listRelationships() {
  return get<{ relationships: RelationshipSnapshot[] }>("/relationships");
}

export function getRelationshipById(id: string) {
  return get<RelationshipSnapshot>(`/relationships/${encodeURIComponent(id)}`);
}

export function getRelationshipSnapshot(
  relationshipType: string,
  sourceEntityId: string,
  targetEntityId: string
) {
  return post<RelationshipSnapshotResponse>("/relationships/snapshot", {
    relationship_type: relationshipType,
    source_entity_id: sourceEntityId,
    target_entity_id: targetEntityId,
  });
}

export function listRelationshipsForEntity(data: Record<string, unknown>) {
  return post<{ relationships: RelationshipSnapshot[] }>("/list_relationships", data);
}

export function createRelationship(data: Record<string, unknown>) {
  return post<RelationshipSnapshot>("/create_relationship", data);
}

export function deleteRelationship(relationshipType: string, sourceEntityId: string, targetEntityId: string, reason?: string) {
  return post<Record<string, unknown>>("/delete_relationship", {
    relationship_type: relationshipType,
    source_entity_id: sourceEntityId,
    target_entity_id: targetEntityId,
    reason,
  });
}

export function restoreRelationship(relationshipType: string, sourceEntityId: string, targetEntityId: string, reason?: string) {
  return post<Record<string, unknown>>("/restore_relationship", {
    relationship_type: relationshipType,
    source_entity_id: sourceEntityId,
    target_entity_id: targetEntityId,
    reason,
  });
}

export function retrieveRelatedEntities(params: RelatedEntitiesParams) {
  return post<Record<string, unknown>>("/retrieve_related_entities", params);
}
