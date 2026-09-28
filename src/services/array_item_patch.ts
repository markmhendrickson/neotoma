/**
 * Atomic keyed-item patch for structured array fields (Waxwing ADR,
 * ent_4b41bb83a4faf4428a73bfc8 — "Prevent lost updates when concurrent
 * sessions refresh session_digest workboards").
 *
 * Why this exists:
 *   `correct` and `store` both replace a whole field with a caller-supplied
 *   value. For a structured collection field (e.g. `session_digest.
 *   tasks_claimed`), the natural caller pattern is read-modify-full-array-
 *   write: load the snapshot, mutate one row locally, write the whole array
 *   back. Two concurrent writers doing this to *disjoint* rows race: the
 *   second writer's full-array write silently discards the first writer's
 *   row even though neither writer's read-modify-write step was individually
 *   wrong — both calls report success. `patchArrayItem` closes that race by
 *   doing the read-modify-write server-side, atomically, scoped to one row:
 *   load the current array fresh, find/replace by `key_field`, write the
 *   reconciled array as a single new observation. Concurrent patches to
 *   different keys both survive (each is its own read-modify-write against
 *   the latest state at write time); a same-key race is resolved by
 *   `merge_array_by_key`'s latest-observed_at-wins semantics, or refused as a
 *   conflict when the caller supplies `expected_item_version`.
 *
 * Relationship to entity CAS: `/correct`'s opaque `entity_version` is
 *   entity-scoped (any field changed since load → conflict). This module
 *   reuses the same `stableSerialize` primitive to compute
 *   a content-hash `expected_item_version` scoped to ONE array item, so two
 *   writers touching different rows never spuriously conflict — the actual
 *   gap `applyBatchCorrection` cannot close for this access pattern.
 *
 * Append-only: like `createCorrection`, this never rewrites history. The
 * reconciled array is written as one new priority-1000 observation; prior
 * observations are untouched.
 */
import { createHash } from "node:crypto";
import { getDb } from "../repositories/db/connection.js";
import {
  createCorrection,
  emitCommittedCorrection,
  findCommittedCorrectionReplay,
} from "./correction.js";
import { getEntityWithProvenance } from "./entity_queries.js";
import { loadCodeDefinedSchemaEntry, schemaRegistry } from "./schema_registry.js";
import { canonicalizePortableScalarKey, stableSerialize } from "./stable_serialize.js";

/**
 * Thrown when a `patch_array_item` call's `key_field` does not match the
 * field's declared `merge_array_by_key` `key_field` on the active schema.
 * Client input error (400), not a server fault: without this check, the
 * write would locate/update a row by the WRONG identity here while the
 * reducer's `mergeArrayByKey` (which always reads the schema's declared
 * key_field) reconciles by the correct one, silently duplicating the row in
 * the snapshot instead of updating it in place.
 */
export class ArrayItemKeyFieldMismatchError extends Error {
  readonly code = "ERR_ARRAY_ITEM_KEY_FIELD_MISMATCH";
  readonly statusCode = 400;
  readonly field: string;
  readonly declaredKeyField: string;
  readonly suppliedKeyField: string;

  constructor(params: {
    entityType: string;
    field: string;
    declaredKeyField: string;
    suppliedKeyField: string;
  }) {
    super(
      `key_field mismatch for ${params.entityType}.${params.field}: schema declares ` +
        `merge_array_by_key key_field "${params.declaredKeyField}", but this patch was ` +
        `called with key_field "${params.suppliedKeyField}". Use the schema's declared ` +
        `key_field so this patch is reconciled as an in-place update rather than a ` +
        `distinct row by the reducer.`
    );
    this.name = "ArrayItemKeyFieldMismatchError";
    this.field = params.field;
    this.declaredKeyField = params.declaredKeyField;
    this.suppliedKeyField = params.suppliedKeyField;
  }

  toErrorEnvelope(): {
    code: string;
    message: string;
    field: string;
    declared_key_field: string;
    supplied_key_field: string;
  } {
    return {
      code: this.code,
      message: this.message,
      field: this.field,
      declared_key_field: this.declaredKeyField,
      supplied_key_field: this.suppliedKeyField,
    };
  }
}

/**
 * Raised when a caller asks for keyed patch semantics on a field whose active
 * schema does not declare the matching `merge_array_by_key` policy. The
 * operation must fail closed here: without that reducer declaration, writing
 * a reconciled whole array would fall back to ordinary last-write semantics
 * and reintroduce the lost-update behavior this surface promises to prevent.
 */
