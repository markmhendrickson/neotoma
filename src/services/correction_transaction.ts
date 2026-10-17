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
import {
  parseNativeTransitionRequest,
  type NativeTransitionRequest,
} from "./native_transition_request.js";
import { NativeProjectionError } from "./native_transition_projection.js";
import { StoreConditionError } from "./store_condition_keys.js";

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
      | "SNAPSHOT_MISMATCH"
      | "NATIVE_DEPENDENCY_UNAVAILABLE",
    message: string,
    public readonly details?: {
      dependency: string;
      repair_hint: string;
      observed_lower_bound?: number;
      limit?: number;
    }
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
export async function applyCorrectionTransaction(
  options: CorrectionTransactionOptions | NativeTransitionRequest,
  authenticatedUserId?: string
) {
  if (options && Object.hasOwn(options, "protocol")) {
    let native: NativeTransitionRequest;
    try {
      native = parseNativeTransitionRequest(options);
    } catch (error) {
      if (error instanceof NativeProjectionError || error instanceof StoreConditionError)
        throw new CorrectionTransactionError("VALIDATION_ERROR", error.message);
      throw error;
    }
    if (!authenticatedUserId?.trim())
      throw new CorrectionTransactionError("VALIDATION_ERROR", "Authenticated scope is required.");
    // Each addressed selector ID is a lower bound on the complete acquisition.
    // Shared entity/edge/slot IDs count once; registry names are not entity IDs.
    // Passing this check grants no read authority and does not bound hidden
    // endpoints/history: the final acquisition must enforce the same limit.
    const readIds = new Set<string>();
    for (const { selector } of native.expected.groups) {
      if ("entity" in selector) readIds.add(selector.entity.entity_id);
      else if ("edges" in selector) readIds.add(selector.edges.entity_id);
      else if ("slot" in selector) readIds.add(selector.slot.target_id);
      if (readIds.size > 256)
        throw new CorrectionTransactionError(
          "NATIVE_DEPENDENCY_UNAVAILABLE",
          "The declared native read IDs exceed the complete acquisition bound.",
          {
            dependency: "complete_readset_bound",
            observed_lower_bound: readIds.size,
            limit: 256,
            repair_hint:
              "Reduce the scoped readset through its owning admitted mechanism; never truncate acquisition.",
          }
        );
    }
    const connection = await getDb();
    return connection.transaction(async () => {
      // Structural parsing is not principal/origin admission. Current auth
      // context has no native binding/original-authority acquisition. Do not
      // turn a grant label, user_id, schema hash or synthetic fixture into one.
      // This native branch remains incomplete until that acquisition and the
      // complete readset/effect/reducer path are implemented here.
      const count = native.expected.groups
        .filter((g) => !("registry" in g.selector))
        .reduce((sum, g) => sum + g.count, 0);
      if (count > 4096)
        throw new CorrectionTransactionError(
          "NATIVE_DEPENDENCY_UNAVAILABLE",
          "The complete native readset exceeds the supported row bound.",
          {
            dependency: "complete_readset_bound",
            repair_hint:
              "Reduce the scoped history through its owning admitted mechanism; never truncate the readset.",
          }
        );
      throw new CorrectionTransactionError(
        "NATIVE_DEPENDENCY_UNAVAILABLE",
        "Native principal binding and admitted authority acquisition are not available.",
        {
          dependency: "native_principal_binding_resolution",
          repair_hint:
            "Complete verified native principal-binding, historical authority, registry and readset integration before retrying. Do not fall back to ordinary corrections.",
        }
      );
    });
  }
  const ordinary = options as CorrectionTransactionOptions;
  return applyOrdinaryCorrectionTransaction(ordinary);
}
async function applyOrdinaryCorrectionTransaction(options: CorrectionTransactionOptions) {
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
        const current = await getEntityWithProvenance(entity.entity_id, false, options.user_id, {
          includeClearedFields: true,
        });
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
      // Preserve the established cheap refusal before stricter nullable
      // acquisition: a stale count/type is already a conflict, even when an
      // unrelated active-schema dependency is unavailable.
      const baseline = await getEntityWithProvenance(entity.entity_id, false, options.user_id);
      if (!baseline || baseline.entity_id !== entity.entity_id)
        throw new CorrectionTransactionError(
          "RESOURCE_NOT_FOUND",
          "Transaction entity not found in the authenticated graph."
        );
      if (
        baseline.entity_type !== entity.entity_type ||
        baseline.observation_count !== entity.expected_observation_count
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
      const current = await getEntityWithProvenance(entity.entity_id, false, options.user_id, {
        includeClearedFields: true,
      });
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
          in_transaction: true,
          deferred_events: notifications,
        });
    const snapshots = [];
    for (const { entity } of prepared) {
      const current = await getEntityWithProvenance(entity.entity_id, false, options.user_id, {
        includeClearedFields: true,
      });
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
