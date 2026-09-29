/**
 * Response shapes for the relationship leg of `store` (and interpretation
 * creation), shared by the MCP and HTTP surfaces.
 *
 * A relationship named in a `store` call is created independently of the
 * entities in that call: one that cannot be created is reported in
 * `relationships_refused` and the rest of the call proceeds. Nothing in a
 * refusal distinguishes an endpoint that does not exist from one owned by
 * another user; both read "not found or not accessible".
 */

import { UnregisteredRelationshipTypeError } from "./relationships.js";
import { OwnedEntityNotFoundError } from "./scoped_reads.js";

export interface StoreRelationshipRequest {
  relationship_type: string;
  source_index?: number;
  target_index?: number;
  source_entity_id?: string;
  target_entity_id?: string;
}

export interface StoreRelationshipCreated {
  relationship_type: string;
  source_entity_id: string;
  target_entity_id: string;
}

export interface StoreRelationshipRefused {
  /** Position of the relationship in the request's `relationships` array. */
  relationship_index: number;
  relationship_type: string;
  source_entity_id?: string;
  target_entity_id?: string;
  source_index?: number;
  target_index?: number;
  /** Stable code callers can switch on. */
  code: string;
  reason: string;
  hint?: string;
}

export const RELATIONSHIP_ENDPOINT_NOT_FOUND = "RELATIONSHIP_ENDPOINT_NOT_FOUND";
export const RELATIONSHIP_REFERENCE_UNRESOLVED = "RELATIONSHIP_REFERENCE_UNRESOLVED";
export const RELATIONSHIP_INVALID_ENTITY_ID = "RELATIONSHIP_INVALID_ENTITY_ID";
export const RELATIONSHIP_NOT_CREATED = "RELATIONSHIP_NOT_CREATED";

function base(
  index: number,
  rel: StoreRelationshipRequest,
  sourceEntityId: string | undefined,
  targetEntityId: string | undefined
): Pick<
  StoreRelationshipRefused,
  | "relationship_index"
  | "relationship_type"
  | "source_entity_id"
  | "target_entity_id"
  | "source_index"
  | "target_index"
> {
  return {
    relationship_index: index,
    relationship_type: rel.relationship_type,
    ...(sourceEntityId ? { source_entity_id: sourceEntityId } : {}),
    ...(targetEntityId ? { target_entity_id: targetEntityId } : {}),
    ...(typeof rel.source_index === "number" ? { source_index: rel.source_index } : {}),
    ...(typeof rel.target_index === "number" ? { target_index: rel.target_index } : {}),
  };
}

/** A relationship whose source or target reference did not resolve to an id. */
export function unresolvedRelationshipRefusal(
  index: number,
  rel: StoreRelationshipRequest,
  sourceEntityId: string | undefined,
  targetEntityId: string | undefined
): StoreRelationshipRefused {
  return {
    ...base(index, rel, sourceEntityId, targetEntityId),
    code: RELATIONSHIP_REFERENCE_UNRESOLVED,
    reason:
      "source_index/target_index (or source_entity_id/target_entity_id) did not resolve " +
      "to an entity in this request.",
  };
}

/** A relationship whose caller-supplied entity id is not a well-formed id. */
export function invalidEntityIdRelationshipRefusal(
  index: number,
  rel: StoreRelationshipRequest,
  sourceEntityId: string | undefined,
  targetEntityId: string | undefined
): StoreRelationshipRefused {
  return {
    ...base(index, rel, sourceEntityId, targetEntityId),
    code: RELATIONSHIP_INVALID_ENTITY_ID,
    reason: "source_entity_id/target_entity_id must be an entity id (ent_ + 24 hex).",
  };
}

/** Map an error thrown by `createRelationship` to a refusal entry. */
export function relationshipRefusalFromError(
  index: number,
  rel: StoreRelationshipRequest,
  sourceEntityId: string,
  targetEntityId: string,
  error: unknown
): StoreRelationshipRefused {
  const common = base(index, rel, sourceEntityId, targetEntityId);
  if (error instanceof OwnedEntityNotFoundError) {
    return {
      ...common,
      code: RELATIONSHIP_ENDPOINT_NOT_FOUND,
      reason: "Endpoint entity not found or not accessible.",
      hint:
        "Both endpoints must be entities you own. Store the entity first, or in the " +
        "same store call referenced by index, then link it.",
    };
  }
  if (error instanceof UnregisteredRelationshipTypeError) {
    return {
      ...common,
      code: error.code,
      reason: `Relationship type "${error.relationshipType}" is not registered.`,
      hint: error.hint,
    };
  }
  return {
    ...common,
    code: RELATIONSHIP_NOT_CREATED,
    reason: error instanceof Error ? error.message : String(error),
  };
}
