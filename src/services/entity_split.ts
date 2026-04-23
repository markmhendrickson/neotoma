/**
 * Entity Split Service (Domain Layer)
 *
 * R5 of the conversation entity collision fix. Inverse of `entity_merge.ts`:
 * takes an entity that was over-merged (typically by the pre-v1.2 heuristic
 * `name_key:title` path for session-scoped schemas), selects a subset of its
 * observations via a declarative predicate, and re-points those observations
 * onto a new entity. Symmetric with the shipped merge flow —
 * observation *content* is never modified; only the `entity_id` foreign key
 * is re-bound (see `docs/subsystems/observation_architecture.md` reconciled
 * with `docs/subsystems/entity_merge.md` § 4.3).
 *
 * Schema-agnostic: the service never branches on entity_type. Predicates
 * operate on fields every observation row carries (entity_id, observed_at,
 * source_id, fields blob) so adding a new session-scoped schema needs no
 * code change here.
 */

import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import {
  deleteSnapshot,
  recomputeSnapshot,
} from "./snapshot_computation.js";
import { generateEntityId } from "./entity_resolution.js";

/**
 * Declarative predicate describing which observations of the source entity
 * should be re-pointed onto the new entity. Start small and schema-agnostic;
 * every predicate form reads a column that every observation row carries.
 */
export interface SplitPredicate {
  /**
   * Select observations whose `observed_at` is >= this ISO-8601 timestamp.
   * Primary use case: "everything from this session forward moved to a new
   * entity because two sessions got merged by title".
   */
  observed_at_gte?: string;
  /**
   * Select observations whose `source_id` is one of the listed sources.
   * Useful when a single over-merged entity collected observations from
   * distinct sources that should live on separate entities.
   */
  source_id_in?: string[];
  /**
   * Select observations whose `fields.<field>` equals the given value (or
   * begins with the given prefix when `value_starts_with` is supplied). The
   * comparison is string-equals / string-prefix; no type coercion.
   */
  observation_field_equals?: {
    field: string;
    value?: string;
    value_starts_with?: string;
  };
}

export interface SplitEntityParams {
  sourceEntityId: string;
  userId: string;
  predicate: SplitPredicate;
  /**
   * Schema + caller-supplied fields for the new entity. The resolver-level
   * identity is derived by caller (they know which `conversation_id` / other
   * canonical_name_field now applies). Canonical_name is required so the
   * deterministic entity_id derivation matches {@link generateEntityId}.
   */
  newEntity: {
    entity_type: string;
    canonical_name: string;
    /** Optional target entity_id override (e.g. a pre-existing entity). */
    target_entity_id?: string;
  };
  /** Required for replay safety; reuse with a different predicate is an error. */
  idempotencyKey: string;
  reason?: string;
  splitBy: string;
}

export interface SplitResult {
  split_id: string;
  source_entity_id: string;
  new_entity_id: string;
  observations_moved: number;
  split_at: string;
  replayed: boolean;
}

export class EntityNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntityNotFoundError";
  }
}

export class EntityAlreadyMergedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntityAlreadyMergedError";
  }
}

export class SplitPredicateMatchedNothingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplitPredicateMatchedNothingError";
  }
}

export class SplitPredicateMatchedAllError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplitPredicateMatchedAllError";
  }
}

export class IdempotencyMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdempotencyMismatchError";
  }
}

interface ObservationRow {
  id: string;
  entity_id: string;
  observed_at?: string | null;
  source_id?: string | null;
  fields?: unknown;
}

function isObservationRow(value: unknown): value is ObservationRow {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { entity_id?: unknown }).entity_id === "string"
  );
}

