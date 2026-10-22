/** Shared pure admission gates; importing this module never starts a transport. */
import { logger } from "../utils/logger.js";
import {
  getRequestContext,
  getCurrentAgentIdentity,
  getCurrentAAuthAdmission,
} from "./request_context.js";
import { assertGuestWriteAllowed, type GuestIdentity } from "./access_policy.js";
import { contextFromAgentIdentity, enforceAgentCapability } from "./agent_capabilities.js";
import { enforceRelationshipWriteCapabilities } from "./relationship_write_capability.js";
import { assertCanWriteProtectedBatch } from "./protected_entity_types.js";
import type { StoreInterpretationInput } from "../shared/action_schemas.js";
export type StoreRelationshipRef = {
  relationship_type: string;
  source_index?: number;
  target_index?: number;
  source_entity_id?: string;
  target_entity_id?: string;
  metadata?: Record<string, unknown>;
};

export interface StructuredStoreApiParams {
  expectedEntityAbsent?: boolean;
  userId: string;
  entities: Record<string, unknown>[];
  sourcePriority: number;
  observationSource?: import("../shared/action_schemas.js").ObservationSource;
  /** When set, written observations carry this peer id for sync loop prevention. */
  sourcePeerId?: string | null;
  idempotencyKey: string;
  originalFilename?: string;
  relationships?: StoreRelationshipRef[];
  interpretation?: StoreInterpretationInput;
  interpretationSourceId?: string;
  commit?: boolean;
  strict?: boolean;
}

