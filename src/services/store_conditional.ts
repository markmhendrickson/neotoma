/** One declared entity, one authoritative transaction, and an immutable operation receipt. */
import { db } from "../db.js";
import { getDb } from "../repositories/db/connection.js";
import { schemaRegistry, type SchemaRegistryEntry } from "./schema_registry.js";
import { deriveConditionalStoreIdentity } from "./store_condition_identity.js";
import { assertConditionalStoreRequest } from "./store_condition_request.js";
import {
  assertConditionalEntityAbsent,
  canonicalStoreRequest,
  commitConditionalStoreKey,
  storeConditionRequestHash,
  StoreConditionError,
  type ConditionalOperationReceipt,
} from "./store_condition_keys.js";
import {
  getCurrentAttribution,
  getCurrentAgentIdentity,
  getCurrentAAuthAdmission,
} from "./request_context.js";
import { enforceAttributionPolicy } from "./attribution_policy.js";
import { assertStorePolicyAllows } from "./instance_policy.js";
import { collectConstraintViolations, ConstraintViolationError } from "./field_constraints.js";
import { assertAgentGrantFieldValid, assertGrantWriteKeepsPinUnique } from "./agent_grants.js";
import { assertCanWriteProtected } from "./protected_entity_types.js";
import { enforceOverridePolicy } from "./override_validation.js";
import { storeRawContent } from "./raw_storage.js";
import { createObservation, DEFAULT_OBSERVATION_SOURCE } from "./observation_storage.js";
import { generateObservationId } from "./observation_identity.js";
import { observationReducer, type Observation } from "../reducers/observation_reducer.js";
import { storeFragment } from "./raw_fragments.js";
import { upsertTimelineEventsForEntitySnapshot } from "./timeline_events.js";
import {
  emitObservationCreated,
  emitEntitySnapshotChange,
} from "../events/substrate_store_emit.js";
import type { ObservationSource } from "../shared/action_schemas.js";

export interface ConditionalStoreOptions {
  userId: string;
  entities: Record<string, unknown>[];
  idempotencyKey: string;
  sourcePriority: number;
  observationSource?: ObservationSource;
  originalFilename?: string;
  strict?: boolean;
}