function observationMatchesPredicate(
  obs: ObservationRow,
  predicate: SplitPredicate,
): boolean {
  if (predicate.observed_at_gte) {
    const observedAt = obs.observed_at;
    if (!observedAt || observedAt < predicate.observed_at_gte) return false;
  }
  if (predicate.source_id_in && predicate.source_id_in.length > 0) {
    const sourceId = obs.source_id ?? "";
    if (!predicate.source_id_in.includes(sourceId)) return false;
  }
  if (predicate.observation_field_equals) {
    const { field, value, value_starts_with } = predicate.observation_field_equals;
    const fieldsBlob = obs.fields;
    if (!fieldsBlob || typeof fieldsBlob !== "object") return false;
    const actual = (fieldsBlob as Record<string, unknown>)[field];
    if (actual === undefined || actual === null) return false;
    const actualStr = typeof actual === "string" ? actual : String(actual);
    if (value !== undefined && actualStr !== value) return false;
    if (value_starts_with !== undefined && !actualStr.startsWith(value_starts_with)) {
      return false;
    }
  }
  return true;
}

/**
 * Produce the deterministic predicate canonicalization used for idempotency
 * comparison. Stable key order; no wall-clock / randomness.
 */
function canonicalizePredicate(predicate: SplitPredicate): string {
  const ordered: Record<string, unknown> = {};
  if (predicate.observed_at_gte !== undefined) {
    ordered.observed_at_gte = predicate.observed_at_gte;
  }
  if (predicate.source_id_in !== undefined) {
    ordered.source_id_in = [...predicate.source_id_in].sort();
  }
  if (predicate.observation_field_equals !== undefined) {
    const { field, value, value_starts_with } = predicate.observation_field_equals;
    const inner: Record<string, unknown> = { field };
    if (value !== undefined) inner.value = value;
    if (value_starts_with !== undefined) inner.value_starts_with = value_starts_with;
    ordered.observation_field_equals = inner;
  }
  return JSON.stringify(ordered);
}

