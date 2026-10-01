/**
 * Correction Service (Domain Layer)
 *
 * Handles creation of correction observations that override entity field values
 * with highest priority. Extracted from actions.ts and server.ts to enforce
 * layer boundaries.
 */

import { db } from "../db.js";
import { generateObservationId } from "./observation_identity.js";
import { recomputeSnapshot } from "./snapshot_computation.js";
import {
  getCurrentAAuthAdmission,
  getCurrentAgentIdentity,
  getCurrentAttribution,
} from "./request_context.js";
import { enforceAttributionPolicy } from "./attribution_policy.js";
import { assertCanWriteProtected } from "./protected_entity_types.js";
import { enforceOverridePolicy } from "./override_validation.js";
import { assertNoOwnerConflict } from "./entity_resolution.js";
import {
  emitEntitySnapshotChange,
  emitObservationCreated,
} from "../events/substrate_store_emit.js";

export interface CreateCorrectionParams {
  entity_id: string;
  entity_type: string;
  field: string;
  value: unknown;
  schema_version: string;
  user_id: string;
  idempotency_key?: string;
  source_peer_id?: string;
}

export interface CorrectionResult {
  observation_id: string;
  entity_id: string;
  field: string;
  value: unknown;
  snapshot?: Record<string, unknown> | null;
}

