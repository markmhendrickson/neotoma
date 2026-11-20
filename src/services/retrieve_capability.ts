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

/**
 * Gate for reads with no per-type check of their own (`read_full_scope` in
 * src/shared/retrieve_scope_classification.ts). A bound grant needs a `"*"`
 * retrieve entry; a type-limited grant is refused, and a grant with no
 * `retrieve` entry is refused by {@link currentRetrieveScope}. Runs no
 * statement.
 */
export function enforceFullRetrieveScope(operation: string): void {
  const ctx = boundRetrieveContext();
  if (!ctx) return;
  const scope = enforceAgentRetrieveScope(ctx, []);
  if (scope === null || scope.kind === "all") return;
  throw new AgentCapabilityError({
    op: "retrieve",
    entityType: "*",
    agentLabel: ctx.agentLabel,
    hint:
      `"${operation}" returns data across entity types and has no per-type check, so it ` +
      `needs a "retrieve" capability for every type: { op: "retrieve", entity_types: ["*"] }. ` +
      `Agent "${ctx.agentLabel}" may retrieve only [${scope.types.map((t) => `"${t}"`).join(", ")}].`,
  });
}

/**
 * Ids of the caller's entities whose type the scope allows, for injecting
 * as an `entity_id IN (...)` filter before a list query runs.
 */
export async function allowedEntityIdsForScope(
  scope: AgentRetrieveScope & { kind: "types" },
  userId: string
): Promise<string[]> {
  const { data, error } = await db
    .from("entities")
    .select("id")
    .eq("user_id", userId)
    .in("entity_type", scope.types);
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id).sort();
}

/** Types of the caller's entities by id (ids not found are absent). */
export async function entityTypesById(
  ids: string[],
  userId: string
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((id) => typeof id === "string" && id.length > 0)));
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const { data, error } = await db
    .from("entities")
    .select("id, entity_type")
    .in("id", unique)
    .eq("user_id", userId);
  if (error) throw error;
  for (const row of (data ?? []) as Array<{ id: string; entity_type?: string | null }>) {
    if (typeof row.entity_type === "string" && row.entity_type.length > 0) {
      out.set(row.id, row.entity_type);
    }
  }
  return out;
}

type Edge = { source_entity_id: string; target_entity_id: string };

/**
 * Narrow a traversal result rooted at `rootId` to the scope: keep only edges
 * whose two endpoints are of allowed types, then keep only what is still
 * reachable from the root through kept edges, so nothing is reached through
 * an entity the grant may not read. An endpoint whose type cannot be read is
 * treated as not allowed (fail closed). Returns `null` when no scope binds.
 */
export async function narrowTraversalToScope<E extends Edge>(
  rootId: string,
  edges: E[],
  userId: string
): Promise<{ edges: E[]; entityIds: Set<string> } | null> {
  const scope = currentRetrieveScope();
  if (scope === null || scope.kind === "all") return null;
  const ids = edges.flatMap((e) => [e.source_entity_id, e.target_entity_id]);
  const types = await entityTypesById([rootId, ...ids], userId);
  const allowed = (id: string) => {
    const t = types.get(id);
    return t !== undefined && scope.types.includes(t);
  };
  const usable = edges.filter((e) => allowed(e.source_entity_id) && allowed(e.target_entity_id));
  const reached = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of usable) {
      const a = reached.has(e.source_entity_id);
      const b = reached.has(e.target_entity_id);
      if (a !== b) {
        reached.add(a ? e.target_entity_id : e.source_entity_id);
        grew = true;
      }
    }
  }
  const kept = usable.filter(
    (e) => reached.has(e.source_entity_id) && reached.has(e.target_entity_id)
  );
  reached.delete(rootId);
  return { edges: kept, entityIds: reached };
}