/** Pure pre-persistence admission, reusable before either combined leg starts. */
export async function preflightStructuredStoreAdmission(
  params: StructuredStoreApiParams
): Promise<void> {
  const {
    userId,
    entities,
    relationships,
    interpretation,
    interpretationSourceId,
    sourcePeerId,
    idempotencyKey,
  } = params;
  const commit = params.commit !== false;
  const { assertConditionalStoreRequest } = await import("./store_condition_request.js");
  assertConditionalStoreRequest({
    entities,
    idempotency_key: idempotencyKey,
    expected_entity_absent: params.expectedEntityAbsent,
    commit,
    relationships,
    interpretation,
    interpretation_source_id: interpretationSourceId,
    source_peer_id: sourcePeerId ?? undefined,
  });

  // Access policy: when the caller is a guest (AAuth-verified but not admitted
  // via a grant), check per-entity-type access policies. If the policy allows
  // guest writes, the request proceeds without requiring an agent_grant.
  const requestContext = getRequestContext();
  const agentIdentity = getCurrentAgentIdentity();
  const admission = getCurrentAAuthAdmission();
  const isAAuthVerified = agentIdentity?.thumbprint != null;
  const isGuest = isAAuthVerified && (!admission || !admission.admitted);

  if (isGuest && !requestContext?.bypassGuestStoreAccessPolicy) {
    const entityTypes = entities
      .map((entity) => entity?.entity_type)
      .filter((t): t is string => typeof t === "string" && t.length > 0);
    const guestId: GuestIdentity = {
      thumbprint: agentIdentity.thumbprint,
      sub: agentIdentity.sub,
      iss: agentIdentity.iss,
    };
    await assertGuestWriteAllowed(entityTypes, guestId);
  }

  // usage_digest store-seam redaction guard (server-side backstop).
  // Scope: strictly usage_digest entities only — no impact on any other entity type.
  // For each incoming usage_digest entity, scan free-text fields `notes` and
  // `friction_notes` via the pure redactUsageDigestEntity helper, and write the
  // redacted copies back onto the entity object so the raw input is never persisted.
  // This is a redact-and-store (scan) approach, not hard-reject, so a digest is
  // never silently dropped on a client-side redaction miss.
  //
  // NOTE: Single telemetry sink today — entity_type === "usage_digest" is the only
  // branch. If a second redacted-free-text entity_type appears, lift these field
  // names into schema metadata (redact_free_text_fields) rather than adding another
  // branch here.
  {
    const hasUsageDigest = entities.some(
      (e) => (e as Record<string, unknown>)?.entity_type === "usage_digest"
    );
    if (hasUsageDigest) {
      const { redactUsageDigestEntity } = await import("./feedback/usage_digest_redaction.js");
      for (const entityData of entities) {
        const ed = entityData as Record<string, unknown>;
        if (ed.entity_type !== "usage_digest") continue;
        const result = redactUsageDigestEntity(ed as Parameters<typeof redactUsageDigestEntity>[0]);
        if (result.applied) {
          logger.warn(
            `[STORE] usage_digest server-side redaction applied: ${result.hits} hit(s) in free-text fields.`
          );
        }
      }
    }
  }

  // Capability scoping: when the caller is an AAuth-verified agent covered
  // by the capability registry, gate store_structured by entity_type here
  // before any writes touch the DB. Guests who passed access policy above
  // skip grant-based capability enforcement. Unknown / anonymous callers
  // fall through (attribution_policy still gates their writes downstream).
  const capabilityCtx = contextFromAgentIdentity(getCurrentAgentIdentity());
  if (capabilityCtx && !isGuest) {
    const entityTypes = entities
      .map((entity) => entity?.entity_type)
      .filter((t): t is string => typeof t === "string" && t.length > 0);
    enforceAgentCapability("store", entityTypes, capabilityCtx);
    if (Array.isArray(relationships) && relationships.length > 0) {
      // Same shared check the MCP store and every standalone relationship
      // entrance run (services/relationship_write_capability.ts).
      await enforceRelationshipWriteCapabilities({
        userId,
        entities,
        relationships,
        capabilityCtx,
      });
    }
  }

  // Relationship-type validation, UP FRONT and BEFORE any entity is persisted
  // (#1972 / G25).
  //
  // This closes the more damaging half of the closed-vocabulary defect. The
  // relationships leg further down catches per edge and downgrades to
  // logger.warn, so a store carrying an edge the substrate would not accept
  // returned SUCCESS with the edge silently absent — a caller believed it had
  // written a graph it had not written, and nothing in the response said
  // otherwise. Validating here means an unacceptable type is a refusal the
  // caller sees, and no entities are written that would have been orphaned by
  // the edge that was going to fail anyway.
  if (commit && Array.isArray(relationships) && relationships.length > 0) {
    const { relationshipsService } = await import("./relationships.js");
    const seen = new Set<string>();
    for (const rel of relationships) {
      const type = rel?.relationship_type;
      if (typeof type !== "string" || seen.has(type)) continue;
      seen.add(type);
      await relationshipsService.assertRegisteredType(type, userId);
    }
  }

  // Protected-entity-types guard: governance state (`agent_grant`, etc.)
  // is gated by an explicit capability on the admitted grant. Mirrors
  // the same check made deep in `createObservation` so callers see a
  // structured `capability_denied` envelope before any writes.
  {
    const entityTypes = entities
      .map((entity) => entity?.entity_type)
      .filter((t): t is string => typeof t === "string" && t.length > 0);
    assertCanWriteProtectedBatch({
      entity_types: entityTypes,
      op: "store",
      identity: getCurrentAgentIdentity(),
      admission: getCurrentAAuthAdmission(),
    });
  }

  // A key thumbprint may be pinned by agent_grants under one owner only.
  // Checked before any write so a refused pin persists nothing; the same
  // check runs again at the observation insert.
  if (entities.some((entity) => entity?.entity_type === "agent_grant")) {
    const { assertGrantWriteKeepsPinUnique } = await import("./agent_grants.js");
    for (const entity of entities) {
      if (entity?.entity_type !== "agent_grant") continue;
      await assertGrantWriteKeepsPinUnique({
        userId,
        entityType: "agent_grant",
        fields: entity,
      });
    }
  }

  const { detectFlatPackedRows, FlatPackedRowsError } = await import("./flat_packed_detection.js");
  // Reject flat-packed rows (whole tables smuggled into a single entity as
  // `<prefix>_<index>_<suffix>` keys). These cannot produce per-row snapshots
  // and are almost always a caller bug. The caller should split into one
  // entity per row and retry.
  for (const entityData of entities) {
    const detection = detectFlatPackedRows(entityData as Record<string, unknown>);
    if (detection.detected) {
      throw new FlatPackedRowsError(detection);
    }
  }
}
