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
import {
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
  const { data, error } = await db
    .from("entities")
    .select("id, entity_type")
    .in("id", ids)
    .eq("user_id", userId);
  if (error) throw error;
  const types = ((data ?? []) as Array<{ entity_type?: string | null }>)
    .map((row) => row.entity_type)
    .filter((t): t is string => typeof t === "string" && t.length > 0);
  enforceAgentRetrieveScope(ctx, types);
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
