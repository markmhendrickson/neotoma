/**
 * Relationship-write capability enforcement, shared by every entrance that
 * creates an edge.
 *
 * `enforceAgentRelationshipCapability` (agent_capabilities.ts) is the pure
 * decision: one `create_relationship` grant entry must cover the relationship
 * type AND both endpoint entity types. This module is the part every surface
 * needs around that decision and must not re-implement: resolving each
 * endpoint's entity type owner-scoped, failing closed when an endpoint does not
 * resolve, and deciding which callers the grant applies to.
 *
 * Entrances, all routed through here (neotoma#2524 / PR #2525):
 *   - REST `/store` (`storeStructuredForApi`) and MCP `store`
 *     (`storeStructuredInternal`) — batch-authorized up front, before the first
 *     entity write, via {@link enforceCurrentAgentRelationshipWrites}.
 *   - Every edge write through `relationshipsService.createRelationship`
 *     (REST/MCP `create_relationship`, `create_relationships`,
 *     `/interpretations/create`, MCP `create_interpretation`, the store
 *     relationship loops, CLI and in-process `ops` callers, which reach the
 *     REST/MCP handlers) — per edge, inside the service.
 *   - `restoreRelationship` (REST/MCP `restore_relationship`) — reviving an
 *     edge is an edge write.
 *
 * The check is the same one everywhere, so a sibling path cannot drift from
 * the one that was fixed: that drift is the defect this module exists to
 * close.
 *
 * Identity is read from the request-scoped context. Every in-process caller
 * that writes an edge on an agent's behalf must therefore run inside that
 * agent's request context; work replayed outside it (a background job) sees
 * no identity and is not gated here.
 */

import { db } from "../db.js";
import {
  AgentCapabilityError,
  contextFromAgentIdentity,
  enforceAgentRelationshipCapability,
  type AgentCapabilityContext,
} from "./agent_capabilities.js";
import { getCurrentAAuthAdmission, getCurrentAgentIdentity } from "./request_context.js";

/**
 * One requested edge. Endpoints are either explicit entity ids (resolved
 * owner-scoped from the entity table) or indexes into an incoming entity batch
 * (typed from that batch).
 */
export interface RelationshipWriteRef {
  relationship_type: string;
  source_entity_id?: string;
  target_entity_id?: string;
  source_index?: number;
  target_index?: number;
}

/**
 * The capability context a relationship write is judged under, or `null` when
 * no grant-based enforcement applies to the caller.
 *
 * Mirrors the rule `storeStructuredForApi` already applied to store: callers
 * with no agent identity are not capability-gated (attribution policy still
 * governs them), and an AAuth-verified caller that was not admitted by a grant
 * is a guest governed by access policy instead — unless its admission reason
 * yields the `deny` ceiling, which is enforced. Keeping that rule here, once,
 * is what makes the REST and MCP store paths and the standalone routes agree.
 */
export function currentRelationshipCapabilityContext(): AgentCapabilityContext | null {
  const identity = getCurrentAgentIdentity();
  const capabilityCtx = contextFromAgentIdentity(identity);
  if (!capabilityCtx) return null;
  const admission = getCurrentAAuthAdmission();
  const isGuest = identity?.thumbprint != null && (!admission || !admission.admitted);
  // A signature that names a revoked, suspended, unbound, invalid or
  // pin-conflicting grant is not a guest: it produces the `deny` ceiling, and
  // `enforceAgentCapability` refuses it. Only an unrecognised signer (the
  // `none` ceiling) is left to access policy — the same split the MCP store
  // gate applies.
  if (isGuest && capabilityCtx.ceiling?.kind !== "deny") return null;
  return capabilityCtx;
}

/** Owner-scoped `id → entity_type` for the given ids. Unowned ids are absent. */
async function resolveOwnedEntityTypes(
  userId: string,
  entityIds: string[]
): Promise<Map<string, string>> {
  const entityTypesById = new Map<string, string>();
  if (entityIds.length === 0) return entityTypesById;
  const { data, error } = await db
    .from("entities")
    .select("id, entity_type")
    .in("id", entityIds)
    .eq("user_id", userId);
  if (error) {
    throw new Error(`Failed to resolve relationship endpoint types: ${error.message}`);
  }
  for (const row of (data ?? []) as Array<{ id?: unknown; entity_type?: unknown }>) {
    if (typeof row.id === "string" && typeof row.entity_type === "string") {
      entityTypesById.set(row.id, row.entity_type);
    }
  }
  return entityTypesById;
}

/**
 * Resolve and authorize every relationship against `capabilityCtx`.
 *
 * Index references take their type from `entities` (`entity_type`, falling
 * back to `type` as the MCP store does); explicit ids are resolved owner-scoped.
 * An endpoint that does not resolve fails closed rather than reducing the check
 * to whichever half happened to resolve.
 */
export async function enforceRelationshipWriteCapabilities(params: {
  userId: string;
  relationships: RelationshipWriteRef[];
  capabilityCtx: AgentCapabilityContext;
  entities?: Record<string, unknown>[];
}): Promise<void> {
  const { userId, relationships, capabilityCtx } = params;
  const entities = params.entities ?? [];
  const explicitIds = Array.from(
    new Set(
      relationships.flatMap((relationship) =>
        [relationship.source_entity_id, relationship.target_entity_id].filter(
          (entityId): entityId is string => typeof entityId === "string" && entityId.length > 0
        )
      )
    )
  );
  const entityTypesById = await resolveOwnedEntityTypes(userId, explicitIds);

  const typeAtIndex = (index: number | undefined): string | undefined => {
    if (typeof index !== "number") return undefined;
    const entity = entities[index];
    const entityType = entity?.entity_type ?? entity?.type;
    return typeof entityType === "string" && entityType.length > 0 ? entityType : undefined;
  };

  for (const relationship of relationships) {
    const sourceEntityType =
      typeof relationship.source_entity_id === "string"
        ? entityTypesById.get(relationship.source_entity_id)
        : typeAtIndex(relationship.source_index);
    const targetEntityType =
      typeof relationship.target_entity_id === "string"
        ? entityTypesById.get(relationship.target_entity_id)
        : typeAtIndex(relationship.target_index);

    if (!sourceEntityType || !targetEntityType) {
      throw new AgentCapabilityError({
        op: "create_relationship",
        entityType: sourceEntityType ?? targetEntityType ?? "unknown",
        agentLabel: capabilityCtx.agentLabel,
        hint:
          `Relationship capability could not be evaluated for relationship_type ` +
          `"${relationship.relationship_type}" because one or both endpoint entity types ` +
          `did not resolve for this owner. The edge was denied before it was written.`,
      });
    }

    enforceAgentRelationshipCapability(
      relationship.relationship_type,
      [sourceEntityType, targetEntityType],
      capabilityCtx
    );
  }
}

/**
 * Authorize relationship writes for the caller on the current request.
 * No-op when {@link currentRelationshipCapabilityContext} says no grant-based
 * enforcement applies; otherwise throws {@link AgentCapabilityError} on the
 * first edge the grant does not cover.
 */
export async function enforceCurrentAgentRelationshipWrites(params: {
  userId: string;
  relationships: RelationshipWriteRef[];
  entities?: Record<string, unknown>[];
}): Promise<void> {
  if (params.relationships.length === 0) return;
  const capabilityCtx = currentRelationshipCapabilityContext();
  if (!capabilityCtx) return;
  await enforceRelationshipWriteCapabilities({ ...params, capabilityCtx });
}
