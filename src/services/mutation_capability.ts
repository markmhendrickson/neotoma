/**
 * Agent-grant checks for the mutating entry points that do not reach the
 * store or correction admission (`store_admission.ts`, `createCorrection`):
 * entity delete / restore / merge / split, schema registration, bundle
 * activation, and the flows that write through the in-process operations
 * layer or straight to storage (issues on the owner path, peers,
 * subscriptions, unstructured uploads, published-page links).
 *
 * One rule for every one of them, the rule `/store` and `/correct` apply:
 *
 *   - A request with no agent identity (an owner session: Bearer / OAuth /
 *     local / Inspector) is not capability-gated.
 *   - An AAuth-admitted agent must hold a capability entry for the op that
 *     covers every entity type the call touches. Absent → `capability_denied`.
 *   - A signature whose grant is revoked, suspended, unbound, invalid or in a
 *     pin conflict is refused (the `deny` ceiling).
 *   - An unrecognised signer follows `NEOTOMA_AGENT_DEFAULT_DENY`, except on
 *     routes that also serve guests under access policy (`guestCapable`),
 *     where it keeps today's behaviour, as `/store` does for guests.
 *   - The protected-type guard runs in addition, with the same op.
 *
 * Every check runs before the first write, so a refusal changes nothing.
 * For every id a call names, the check covers the entity's stored type as
 * well as any type the request names.
 */

import { db } from "../db.js";
import { logger } from "../utils/logger.js";
import {
  AgentCapabilityError,
  capabilityCeilingFromAdmission,
  contextFromAgentIdentity,
  enforceAgentCapability,
  enforceAgentRelationshipCapability,
  type AgentCapabilityOp,
} from "./agent_capabilities.js";
import { assertCanWriteProtectedBatch, isProtected } from "./protected_entity_types.js";
import { getCurrentAAuthAdmission, getCurrentAgentIdentity } from "./request_context.js";

/** Entity types an issue thread writes: the issue and its conversation. */
export const ISSUE_THREAD_ENTITY_TYPES: readonly string[] = [
  "issue",
  "conversation",
  "conversation_message",
];

export interface MutationCapabilityOptions {
  /**
   * The route also serves guests (signers no grant recognises) under access
   * policy. Such a signer keeps today's behaviour here, as on `/store`; an
   * admitted agent and a refused (`deny`) signature are still checked.
   */
  guestCapable?: boolean;
}

/**
 * Ops granted only by an entry that names them. On a protected type (such as
 * `agent_grant`) they also need the type named: `"*"` on the op is not enough,
 * because these ops remove, revive, fold together or re-schema governance
 * state rather than add to it.
 */
const NAMED_ONLY_OPS: ReadonlySet<AgentCapabilityOp> = new Set<AgentCapabilityOp>([
  "delete",
  "restore",
  "merge",
  "split",
  "register_schema",
]);

/**
 * Throws `AgentCapabilityError` unless the current caller may perform `op` on
 * every type in `entityTypes`. No-op for a request with no agent identity.
 *
 * A blank type, or an empty list, cannot be judged against a type scope, so it
 * is judged as `"*"`: only an entry granting the op on every type covers it.
 */
export function assertCurrentAgentMay(
  op: AgentCapabilityOp,
  entityTypes: readonly string[],
  options: MutationCapabilityOptions = {}
): void {
  const identity = getCurrentAgentIdentity();
  if (!identity) return;
  const admission = getCurrentAAuthAdmission();
  const named = entityTypes.filter(
    (t): t is string => typeof t === "string" && t.trim().length > 0
  );
  const unjudgeable = named.length === 0 || named.length !== entityTypes.length;
  const types = Array.from(new Set(unjudgeable ? [...named, "*"] : named));

  const ctx = contextFromAgentIdentity(identity);
  if (ctx) {
    const ceiling = capabilityCeilingFromAdmission(admission);
    const unrecognisedGuest =
      options.guestCapable === true && ceiling.kind === "none" && identity.thumbprint != null;
    if (!unrecognisedGuest) {
      enforceAgentCapability(op, types, ctx);
      if (NAMED_ONLY_OPS.has(op) && ceiling.kind === "grant") {
        for (const entityType of types) {
          if (!isProtected(entityType)) continue;
          const namesIt = ceiling.capabilities.some(
            (cap) => cap.op === op && cap.entity_types.includes(entityType)
          );
          if (namesIt) continue;
          logger.warn(
            JSON.stringify({
              event: "agent_capability_denied",
              reason: "protected_type_not_named",
              op,
              entity_types: [entityType],
              agent_label: ctx.agentLabel,
              admitted: true,
            })
          );
          throw new AgentCapabilityError({
            op,
            entityType,
            agentLabel: ctx.agentLabel,
            hint:
              `Protected entity_type "${entityType}" needs an entry that names it for "${op}"; ` +
              `"*" does not cover it for this op. Add { op: "${op}", entity_types: ["${entityType}"] } ` +
              "to the grant, or have an owner session perform it.",
          });
        }
      }
    }
  }
  assertCanWriteProtectedBatch({
    entity_types: types.filter((t) => t !== "*"),
    op,
    identity,
    admission,
  });
}