export async function storeConditionalStructured(options: ConditionalStoreOptions) {
  assertConditionalStoreRequest({
    entities: options.entities,
    idempotency_key: options.idempotencyKey,
    expected_entity_absent: true,
  });
  const entity = options.entities[0];
  const entityType = entity.entity_type as string;
  const fields = { ...entity };
  delete fields.entity_type;
  const actor = { ...(getCurrentAttribution() ?? {}) } as Record<string, unknown>;
  delete actor.attributed_at;
  const observationSource = options.observationSource ?? DEFAULT_OBSERVATION_SOURCE;
  const filename = options.originalFilename?.trim() || null;
  const request = {
    owner: options.userId,
    entity,
    expected_entity_absent: true,
    actor,
    source_priority: options.sourcePriority,
    observation_source: observationSource,
    original_filename: filename,
    strict: options.strict === true,
    commit: true,
  };
  let schema!: SchemaRegistryEntry;
  let prepared!: ReturnType<typeof deriveConditionalStoreIdentity>;
  let schemaDigest = "";
  const callbacks: Array<() => Promise<void>> = [];
  let uploadAttempted = false;
  async function verify(original: ConditionalOperationReceipt) {
    const { data: row, error } = await db
      .from("observations")
      .select("*")
      .eq("id", original.observation_id)
      .eq("user_id", options.userId)
      .maybeSingle();
    const marker = row?.provenance?.store_operation_receipt;
    if (
      error ||
      !row ||
      row.source_id !== original.source_id ||
      row.entity_id !== original.entity_id ||
      row.entity_type !== original.entity_type ||
      row.canonical_hash !== original.request_fingerprint ||
      canonicalStoreRequest(marker ?? null) !== canonicalStoreRequest(original) ||
      storeConditionRequestHash(row.fields) !== original.diagnostics.fields_sha256
    )
      throw new StoreConditionError(
        "STORE_RECEIPT_UNCERTAIN",
        "The original conditional observation is unverifiable."
      );
    const { data: source, error: sourceError } = await db
      .from("sources")
      .select("id,user_id")
      .eq("id", original.source_id)
      .eq("user_id", options.userId)
      .maybeSingle();
    const { data: target, error: targetError } = await db
      .from("entities")
      .select("id,user_id,entity_type")
      .eq("id", original.entity_id)
      .eq("user_id", options.userId)
      .maybeSingle();
    if (
      sourceError ||
      targetError ||
      !source ||
      !target ||
      target.entity_type !== original.entity_type
    )
      throw new StoreConditionError(
        "STORE_RECEIPT_UNCERTAIN",
        "The original conditional identity is unverifiable."
      );
  }
  let operation: ConditionalOperationReceipt;
  try {
    operation = await commitConditionalStoreKey(await getDb(), {
      owner: options.userId,
      key: options.idempotencyKey,
      request,
      beforeClaim: async (tx) => {
        schema = await schemaRegistry.loadActiveSchemaInTransaction(tx, entityType, options.userId);
        prepared = deriveConditionalStoreIdentity(schema, fields, options.userId);
        schemaDigest = storeConditionRequestHash({
          id: schema.id,
          version: schema.schema_version,
          definition: schema.schema_definition,
          reducer: schema.reducer_config,
        });
        await assertStorePolicyAllows(
          [{ entity_type: entityType, fields }],
          async () => schema.schema_definition
        );
        for (const table of ["sources", "observations", "timeline_events"] as const)
          enforceAttributionPolicy(table, getCurrentAgentIdentity());
        assertCanWriteProtected({
          entity_type: entityType,
          op: "store",
          identity: getCurrentAgentIdentity(),
          admission: getCurrentAAuthAdmission(),
        });
        for (const [field, value] of Object.entries(prepared.validFields))
          assertAgentGrantFieldValid(entityType, field, value);
        await enforceOverridePolicy({
          entityType,
          entityId: prepared.entityId,
          fields: prepared.validFields,
          identity: getCurrentAgentIdentity(),
          admission: getCurrentAAuthAdmission(),
          userId: options.userId,
          db,
        });
        if (entityType === "agent_grant")
          await assertGrantWriteKeepsPinUnique({
            userId: options.userId,
            entityType,
            fields: prepared.validFields,
            entityId: prepared.entityId,
          });
        const violations = collectConstraintViolations(
          prepared.validFields,
          schema.schema_definition.fields
        );
        if (
          violations.length &&
          (schema.schema_definition.constraint_violation_policy ?? "reject") === "reject"
        )
          throw new ConstraintViolationError(violations);
        await assertConditionalEntityAbsent(tx, {
          owner: options.userId,
          entityId: prepared.entityId,
          entityType,
        });
      },
      apply: async (_tx, fingerprint, observationKey) => {
        uploadAttempted = true;
        const source = await storeRawContent({
          userId: options.userId,
          fileBuffer: Buffer.from(JSON.stringify(options.entities)),
          mimeType: "application/json",
          originalFilename: filename ?? undefined,
          idempotencyKey: options.idempotencyKey,
          provenance: {
            upload_method: "api_store",
            client: "api",
            source_priority: options.sourcePriority,
          },
        });
        const now = new Date().toISOString();
        const inserted = await db.from("entities").insert({
          id: prepared.entityId,
          entity_type: entityType,
          canonical_name: prepared.canonicalName,
          aliases: [],
          user_id: options.userId,
          created_at: now,
          updated_at: now,
        });
        if (inserted.error) throw new Error("Conditional entity insertion failed.");
        const original: ConditionalOperationReceipt = {
          version: 1,
          status: "applied",
          request_fingerprint: fingerprint,
          source_id: source.sourceId,
          entity_id: prepared.entityId,
          entity_type: entityType,
          observation_id: generateObservationId(
            source.sourceId,
            null,
            prepared.entityId,
            prepared.validFields,
            observationKey
          ),
          schema_identity_digest: schemaDigest,
          unknown_fields_count: Object.values(prepared.unknownFields).filter((x) => x != null)
            .length,
          diagnostics: {
            fields_sha256: storeConditionRequestHash(prepared.validFields),
            schema_version: schema.schema_version,
            unknown_fields: Object.keys(prepared.unknownFields).sort(),
            constraint_warnings: collectConstraintViolations(
              prepared.validFields,
              schema.schema_definition.fields
            ).map((v) => ({ field: v.field, constraint: v.constraint })),
          },
        };
        await createObservation({
          entity_id: prepared.entityId,
          entity_type: entityType,
          schema_version: schema.schema_version,
          source_id: source.sourceId,
          interpretation_id: null,
          observed_at: now,
          specificity_score: 1,
          source_priority: options.sourcePriority,
          observation_source: observationSource,
          fields: prepared.validFields,
          user_id: options.userId,
          idempotency_key: observationKey,
          identity_basis: "schema_rule",
          identity_rule: prepared.identityRule,
          operation_receipt: { fingerprint, receipt: original },
        });
        for (const [key, value] of Object.entries(prepared.unknownFields))
          await storeFragment({
            sourceId: source.sourceId,
            userId: options.userId,
            entityId: prepared.entityId,
            entityType,
            schemaVersion: schema.schema_version,
            key,
            value,
            reason: "unknown_field",
            transactionEffects: callbacks,
          });
        for (const [key, value] of Object.entries(prepared.originalValues))
          await storeFragment({
            sourceId: source.sourceId,
            userId: options.userId,
            entityId: prepared.entityId,
            entityType,
            schemaVersion: schema.schema_version,
            key,
            value,
            convertedTo: prepared.validFields[key],
            reason: "converted_value_original",
            transactionEffects: callbacks,
          });
        const loaded = await db
          .from("observations")
          .select("*")
          .eq("entity_id", prepared.entityId)
          .eq("user_id", options.userId);
        if (loaded.error || loaded.data?.length !== 1)
          throw new Error("Conditional observation readback failed.");
        const computed = await observationReducer.computeSnapshot(
          prepared.entityId,
          loaded.data as Observation[],
          schema
        );
        if (!computed || computed.observation_count !== 1)
          throw new Error("Conditional snapshot computation failed.");
        const saved = await db.from("entity_snapshots").upsert({ ...computed });
        if (saved.error) throw new Error("Conditional snapshot persistence failed.");
        const readback = await db
          .from("entity_snapshots")
          .select("*")
          .eq("entity_id", prepared.entityId)
          .eq("user_id", options.userId)
          .single();
        if (
          readback.error ||
          !readback.data ||
          canonicalStoreRequest(readback.data.snapshot) !==
            canonicalStoreRequest(computed.snapshot) ||
          Object.keys(computed.snapshot).some(
            (key) => readback.data.provenance[key] !== original.observation_id
          )
        )
          throw new Error("Conditional snapshot readback failed.");
        await upsertTimelineEventsForEntitySnapshot({
          entityType,
          entityId: prepared.entityId,
          sourceId: source.sourceId,
          userId: options.userId,
          snapshot: computed.snapshot,
          sameTypeInSourceBatch: 2,
          schema: schema.schema_definition,
          strictPersistence: true,
        });
        callbacks.push(async () => {
          emitObservationCreated({
            user_id: options.userId,
            entity_id: prepared.entityId,
            entity_type: entityType,
            observation_id: original.observation_id,
            timestamp: now,
            source_id: source.sourceId,
            idempotency_key: observationKey,
            observation_source: observationSource,
          });
        });
        callbacks.push(async () => {
          emitEntitySnapshotChange({
            user_id: options.userId,
            entity_id: prepared.entityId,
            entity_type: entityType,
            event_type: "entity.created",
            observation_id: original.observation_id,
            timestamp: now,
            source_id: source.sourceId,
            fields_changed: Object.keys(computed.snapshot),
            idempotency_key: observationKey,
            observation_source: observationSource,
          });
        });
        return original;
      },
      verify: async (_tx, original) => verify(original),
    });
  } catch (error) {
    if (uploadAttempted && error && typeof error === "object")
      Object.assign(error, { committed: false, private_storage_residue_possible: true });
    throw error;
  }
  let failed = 0;
  for (const callback of callbacks) {
    try {
      await callback();
    } catch {
      failed++;
    }
  }
  const current = await db
    .from("entity_snapshots")
    .select("snapshot")
    .eq("entity_id", operation.entity_id)
    .eq("user_id", options.userId)
    .maybeSingle();
  return {
    success: true,
    replayed: operation.status === "replayed",
    source_id: operation.source_id,
    entities_created: operation.status === "applied" ? 1 : 0,
    observations_created: operation.status === "applied" ? 1 : 0,
    unknown_fields_count: operation.unknown_fields_count,
    operation_receipt: operation,
    postcommit_notifications: {
      attempted: callbacks.length,
      failed,
      status: failed ? "uncertain" : operation.status === "replayed" ? "not_repeated" : "completed",
    },
    entities: [
      {
        entity_id: operation.entity_id,
        entity_type: operation.entity_type,
        observation_id: operation.observation_id,
        entity_snapshot_after: current.error ? null : (current.data?.snapshot ?? null),
        deduplicated: operation.status === "replayed",
      },
    ],
  };
}