export async function createCorrection(params: CreateCorrectionParams): Promise<CorrectionResult> {
  enforceAttributionPolicy("corrections", getCurrentAgentIdentity());
  assertCanWriteProtected({
    entity_type: params.entity_type,
    op: "correct",
    identity: getCurrentAgentIdentity(),
    admission: getCurrentAAuthAdmission(),
  });
  // Pre-persist shape guard for agent_grant fields (no-op for every other
  // entity_type). Throws before any row is written. `correct()` is the raw
  // entity-store surface that bypasses agent_grants.ts's own
  // createGrant/updateGrantFields validation entirely — it is how the
  // JSON-string-capabilities and empty-entity_types grants now live in
  // prod got there. Lazy import to avoid a cycle: agent_grants.ts already
  // lazy-imports this module for the same reason (writeGrantEntity /
  // updateGrantFields / setStatus / recordMatch each call createCorrection).
  {
    const { assertAgentGrantFieldValid } = await import("./agent_grants.js");
    assertAgentGrantFieldValid(params.entity_type, params.field, params.value);
  }
  await enforceOverridePolicy({
    entityType: params.entity_type,
    entityId: params.entity_id,
    fields: { [params.field]: params.value },
    identity: getCurrentAgentIdentity(),
    admission: getCurrentAAuthAdmission(),
    userId: params.user_id,
    db,
  });

  // Fail-closed ownership guard. `correct()` is the raw entity-store surface
  // (see the assertAgentGrantFieldValid comment above) — a caller can name
  // any entity_id directly with no resolution step in between, so this is
  // the ONLY chance to refuse a correction that would land on an entity
  // owned by a different user. This is precisely the vector that stayed open
  // for agent_grant records created via match_sub+match_iss (no
  // match_thumbprint to pin): PR #2513 (below) refuses a thumbprint
  // collision at write time, but a `correct` targeting the entity_id of an
  // existing match_sub+match_iss grant under a different owner was not
  // checked anywhere until this guard. Runs BEFORE the pin-uniqueness check:
  // ownership answers "is this the writer's entity at all", which must hold
  // before asking whether the write's pin is still unique on it.
  {
    const { data: targetEntity } = await db
      .from("entities")
      .select("user_id")
      .eq("id", params.entity_id)
      .maybeSingle();
    if (targetEntity) {
      assertNoOwnerConflict({
        entityId: params.entity_id,
        entityType: params.entity_type,
        existingOwnerUserId: (targetEntity as { user_id: string | null }).user_id,
        writerUserId: params.user_id,
      });
    }
  }

  // A key thumbprint may be pinned by agent_grants under one owner only.
  // Both correct transports converge here, so this covers REST and MCP:
  // refuse a correction that pins another owner's key, or that returns a
  // grant to active/suspended while another owner holds its pin.
  if (params.entity_type === "agent_grant") {
    const { assertGrantWriteKeepsPinUnique } = await import("./agent_grants.js");
    await assertGrantWriteKeepsPinUnique({
      userId: params.user_id,
      entityType: params.entity_type,
      fields: { [params.field]: params.value },
      entityId: params.entity_id,
    });
  }

  // Instance store-policy enforcement (#1975).
  //
  // Both transports converge here (unlike `store`, whose two cores each need
  // their own call), so this single check covers MCP and REST. Runs before the
  // correction observation row is built, so a denial writes nothing.
  //
  // A correction carries exactly one field, so only the gates that can be
  // judged from a single field apply in practice: entity-type scope and field
  // sensitivity. The person-data gates read fields the correction does not
  // carry and so do not fire here — corrections cannot be used to smuggle in a
  // person-data entity, since the entity itself had to clear the gate at store
  // time.
  {
    const { assertStorePolicyAllows } = await import("./instance_policy.js");
    const { schemaRegistry } = await import("./schema_registry.js");
    await assertStorePolicyAllows(
      [{ entity_type: params.entity_type, fields: { [params.field]: params.value } }],
      async (entityType) => {
        const entry = await schemaRegistry.loadActiveSchema(entityType, params.user_id);
        return entry?.schema_definition ?? null;
      }
    );
  }

  const { entity_id, entity_type, field, value, schema_version, user_id, idempotency_key } = params;

  const observationId = generateObservationId(
    null,
    null,
    entity_id,
    { [field]: value },
    idempotency_key
  );

  const row: Record<string, unknown> = {
    id: observationId,
    entity_id,
    entity_type,
    schema_version,
    source_id: null,
    interpretation_id: null,
    observed_at: new Date().toISOString(),
    specificity_score: 1.0,
    source_priority: 1000,
    fields: { [field]: value },
    user_id,
  };

  if (idempotency_key) {
    row.idempotency_key = idempotency_key;
  }

  const correctionAttribution = getCurrentAttribution();
  if (Object.keys(correctionAttribution).length > 0) {
    row.provenance = correctionAttribution;
  }

  const { error: obsError } = await db.from("observations").insert(row);

  if (obsError) {
    if (obsError.code === "23505") {
      return {
        observation_id: observationId,
        entity_id,
        field,
        value,
        snapshot: null,
      };
    }
    throw new Error(`Failed to create correction: ${obsError.message}`);
  }

  const snapshot = await recomputeSnapshot(entity_id, user_id);
  const snap = (snapshot?.snapshot as Record<string, unknown> | null | undefined) ?? null;
  const emitTs = row.observed_at as string;
  emitObservationCreated({
    user_id,
    entity_id,
    entity_type,
    observation_id: observationId,
    timestamp: emitTs,
    idempotency_key: idempotency_key,
    observation_source: "human",
    source_peer_id: params.source_peer_id,
  });
  emitEntitySnapshotChange({
    user_id,
    entity_id,
    entity_type,
    event_type: "entity.updated",
    timestamp: emitTs,
    observation_id: observationId,
    fields_changed: [field],
    idempotency_key: idempotency_key,
    observation_source: "human",
    source_peer_id: params.source_peer_id,
  });

  return {
    observation_id: observationId,
    entity_id,
    field,
    value,
    snapshot: snap,
  };
}

/**
 * Error thrown when no active or code-defined schema exists for the
 * correction's `entity_type`. Mirrors the MCP `correct()` path, which throws
 * `McpError(InvalidParams, "No active entity schema for entity type: …")`.
 *
 * Carrying a discriminable error class (rather than a bare `Error`) lets the
 * HTTP `/correct` handler map it to a structured envelope identical in shape to
 * the MCP failure, instead of silently coercing the field to "declared".
 */