/**
 * Stored entity type per id, for ids the owner holds (or that no owner holds,
 * which the write paths also accept). Ids that do not resolve are absent: the
 * caller's own lookup answers not-found for them.
 */
export async function storedEntityTypeMap(
  userId: string,
  entityIds: readonly string[]
): Promise<Map<string, string>> {
  const ids = Array.from(
    new Set(entityIds.filter((id): id is string => typeof id === "string" && id.length > 0))
  );
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data, error } = await db
    .from("entities")
    .select("id, entity_type, user_id")
    .in("id", ids);
  if (error) {
    // Fail closed: a check that cannot read the types it checks refuses.
    throw new Error(`Failed to resolve entity types for the capability check: ${error.message}`);
  }
  for (const row of (data ?? []) as Array<{
    id?: unknown;
    entity_type?: unknown;
    user_id?: unknown;
  }>) {
    if (row.user_id !== userId && row.user_id !== null && row.user_id !== undefined) continue;
    if (typeof row.id === "string" && typeof row.entity_type === "string" && row.entity_type) {
      out.set(row.id, row.entity_type);
    }
  }
  return out;
}

/** Distinct stored entity types for `entityIds` (see {@link storedEntityTypeMap}). */
export async function storedEntityTypes(
  userId: string,
  entityIds: readonly string[]
): Promise<string[]> {
  return Array.from(new Set((await storedEntityTypeMap(userId, entityIds)).values()));
}

/**
 * {@link assertCurrentAgentMay} over the stored types of `entityIds` plus any
 * type the request names (`requestedTypes`). Reads storage only when the
 * request carries an agent identity, so owner sessions pay nothing.
 */
export async function assertCurrentAgentMayOnEntities(
  op: AgentCapabilityOp,
  userId: string,
  entityIds: readonly string[],
  requestedTypes: readonly string[] = [],
  options: MutationCapabilityOptions = {}
): Promise<void> {
  if (!getCurrentAgentIdentity()) return;
  const stored = await storedEntityTypes(userId, entityIds);
  assertCurrentAgentMay(op, [...stored, ...requestedTypes], options);
}

/**
 * `_deleted` is the instance's own lifecycle marker: an observation or a
 * correction that carries it hides the entity (`true`) or shows it again (any
 * other value), the same effect as `delete_entity` / `restore_entity`. A write
 * that carries it is that op, whatever entry point it came through.
 */
export const LIFECYCLE_MARKER_FIELD = "_deleted";

/** The op a write carrying `fields` performs on the entity's visibility, if any. */
export function lifecycleOpForFields(
  fields: Record<string, unknown> | null | undefined
): "delete" | "restore" | null {
  if (!fields || typeof fields !== "object") return null;
  if (!Object.prototype.hasOwnProperty.call(fields, LIFECYCLE_MARKER_FIELD)) return null;
  return fields[LIFECYCLE_MARKER_FIELD] === true ? "delete" : "restore";
}

/**
 * Throws `AgentCapabilityError` unless the current caller holds `delete` (or
 * `restore`) on `entityType` when `fields` carries the lifecycle marker. No-op
 * when the marker is absent or the request has no agent identity.
 */
