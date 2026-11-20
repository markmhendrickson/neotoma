/**
 * Per-entity reads under the opt-in agent-grant retrieve scope
 * (`NEOTOMA_ENFORCE_AGENT_RETRIEVE=1`).
 *
 * A read of a named entity (by id, by identifier, snapshot, observations,
 * field provenance) resolves the entity's type and refuses with the shared
 * {@link AgentCapabilityError} unless the admitted grant's `retrieve` entries
 * cover it. The decision itself is {@link enforceAgentRetrieveScope}, the
 * same helper the entity query uses, so REST and MCP cannot drift.
 *
 * With the setting off, or for a request without an admitted grant, these
 * functions return before running any statement.
 */

import { db } from "../db.js";
import { resolveAttachmentTarget } from "./attachment_resolution.js";
import {
  AgentCapabilityError,
  contextFromAgentIdentity,
  enforceAgentRetrieveScope,
  isAgentRetrieveEnforcementEnabled,
  type AgentCapabilityContext,
  type AgentRetrieveScope,
} from "./agent_capabilities.js";
import { getCurrentAgentIdentity } from "./request_context.js";

/**
 * The capability context when the retrieve scope binds this request, else
 * `null`. Throws when the grant has no `retrieve` entry (fail closed).
 */
function boundRetrieveContext(): AgentCapabilityContext | null {
  if (!isAgentRetrieveEnforcementEnabled()) return null;
  const ctx = contextFromAgentIdentity(getCurrentAgentIdentity());
  if (enforceAgentRetrieveScope(ctx, []) === null) return null;
  return ctx;
}

/** Refuse unless the grant covers every listed entity type. */
export function enforceRetrieveForEntityTypes(entityTypes: string[]): void {
  const ctx = boundRetrieveContext();
  if (!ctx) return;
  enforceAgentRetrieveScope(ctx, entityTypes);
}

/**
 * Resolve the types of the named entities (owned by `userId`) and refuse
 * unless the grant covers each. Ids that resolve to nothing are left to the
 * caller's own not-found handling.
 *
 * A merged-away id is read through to its surviving entity (the entity
 * readers follow `merged_to_entity_id`), and a merge does not require both
 * sides to share a type. So each id is resolved through the merge chain with
 * {@link resolveAttachmentTarget}, the resolution the readers use, and the
 * grant must cover the type of the requested row AND of every entity on the
 * chain. That resolver carries the cycle guard and the depth cap; a chain it
 * could not resolve to a fixed point is refused unless the grant covers every
 * type (`*`). So is a chain whose last entity still carries a merge link: the
 * resolver stops there when a hop lookup fails, and the reader would follow
 * the link to an entity this check never saw (fail closed).
 */
export async function enforceRetrieveForEntityIds(
  entityIds: Array<string | null | undefined>,
  userId: string
): Promise<void> {
  const ctx = boundRetrieveContext();
  if (!ctx) return;
  const ids = Array.from(
    new Set(entityIds.filter((id): id is string => typeof id === "string" && id.length > 0))
  );
  if (ids.length === 0) return;
  const chainIds = new Set<string>(ids);
  const resolvedIds = new Map<string, string>();
  let unresolvedChainFrom: string | null = null;
  for (const id of ids) {
    const target = await resolveAttachmentTarget(id, userId);
    for (const hop of target.path) chainIds.add(hop);
    resolvedIds.set(id, target.resolvedEntityId);
    if (target.truncated && unresolvedChainFrom === null) unresolvedChainFrom = id;
  }
  const { data, error } = await db
    .from("entities")
    .select("id, entity_type, merged_to_entity_id")
    .in("id", Array.from(chainIds))
    .eq("user_id", userId);
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id: string;
    entity_type?: string | null;
    merged_to_entity_id?: string | null;
  }>;
  // The resolver reports a failed hop lookup the same way as a row with no
  // merge link (its read path degrades rather than throws). If the entity the
  // chain stopped at still carries a merge link, a hop was not followed, and
  // the reader would follow it to an entity whose type was never checked.
  const mergeLinkById = new Map(rows.map((row) => [row.id, row.merged_to_entity_id ?? null]));
  if (unresolvedChainFrom === null) {
    for (const [id, resolved] of resolvedIds) {
      if (mergeLinkById.get(resolved)) {
        unresolvedChainFrom = id;
        break;
      }
    }
  }
  const types = rows
    .map((row) => row.entity_type)
    .filter((t): t is string => typeof t === "string" && t.length > 0);
  const scope = enforceAgentRetrieveScope(ctx, types);
  if (unresolvedChainFrom !== null && scope !== null && scope.kind !== "all") {
    throw new AgentCapabilityError({
      op: "retrieve",
      entityType: types[0] ?? "*",
      agentLabel: ctx.agentLabel,
      hint:
        `The merge chain of entity ${unresolvedChainFrom} could not be resolved to its ` +
        `surviving entity, so its type cannot be checked against the "retrieve" ` +
        `capability of agent "${ctx.agentLabel}".`,
    });
  }
}

/**
 * The retrieve scope binding this request, or `null` when none applies.
 * Callers with an untyped list read inject `types` as the type filter before
 * the query runs (never filter fetched rows, which would make `total`
 * disagree with the rows).
 */
export function currentRetrieveScope(): AgentRetrieveScope | null {
  const ctx = boundRetrieveContext();
  if (!ctx) return null;
  return enforceAgentRetrieveScope(ctx, []);
}