export class CorrectionSchemaNotFoundError extends Error {
  readonly code = "ERR_NO_SCHEMA_FOR_ENTITY_TYPE";
  readonly entityType: string;
  constructor(entityType: string) {
    super(`No active entity schema for entity type: ${entityType}`);
    this.name = "CorrectionSchemaNotFoundError";
    this.entityType = entityType;
  }
}

/** Result of resolving the schema for a correction target. */
export interface CorrectionSchemaResolution {
  /** Active schema_version to stamp on the correction observation. */
  schemaVersion: string;
  /**
   * `true` when `field` is NOT declared on the resolved schema. The correction
   * is still accepted (append path); the value is preserved on the observation
   * and mirrored to `raw_fragments` but excluded from the snapshot until the
   * field is declared. Issue #1540.
   */
  isUnknownField: boolean;
}

/**
 * Resolve the correction target's schema and determine whether `field` is
 * declared. Single source of truth shared by the MCP `correct()` tool
 * (`src/server.ts`) and the HTTP `/correct` handler (`src/actions.ts`) so the
 * two paths cannot diverge.
 *
 * Contract (identical for both transports):
 * - Loads the active schema, falling back to a code-defined schema entry.
 * - When no schema is found, throws {@link CorrectionSchemaNotFoundError}.
 * - A schema-registry IO failure propagates as a thrown error — it is NEVER
 *   coerced into `isUnknownField: false` ("declared"). Product principle 10.2:
 *   a lookup failure is an error, not a silent "known field" determination.
 *   (Issue #1540 / BLOCKING 2.)
 *
 * `userId` is forwarded to `loadActiveSchema` so user-scoped schemas resolve
 * the same way the store path resolves them.
 */
export async function resolveCorrectionSchema(
  entityType: string,
  field: string,
  userId?: string
): Promise<CorrectionSchemaResolution> {
  const { loadCodeDefinedSchemaEntry, schemaRegistry } = await import("./schema_registry.js");

  // IO failures here propagate intentionally — see contract above.
  const schemaEntry =
    (await schemaRegistry.loadActiveSchema(entityType, userId)) ??
    (await loadCodeDefinedSchemaEntry(entityType));

  if (!schemaEntry) {
    throw new CorrectionSchemaNotFoundError(entityType);
  }

  return {
    schemaVersion: schemaEntry.schema_version,
    isUnknownField: !schemaEntry.schema_definition.fields[field],
  };
}

/**
 * Build the unified `/correct` success payload shared by the MCP tool and the
 * HTTP handler so both transports return an identical shape. The MCP handler
 * wraps this in `buildTextResponse`; the HTTP handler merges its transport-only
 * `success`/`snapshot` fields on top. The shape is declared verbatim in
 * `openapi.yaml` under `CorrectResponse`. (Issue #1540 / BLOCKING 3.)
 */
export function buildCorrectionResponse(params: {
  observation_id: string;
  entity_id: string;
  entity_type: string;
  field: string;
  value: unknown;
  isUnknownField: boolean;
}): Record<string, unknown> {
  const { observation_id, entity_id, entity_type, field, value, isUnknownField } = params;
  if (isUnknownField) {
    return {
      observation_id,
      entity_id,
      field,
      value,
      unknown_field: true,
      message:
        `Correction recorded for undeclared field "${field}" on ${entity_type}. ` +
        "The value is preserved on the observation and in raw_fragments, but is " +
        "excluded from the entity snapshot until the field is added to the schema.",
      hint:
        "Field is not declared on this entity type's schema. Use describe_entity_type " +
        "to see declared fields. To surface this value in the snapshot, add the field " +
        "via register_schema (or update_schema_incremental when the schema declares " +
        "canonical_name_fields).",
      details: { entity_type, field },
    };
  }
  return {
    observation_id,
    entity_id,
    field,
    value,
    message: "Correction applied with priority 1000",
  };
}