export class ArrayItemPolicyRequiredError extends Error {
  readonly code = "ERR_ARRAY_ITEM_POLICY_REQUIRED";
  readonly statusCode = 400;
  readonly entityType: string;
  readonly field: string;
  readonly suppliedKeyField: string;

  constructor(params: { entityType: string; field: string; suppliedKeyField: string }) {
    super(
      `Cannot patch ${params.entityType}.${params.field} by key: the active schema must ` +
        `declare merge_policies.${params.field}.strategy "merge_array_by_key" with ` +
        `key_field "${params.suppliedKeyField}".`
    );
    this.name = "ArrayItemPolicyRequiredError";
    this.entityType = params.entityType;
    this.field = params.field;
    this.suppliedKeyField = params.suppliedKeyField;
  }

  toErrorEnvelope(): {
    code: string;
    message: string;
    entity_type: string;
    field: string;
    supplied_key_field: string;
    hint: string;
  } {
    return {
      code: this.code,
      message: this.message,
      entity_type: this.entityType,
      field: this.field,
      supplied_key_field: this.suppliedKeyField,
      hint: "Register or update the field with strategy merge_array_by_key and its stable key_field before retrying.",
    };
  }
}

/**
 * Caller-supplied entity_type is retained for cross-surface parity with
 * `correct`, but it is never authoritative. Reject a mismatch explicitly so
 * capability/protected-type checks cannot be evaluated against a weaker type
 * than the entity actually has.
 */
export class ArrayItemEntityTypeMismatchError extends Error {
  readonly code = "ERR_ARRAY_ITEM_ENTITY_TYPE_MISMATCH";
  readonly statusCode = 400;
  readonly suppliedEntityType: string;
  readonly actualEntityType: string;

  constructor(params: { suppliedEntityType: string; actualEntityType: string }) {
    super(
      `entity_type mismatch: request supplied "${params.suppliedEntityType}" but the target ` +
        `entity is "${params.actualEntityType}".`
    );
    this.name = "ArrayItemEntityTypeMismatchError";
    this.suppliedEntityType = params.suppliedEntityType;
    this.actualEntityType = params.actualEntityType;
  }

  toErrorEnvelope(): {
    code: string;
    message: string;
    supplied_entity_type: string;
    actual_entity_type: string;
  } {
    return {
      code: this.code,
      message: this.message,
      supplied_entity_type: this.suppliedEntityType,
      actual_entity_type: this.actualEntityType,
    };
  }
}

export interface ArrayItemPatchOptions {
  entity_id: string;
  entity_type?: string;
  user_id: string;
  field: string;
  key_field: string;
  key_value: unknown;
  /** Item fields to set/merge for the row identified by key_value. */
  item: Record<string, unknown>;
  /**
   * Content-hash version of the item the caller last observed, as returned
   * by a prior patch/read. When supplied and the stored item's current
   * content hash differs, the patch is refused with a conflict instead of
   * overwriting. Omit to always last-write-win on that single row (still
   * scoped — it never touches other keys).
   */
  expected_item_version?: string | null;
  /** Refuse if the keyed item already exists; race-safe create semantics. */
  expected_item_absent?: boolean;
  idempotency_key: string;
  /** @internal rollback fault injection for publication tests. */
  before_commit?: () => void | Promise<void>;
}

export type ArrayItemPatchStatus = "applied" | "conflict";

export interface ArrayItemPatchConflict {
  /** Content hash of the item as currently stored (recompute a fresh patch from this). */
  current_item: Record<string, unknown> | null;
  current_item_version: string | null;
  expected_item_version: string | null;
}

export interface ArrayItemPatchResult {
  status: ArrayItemPatchStatus;
  entity_id: string;
  entity_type: string;
  field: string;
  key_field: string;
  key_value: unknown;
  observation_id?: string;
  item?: Record<string, unknown>;
  item_version?: string;
  array_length?: number;
  conflict?: ArrayItemPatchConflict;
  snapshot?: Record<string, unknown> | null;
  replayed?: boolean;
}

/** Deterministic content-hash version token for one array item. Reuses the
 * same stable-serialization primitive `batch_correction.ts` uses for its
 * whole-snapshot diff, scoped here to a single item so two writers touching
 * different keys never collide on the same version token. */
export function computeItemVersion(item: unknown): string {
  return createHash("sha256").update(stableSerialize(item)).digest("hex");
}

