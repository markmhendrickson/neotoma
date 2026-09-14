/** Atomic compare-and-correct; business transitions belong to consuming apps. */
import { createHash } from "node:crypto";
import { db } from "../db.js";
import { getDb } from "../repositories/db/connection.js";
import { createCorrection } from "./correction.js";
import { validateChangesAgainstSchema } from "./batch_correction.js";
import { getEntityWithProvenance } from "./entity_queries.js";
import { schemaRegistry } from "./schema_registry.js";
import { enforceAgentCapability, contextFromAgentIdentity } from "./agent_capabilities.js";
import { getCurrentAgentIdentity } from "./request_context.js";

export interface CorrectionTransactionEntity {
  entity_id: string;
  entity_type: string;
  expected_observation_count: number;
  expected_snapshot: Record<string, unknown>;
  changes: { field: string; value: unknown }[];
}
export interface CorrectionTransactionOptions {
  user_id: string;
  idempotency_key: string;
  entities: CorrectionTransactionEntity[];
}
export class CorrectionTransactionError extends Error {
  constructor(
    public readonly code:
      | "VALIDATION_ERROR"
      | "RESOURCE_NOT_FOUND"
      | "CONFLICT"
      | "IDEMPOTENCY_CONFLICT"
      | "SNAPSHOT_MISMATCH",
    message: string
  ) {
    super(message);
  }
}
function canonical(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  throw new CorrectionTransactionError(
    "VALIDATION_ERROR",
    "Transaction values must be finite JSON values."
  );
}
function assertValid(options: CorrectionTransactionOptions) {
  if (
    !options ||
    Object.keys(options).some((key) => !["user_id", "idempotency_key", "entities"].includes(key))
  )
    throw new CorrectionTransactionError("VALIDATION_ERROR", "Unexpected transaction property.");
  if (
    !options.user_id ||
    typeof options.idempotency_key !== "string" ||
    !options.idempotency_key.trim() ||
    options.idempotency_key.length > 200 ||
    !Array.isArray(options.entities) ||
    !options.entities.length ||
    options.entities.length > 50
  )
    throw new CorrectionTransactionError(
      "VALIDATION_ERROR",
      "A scoped idempotency key and 1–50 entities are required."
    );
  const ids = new Set<string>();
  for (const entity of options.entities) {
    if (
      !entity ||
      typeof entity.entity_id !== "string" ||
      !entity.entity_id ||
      typeof entity.entity_type !== "string" ||
      !entity.entity_type ||
      ids.has(entity.entity_id) ||
      !Number.isSafeInteger(entity.expected_observation_count) ||
      entity.expected_observation_count < 0 ||
      !entity.expected_snapshot ||
      Array.isArray(entity.expected_snapshot) ||
      typeof entity.expected_snapshot !== "object" ||
      !Array.isArray(entity.changes) ||
      !entity.changes.length ||
      entity.changes.length > 50
    )
      throw new CorrectionTransactionError(
        "VALIDATION_ERROR",
        "Each unique entity requires its type, observed count, expected snapshot fields and 1–50 changes."
      );
    if (
      Object.keys(entity).some(
        (key) =>
          ![
            "entity_id",
            "entity_type",
            "expected_observation_count",
            "expected_snapshot",
            "changes",
          ].includes(key)
      )
    )
      throw new CorrectionTransactionError(
        "VALIDATION_ERROR",
        "Unexpected entity transaction property."
      );
    ids.add(entity.entity_id);
    const names = new Set<string>();
    for (const change of entity.changes) {
      if (
        !change ||
        Object.keys(change).some((key) => !["field", "value"].includes(key)) ||
        typeof change.field !== "string" ||
        !change.field ||
        names.has(change.field)
      )
        throw new CorrectionTransactionError(
          "VALIDATION_ERROR",
          "Correction fields must be unique nonempty names."
        );
      names.add(change.field);
    }
  }
  canonical(options);
}
export async function applyCorrectionTransaction(options: CorrectionTransactionOptions) {
  assertValid(options);
  const capabilityContext = contextFromAgentIdentity(getCurrentAgentIdentity());
  if (capabilityContext)
    enforceAgentCapability(
      "correct",
      options.entities.map((entity) => entity.entity_type),
      capabilityContext
    );
  const entities = options.entities
    .map((entity) => ({
      ...entity,
      changes: [...entity.changes].sort((a, b) => a.field.localeCompare(b.field)),
    }))
    .sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  const hash = createHash("sha256")
    .update(canonical({ ...options, entities }))
    .digest("hex");
  const receiptKey =
    "correction-transaction:" +
    createHash("sha256")
      .update(canonical([options.user_id, options.idempotency_key]))
      .digest("hex");
  const notifications: Array<() => void> = [];
  const connection = await getDb();
  const result = await connection.transaction(async () => {
    const prior = await db
      .from("observations")
      .select("id,canonical_hash,entity_id,fields")
      .eq("user_id", options.user_id)
      .eq("idempotency_key", receiptKey);
    if (prior.error) throw new Error("Could not read transaction receipt.");
    if (prior.data?.length) {
      if (
        prior.data.length !== entities.reduce((n, e) => n + e.changes.length, 0) ||
        prior.data.some((row: { canonical_hash?: string }) => row.canonical_hash !== hash)
      )
        throw new CorrectionTransactionError(
          "IDEMPOTENCY_CONFLICT",
          "Idempotency key already belongs to another transaction payload."
        );
      const snapshots = [];
      for (const entity of entities) {
        const current = await getEntityWithProvenance(entity.entity_id, false, options.user_id);
        if (!current || current.entity_id !== entity.entity_id)
          throw new CorrectionTransactionError(
            "CONFLICT",
            "A previously committed transaction target is no longer available."
          );
        snapshots.push(current);
      }
      return { status: "replayed" as const, entities: snapshots };
    }
    // All reads/checks run inside BEGIN IMMEDIATE on the existing driver. The
    // observation count catches concurrent writes even with equal timestamps.
    const prepared = [];
    for (const entity of entities) {
      const current = await getEntityWithProvenance(entity.entity_id, false, options.user_id);
      if (!current || current.entity_id !== entity.entity_id)
        throw new CorrectionTransactionError(
          "RESOURCE_NOT_FOUND",
          "Transaction entity not found in the authenticated graph."
        );
      if (
        current.entity_type !== entity.entity_type ||
        current.observation_count !== entity.expected_observation_count ||
        Object.entries(entity.expected_snapshot).some(
          ([field, value]) =>
            !Object.hasOwn(current.snapshot ?? {}, field) ||
            canonical((current.snapshot as Record<string, unknown>)[field]) !== canonical(value)
        )
      )
        throw new CorrectionTransactionError(
          "CONFLICT",
          "Transaction precondition no longer matches the stored entity."
        );
      const schema = await schemaRegistry.loadActiveSchema(entity.entity_type, options.user_id);
      if (
        !schema ||
        entity.changes.some(
          (change) => !Object.hasOwn(schema.schema_definition.fields, change.field)
        ) ||
        validateChangesAgainstSchema(entity.changes, schema).length
      )
        throw new CorrectionTransactionError(
          "VALIDATION_ERROR",
          "Transaction fields must be declared and valid in the active schema."
        );
      prepared.push({ entity, schema });
    }
    for (const { entity, schema } of prepared)
      for (const change of entity.changes)
        await createCorrection({
          entity_id: entity.entity_id,
          entity_type: entity.entity_type,
          user_id: options.user_id,
          schema_version: schema.schema_version,
          field: change.field,
          value: change.value,
          idempotency_key: receiptKey,
          canonical_hash: hash,
          deferred_events: notifications,
        });
    const snapshots = [];
    for (const { entity } of prepared) {
      const current = await getEntityWithProvenance(entity.entity_id, false, options.user_id);
      if (
        !current ||
        entity.changes.some(
          ({ field, value }) =>
            !Object.hasOwn(current.snapshot ?? {}, field) ||
            canonical((current.snapshot as Record<string, unknown>)[field]) !== canonical(value)
        )
      )
        throw new CorrectionTransactionError(
          "SNAPSHOT_MISMATCH",
          "Correction observations did not produce the requested snapshots; transaction rolled back."
        );
      snapshots.push(current);
    }
    return { status: "applied" as const, entities: snapshots };
  });
  for (const notify of notifications) notify();
  return result;
}