export function assertCurrentAgentMayWriteLifecycleMarker(
  entityType: string,
  fields: Record<string, unknown> | null | undefined,
  options: MutationCapabilityOptions = {}
): void {
  const op = lifecycleOpForFields(fields);
  if (!op) return;
  assertCurrentAgentMay(op, [entityType], options);
}

/**
 * The entity type a structured store writes an entity under. The MCP store's
 * plan and write loops call this too, so the check and the write cannot
 * resolve the type differently (a blank `entity_type` falls through to `type`).
 * A non-string value is passed through unchanged, and the check judges it as
 * `"*"`.
 */
export function storeEntityTypeOf(entity: Record<string, unknown> | null | undefined): string {
  return ((entity?.entity_type as string) || (entity?.type as string) || "generic") as string;
}

/** Ids a store entity names as the entity to extend (`target_id`, `entity_id`). */
function storeTargetIds(entity: Record<string, unknown> | null | undefined): string[] {
  return ["target_id", "entity_id"]
    .map((key) => entity?.[key])
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

/**
 * Agent-grant checks a structured store needs beyond `store` on the type it
 * names, run for every entity before the first write:
 *
 *   - an entity that extends an existing one (`target_id` / `entity_id`) also
 *     needs `store` on that entity's stored type;
 *   - the reserved lifecycle marker needs `delete` / `restore` on the named
 *     type and on the stored type of the entity it extends.
 */
export async function assertCurrentAgentMayStoreEntities(
  userId: string,
  entities: ReadonlyArray<Record<string, unknown> | null | undefined>
): Promise<void> {
  if (!getCurrentAgentIdentity()) return;
  const targetTypes = await storedEntityTypeMap(
    userId,
    entities.flatMap((entity) => storeTargetIds(entity))
  );
  for (const entity of entities) {
    if (!entity || typeof entity !== "object") continue;
    const named = storeEntityTypeOf(entity);
    const extended = storeTargetIds(entity)
      .map((id) => targetTypes.get(id))
      .filter((t): t is string => typeof t === "string");
    const otherTypes = extended.filter((t) => t !== named);
    if (otherTypes.length > 0) assertCurrentAgentMay("store", otherTypes);
    const nested = (entity as { fields?: unknown }).fields;
    for (const entityType of [named, ...otherTypes]) {
      assertCurrentAgentMayWriteLifecycleMarker(entityType, entity);
      if (nested && typeof nested === "object" && !Array.isArray(nested)) {
        assertCurrentAgentMayWriteLifecycleMarker(entityType, nested as Record<string, unknown>);
      }
    }
  }
}

/**
 * Agent-grant check for edges a flow creates from a new entity of
 * `sourceType` to entities the caller names (`targetIds`): the same
 * `create_relationship` entry must cover the relationship type and both
 * endpoint types, as on `create_relationship`. A target that does not resolve
 * is judged as `"*"`.
 */
export async function assertCurrentAgentMayLink(
  userId: string,
  sourceType: string,
  relationshipType: string,
  targetIds: readonly string[],
  options: MutationCapabilityOptions = {}
): Promise<void> {
  const identity = getCurrentAgentIdentity();
  const ids = targetIds.filter((id) => typeof id === "string" && id.trim().length > 0);
  if (!identity || ids.length === 0) return;
  const ctx = contextFromAgentIdentity(identity);
  if (!ctx) return;
  const admission = getCurrentAAuthAdmission();
  if (
    options.guestCapable === true &&
    capabilityCeilingFromAdmission(admission).kind === "none" &&
    identity.thumbprint != null
  ) {
    return;
  }
  const types = await storedEntityTypeMap(userId, ids);
  const targetTypes = new Set(ids.map((id) => types.get(id) ?? "*"));
  for (const targetType of targetTypes) {
    enforceAgentRelationshipCapability(relationshipType, [sourceType, targetType], ctx);
  }
}

/**
 * Entity type an unstructured upload is recorded under, by MIME type. Shared
 * by the MCP asset-entity write and the capability check on both transports.
 */
export function assetEntityTypeForMimeType(mimeType: string | null | undefined): string {
  const normalized = (mimeType || "").toLowerCase();
  if (normalized.startsWith("image/")) return "image_asset";
  if (normalized.startsWith("audio/")) return "audio_asset";
  if (normalized.startsWith("video/")) return "video_asset";
  return "file_asset";
}