function keyMatches(item: unknown, keyField: string, keyValue: unknown): boolean {
  if (item === null || typeof item !== "object" || Array.isArray(item)) return false;
  const candidate = (item as Record<string, unknown>)[keyField];
  const candidateKey = canonicalizePortableScalarKey(candidate);
  const requestedKey = canonicalizePortableScalarKey(keyValue);
  return candidateKey !== null && candidateKey === requestedKey;
}

function patchIdempotencyPayload(options: ArrayItemPatchOptions): Record<string, unknown> {
  return {
    entity_id: options.entity_id,
    entity_type: options.entity_type ?? null,
    field: options.field,
    key_field: options.key_field,
    key_value: options.key_value,
    item: options.item,
    expected_item_version: options.expected_item_version ?? null,
    expected_item_absent: options.expected_item_absent ?? false,
  };
}

export async function loadArrayItemPatchTarget(params: {
  entityId: string;
  userId: string;
  suppliedEntityType?: string;
}): Promise<{ entity_type: string }> {
  const current = await getEntityWithProvenance(params.entityId, false, params.userId);
  if (!current) throw new Error(`Entity not found: ${params.entityId}`);
  if (params.suppliedEntityType && params.suppliedEntityType !== current.entity_type) {
    throw new ArrayItemEntityTypeMismatchError({
      suppliedEntityType: params.suppliedEntityType,
      actualEntityType: current.entity_type,
    });
  }
  return { entity_type: current.entity_type };
}

/**
 * Apply an atomic keyed patch to one item of a structured array field.
 *
 * Flow:
 *   1. Load the current entity + snapshot (fresh read; closes the TOCTOU
 *      window a caller-side read-modify-write would leave open).
 *   2. Locate the array and the item matching `key_field`/`key_value`.
 *   3. If `expected_item_version` is supplied and does not match the current
 *      item's content hash, return a conflict — write nothing.
 *   4. Otherwise merge `item` fields onto the existing item (or append a new
 *      item when the key is not yet present), and write the whole reconciled
 *      array as one new correction observation via the existing
 *      `createCorrection` primitive (so it participates in
 *      `merge_array_by_key` priority-gating exactly like an ordinary
 *      correction).
 *
 * Authorization: `getEntityWithProvenance`'s userId param scopes the read to
 * entities owned by the caller (fails closed on its own, per neotoma#2229 —
 * this is a library entrance, not a route). `createCorrection` re-checks
 * ownership before writing.
 */