export async function splitEntity(params: SplitEntityParams): Promise<SplitResult> {
  const {
    sourceEntityId,
    userId,
    predicate,
    newEntity,
    idempotencyKey,
    reason,
    splitBy,
  } = params;

  const canonicalPredicate = canonicalizePredicate(predicate);

  // Idempotency: replay same (user_id, idempotency_key) with same predicate ⇒
  // return the original split. Different predicate ⇒ IdempotencyMismatchError.
  const { data: existingSplit } = await db
    .from("entity_splits")
    .select("*")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .single();

  if (existingSplit) {
    const storedPredicate = typeof (existingSplit as { predicate?: unknown }).predicate === "string"
      ? ((existingSplit as { predicate: string }).predicate)
      : JSON.stringify((existingSplit as { predicate: unknown }).predicate);
    if (storedPredicate !== canonicalPredicate) {
      throw new IdempotencyMismatchError(
        `idempotency_key "${idempotencyKey}" reused with a different predicate. ` +
          "Provide a new idempotency_key for a new split, or re-send the original predicate.",
      );
    }
    return {
      split_id: (existingSplit as { id: string }).id,
      source_entity_id: (existingSplit as { source_entity_id: string }).source_entity_id,
      new_entity_id: (existingSplit as { new_entity_id: string }).new_entity_id,
      observations_moved:
        (existingSplit as { observations_rewritten?: number }).observations_rewritten ?? 0,
      split_at: (existingSplit as { created_at: string }).created_at,
      replayed: true,
    };
  }

  const { data: sourceEntity } = await db
    .from("entities")
    .select("id, merged_to_entity_id, entity_type")
    .eq("id", sourceEntityId)
    .eq("user_id", userId)
    .single();

  if (!sourceEntity) {
    throw new EntityNotFoundError(`Source entity ${sourceEntityId} not found`);
  }
  if ((sourceEntity as { merged_to_entity_id?: string | null }).merged_to_entity_id) {
    throw new EntityAlreadyMergedError(
      "Source entity is already merged; unmerge or split the merge target instead.",
    );
  }

  // Compute (or accept) the new entity id deterministically. Using
  // generateEntityId keeps id derivation in one place; explicit
  // target_entity_id support lets operators split INTO an existing entity
  // when the over-merge can be repaired by re-pointing to a pre-existing row.
  const newEntityId =
    newEntity.target_entity_id ??
    generateEntityId(newEntity.entity_type, newEntity.canonical_name);
  if (newEntityId === sourceEntityId) {
    throw new Error(
      "split_entity: new_entity_id is identical to source_entity_id; split would be a no-op.",
    );
  }

  // Select candidate observations and filter by predicate in-process. Doing
  // the filter in code keeps the predicate surface small and DB-agnostic
  // (the shipped merge flow uses the same "one SQL update per eq" pattern).
  const { data: observations, error: obsError } = await db
    .from("observations")
    .select("id, entity_id, observed_at, source_id, fields")
    .eq("entity_id", sourceEntityId)
    .eq("user_id", userId);

  if (obsError) {
    throw new Error(`Failed to load source observations: ${obsError.message}`);
  }

  const rawRows: unknown[] = observations ?? [];
  const allRows: ObservationRow[] = rawRows.filter(isObservationRow);
  const matched = allRows.filter((o: ObservationRow) =>
    observationMatchesPredicate(o, predicate),
  );

  if (matched.length === 0) {
    throw new SplitPredicateMatchedNothingError(
      "Split predicate matched zero observations on the source entity.",
    );
  }
  if (matched.length === allRows.length) {
    throw new SplitPredicateMatchedAllError(
      "Split predicate matched every observation on the source entity; " +
        "a split that leaves the source empty is a rename — use correct or merge instead.",
    );
  }

  // Ensure the new entity row exists before re-pointing FKs. Use insert with
  // ignore-on-conflict when target_entity_id already exists (splitting into an
  // existing entity). Existing merge flow does not explicitly insert entities
  // because merge always targets a pre-existing entity; split must handle the
  // create-new-entity case.
  if (!newEntity.target_entity_id) {
    const nowIso = new Date().toISOString();
    const { error: insertErr } = await db.from("entities").insert({
      id: newEntityId,
      user_id: userId,
      entity_type: newEntity.entity_type,
      canonical_name: newEntity.canonical_name,
      created_at: nowIso,
      updated_at: nowIso,
    });
    if (insertErr) {
      // Tolerate "already exists" — the deterministic id may collide with a
      // prior split replay or a pre-existing entity. Any other error bubbles.
      const message = insertErr.message || "";
      if (!/exists|duplicate/i.test(message)) {
        throw new Error(`Failed to create split-target entity: ${message}`);
      }
    }
  }

  // Re-point matching observations one batch at a time. DB driver does not
  // expose a transaction primitive here; the audit row (below) anchors the
  // idempotency contract so replay returns the same result deterministically.
  const matchedIds = matched.map((o: ObservationRow) => o.id);
  const { error: updErr } = await db
    .from("observations")
    .update({ entity_id: newEntityId })
    .in("id", matchedIds)
    .eq("user_id", userId);
  if (updErr) {
    throw new Error(`Failed to re-point observations: ${updErr.message}`);
  }

  // Re-point typed relationships whose endpoints were on the moved observation
  // set. Because relationships track entity_id endpoints and not observation
  // ids directly, the only safe mutation is when every observation for an
  // endpoint moved. For the initial split cut, leave relationships bound to
  // the source entity; operators can rebuild edges with create_relationship.
  // This preserves MUST NOT #12 (no untyped edges introduced) and matches
  // the plan's symmetric-with-merge guarantee — merge does not attempt to
  // recompute typed edges either.

  // Snapshot invalidation + recompute. Same pattern as merge: delete source
  // snapshot, let recomputeSnapshot rebuild from the reduced observation set
  // on both sides.
  await deleteSnapshot(sourceEntityId, userId);
  await recomputeSnapshot(sourceEntityId, userId);
  await recomputeSnapshot(newEntityId, userId);

  const splitAt = new Date().toISOString();
  const splitId = randomUUID();

  const { error: auditErr } = await db.from("entity_splits").insert({
    id: splitId,
    user_id: userId,
    source_entity_id: sourceEntityId,
    new_entity_id: newEntityId,
    predicate: canonicalPredicate,
    reason: reason ?? null,
    split_by: splitBy,
    observations_rewritten: matchedIds.length,
    idempotency_key: idempotencyKey,
    created_at: splitAt,
  });
  if (auditErr) {
    throw new Error(`Failed to write entity_splits audit row: ${auditErr.message}`);
  }

  return {
    split_id: splitId,
    source_entity_id: sourceEntityId,
    new_entity_id: newEntityId,
    observations_moved: matchedIds.length,
    split_at: splitAt,
    replayed: false,
  };
}