export async function patchArrayItem(
  options: ArrayItemPatchOptions
): Promise<ArrayItemPatchResult> {
  const database = await getDb();

  // BEGIN IMMEDIATE / write transaction serializes the fresh read, version
  // comparison, and observation insert. Without this boundary two same-key
  // writers holding the same valid version can both pass the check before
  // either inserts, which is conflict detection in name only. Queries made
  // through the shared `db` handle inside this callback join this transaction
  // via the driver's AsyncLocalStorage routing.
  const result = await database.transaction(async () => {
    const { entity_id, user_id, field, key_field, key_value, item, expected_item_version } =
      options;

    const replay = await findCommittedCorrectionReplay({
      entity_id,
      entity_type: options.entity_type ?? "unknown",
      user_id,
      field,
      value: null,
      schema_version: "1.0",
      idempotency_key: options.idempotency_key,
      idempotency_operation: "patch_array_item",
      idempotency_payload: patchIdempotencyPayload(options),
    });
    if (replay) {
      const replayArray = Array.isArray(replay.value) ? replay.value : [];
      const replayItem = replayArray.find((entry) => keyMatches(entry, key_field, key_value));
      if (replayItem === undefined || replayItem === null || typeof replayItem !== "object") {
        throw new Error("Committed patch replay does not contain its keyed item");
      }
      return {
        status: "applied" as const,
        entity_id,
        entity_type: options.entity_type ?? "unknown",
        field,
        key_field,
        key_value,
        observation_id: replay.observation_id,
        item: replayItem as Record<string, unknown>,
        item_version: computeItemVersion(replayItem),
        array_length: replayArray.length,
        snapshot: replay.snapshot,
        replayed: true,
      };
    }

    const current = await getEntityWithProvenance(entity_id, false, user_id);
    if (!current) throw new Error(`Entity not found: ${entity_id}`);
    const entity_type = current.entity_type;
    if (options.entity_type && options.entity_type !== entity_type)
      throw new ArrayItemEntityTypeMismatchError({
        suppliedEntityType: options.entity_type,
        actualEntityType: entity_type,
      });

    // Schema verification is a safety condition, not an optional enhancement.
    // IO failures propagate, and an absent/mismatched keyed policy is rejected,
    // because otherwise this endpoint would promise lost-update protection
    // while writing through an ordinary last_write reducer.
    const schemaEntry =
      (await schemaRegistry.loadActiveSchema(entity_type, user_id)) ??
      (await loadCodeDefinedSchemaEntry(entity_type));
    const schemaVersion = schemaEntry?.schema_version ?? current.schema_version ?? "1.0";
    const fieldDefinition = schemaEntry?.schema_definition?.fields?.[field];
    const mergePolicy = schemaEntry?.reducer_config?.merge_policies?.[field];
    if (
      !schemaEntry ||
      fieldDefinition?.type !== "array" ||
      mergePolicy?.strategy !== "merge_array_by_key" ||
      !mergePolicy.key_field
    ) {
      throw new ArrayItemPolicyRequiredError({
        entityType: entity_type,
        field,
        suppliedKeyField: key_field,
      });
    }

    // Cross-check the caller-supplied key_field against the field's declared
    // merge_array_by_key key_field. Without this, a caller passing a stale or
    // mistyped key would update by one identity while the reducer reconciles
    // by another, silently duplicating the row. Schema/policy resolution is
    // fail-closed above, so this check is always binding on a successful write.
    const declaredKeyField = mergePolicy.key_field;
    if (declaredKeyField !== key_field) {
      throw new ArrayItemKeyFieldMismatchError({
        entityType: entity_type,
        field,
        declaredKeyField,
        suppliedKeyField: key_field,
      });
    }

    const snapshot = (current.snapshot as Record<string, unknown>) ?? {};
    const rawArray = snapshot[field];
    const currentArray: unknown[] = Array.isArray(rawArray) ? rawArray : [];

    const existingIndex = currentArray.findIndex((entry) =>
      keyMatches(entry, key_field, key_value)
    );
    const existingItem =
      existingIndex >= 0 ? (currentArray[existingIndex] as Record<string, unknown>) : null;
    const existingVersion = existingItem ? computeItemVersion(existingItem) : null;

    if (options.expected_item_absent === true && existingItem !== null) {
      return {
        status: "conflict" as const,
        entity_id,
        entity_type,
        field,
        key_field,
        key_value,
        snapshot,
        conflict: {
          current_item: existingItem,
          current_item_version: existingVersion,
          expected_item_version: null,
        },
      };
    }

    // A caller that supplies expected_item_version is asserting "I expect the
    // stored item to have exactly this version" — including the case where
    // existingVersion is null (the row does not exist yet), which mirrors
    // batch_correction.ts's stale-vs-unset asymmetry: a client-visible
    // precondition failure, not a permissive create. Any mismatch (including
    // null vs. a supplied string) refuses rather than overwrites/creates.
    if (typeof expected_item_version === "string" && existingVersion !== expected_item_version) {
      return {
        status: "conflict" as const,
        entity_id,
        entity_type,
        field,
        key_field,
        key_value,
        snapshot,
        conflict: {
          current_item: existingItem,
          current_item_version: existingVersion,
          expected_item_version,
        },
      };
    }

    const mergedItem: Record<string, unknown> = {
      ...(existingItem ?? {}),
      ...item,
      [key_field]: key_value,
    };

    const nextArray = currentArray.slice();
    if (existingIndex >= 0) {
      nextArray[existingIndex] = mergedItem;
    } else {
      nextArray.push(mergedItem);
    }

    const result = await createCorrection({
      entity_id,
      entity_type,
      field,
      value: nextArray,
      schema_version: schemaVersion,
      user_id,
      idempotency_key: options.idempotency_key,
      idempotency_operation: "patch_array_item",
      idempotency_payload: patchIdempotencyPayload(options),
      defer_substrate_events: true,
      in_transaction: true,
    });

    await options.before_commit?.();

    return {
      status: "applied" as const,
      entity_id,
      entity_type,
      field,
      key_field,
      key_value,
      observation_id: result.observation_id,
      item: mergedItem,
      item_version: computeItemVersion(mergedItem),
      array_length: nextArray.length,
      snapshot: (result.snapshot as Record<string, unknown>) ?? null,
      replayed: false,
      ...(result.deferred_substrate_event
        ? { deferred_substrate_event: result.deferred_substrate_event }
        : {}),
    };
  });
  const deferred = (
    result as ArrayItemPatchResult & {
      deferred_substrate_event?: Parameters<typeof emitCommittedCorrection>[0];
    }
  ).deferred_substrate_event;
  if (deferred) emitCommittedCorrection(deferred);
  if (deferred) delete (result as Record<string, unknown>).deferred_substrate_event;
  return result;
}
