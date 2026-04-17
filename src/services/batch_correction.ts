/**
 * Shared batch-correction backend used by both Inspector Edit mode (Phase 4)
 * and the `neotoma edit` CLI one-shot (Phase 4b).
 *
 * Why a shared module:
 *   The plan deliberately replaces the post's free-form markdown-diff editor
 *   with two surfaces that speak structured fields. Both surfaces compute a
 *   field diff against the loaded snapshot and must apply corrections with
 *   identical semantics — optimistic concurrency, atomic pre-validation,
 *   deterministic ordering — so users can't get one behavior from the UI and
 *   a different one from the terminal.
 *
 * Semantics:
 *   - Callers pass the `last_observation_at` they saw when they loaded the
 *     snapshot. Before writing anything, we refetch the current snapshot and
 *     compare. If it has moved, we either abort with a structured conflict or
 *     (when overwrite=true) proceed anyway.
 *   - All field changes are pre-validated against the active schema before any
 *     write lands. If any field fails, nothing is written — the UI/CLI sees a
 *     single validation error and the draft is preserved upstream.
 *   - Corrections are applied in deterministic (alphabetical) field order so
 *     Inspector and CLI produce the same observation sequence for the same
 *     diff.
 *
 * Out of scope:
 *   - Multi-entity batching (the post's "rewrite many files" path). Each
 *     batch targets one entity_id.
 *   - Bidirectional mirror-file sync. The mirror stays a derived artifact.
 */
import { db } from "../db.js";
import { createCorrection } from "./correction.js";
import { getEntityWithProvenance } from "./entity_queries.js";
import { schemaRegistry } from "./schema_registry.js";

export interface BatchCorrectionFieldChange {
  field: string;
  value: unknown;
}

export interface BatchCorrectionOptions {
  /** Target entity id (required; batches are scoped to one entity). */
  entity_id: string;
  /** Observed entity_type at load time; compared against the current snapshot. */
  entity_type?: string;
  /** Authenticated user applying the corrections. */
  user_id: string;
  /**
   * `last_observation_at` the caller read when loading the snapshot. Used for
   * optimistic concurrency. When provided, a conflict is reported (or
   * overwritten per `overwrite`) if the stored value has moved.
   */
  expected_last_observation_at?: string | null;
  /**
   * If true, proceed even when the snapshot has moved. Maps to the CLI
   * `--force` flag and the Inspector "overwrite" button. When false (default),
   * callers get a structured conflict back and must re-fetch.
   */
  overwrite?: boolean;
  /**
   * Field diff to apply. The caller is responsible for only including fields
   * that actually changed; the backend applies them as-is.
   */
  changes: BatchCorrectionFieldChange[];
  /** Optional base key used to build deterministic idempotency keys. */
  idempotency_prefix?: string;
}

export type BatchCorrectionStatus = "applied" | "conflict" | "validation_error";

export interface BatchCorrectionValidationError {
  field: string;
  message: string;
}

export interface BatchCorrectionConflict {
  stored_last_observation_at: string | null;
  expected_last_observation_at: string | null;
  conflicting_fields: string[];
}

export interface BatchCorrectionApplied {
  observation_id: string;
  field: string;
  value: unknown;
}

export interface BatchCorrectionResult {
  status: BatchCorrectionStatus;
  entity_id: string;
  entity_type: string;
  applied: BatchCorrectionApplied[];
  validation_errors?: BatchCorrectionValidationError[];
  conflict?: BatchCorrectionConflict;
  snapshot?: Record<string, unknown> | null;
  last_observation_at?: string | null;
}

/**
 * Compute a diff of desired field values against the current snapshot. Useful
 * for callers (Inspector, CLI) that accept whole-object edits and want to
 * reduce to a minimal change set before applying.
 */
export function diffSnapshotFields(
  desired: Record<string, unknown>,
  current: Record<string, unknown> | null | undefined
): BatchCorrectionFieldChange[] {
  const changes: BatchCorrectionFieldChange[] = [];
  const cur = (current ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(desired).sort()) {
    const next = desired[key];
    const prev = cur[key];
    if (stableSerialize(next) !== stableSerialize(prev)) {
      changes.push({ field: key, value: next });
    }
  }
  return changes;
}

function stableSerialize(v: unknown): string {
  if (v === undefined) return "__undefined__";
  if (v === null) return "null";
  if (typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return JSON.stringify(v.map(stableSerialize));
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${stableSerialize(obj[k])}`);
  return `{${parts.join(",")}}`;
}

/**
 * Validate each change against the active schema for the entity type. Only
 * checks type-compatibility and enum membership; does not enforce required
 * fields (corrections can clear values intentionally). Exported for tests.
 */
export function validateChangesAgainstSchema(
  changes: BatchCorrectionFieldChange[],
  schema: {
    schema_definition?: {
      fields?: Record<string, { type?: string; enum?: unknown[] }>;
    };
  } | null
): BatchCorrectionValidationError[] {
  const errors: BatchCorrectionValidationError[] = [];
  const fields = schema?.schema_definition?.fields ?? {};
  for (const { field, value } of changes) {
    const def = fields[field];
    if (!def) {
      // Unknown field: allowed, schemas are additive by design. The reducer
      // tolerates unknown keys on observations.
      continue;
    }
    const type = def.type;
    if (value === null || value === undefined) continue; // allow clears
    if (type === "string" && typeof value !== "string") {
      errors.push({ field, message: `expected string, got ${typeOf(value)}` });
    } else if (type === "number" && typeof value !== "number") {
      errors.push({ field, message: `expected number, got ${typeOf(value)}` });
    } else if (type === "boolean" && typeof value !== "boolean") {
      errors.push({ field, message: `expected boolean, got ${typeOf(value)}` });
    } else if (type === "array" && !Array.isArray(value)) {
      errors.push({ field, message: `expected array, got ${typeOf(value)}` });
    } else if (type === "object" && (typeof value !== "object" || Array.isArray(value))) {
      errors.push({ field, message: `expected object, got ${typeOf(value)}` });
    }
    if (Array.isArray(def.enum) && def.enum.length > 0) {
      if (!def.enum.includes(value as never)) {
        errors.push({
          field,
          message: `value not in enum: ${JSON.stringify(def.enum)}`,
        });
      }
    }
  }
  return errors;
}

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/**
 * Apply a batch of field corrections to one entity. The flow is:
 *
 *   1. Resolve entity snapshot and schema.
 *   2. Optimistic concurrency check against `expected_last_observation_at`.
 *   3. Schema validation across all changes (fail-fast).
 *   4. Alphabetical application via createCorrection; snapshot recomputes
 *      on the final correction (recomputeSnapshot is idempotent).
 */
export async function applyBatchCorrection(
  options: BatchCorrectionOptions
): Promise<BatchCorrectionResult> {
  const {
    entity_id,
    user_id,
    expected_last_observation_at,
    overwrite = false,
    changes,
    idempotency_prefix,
  } = options;

  if (changes.length === 0) {
    const current = await getEntityWithProvenance(entity_id);
    return {
      status: "applied",
      entity_id,
      entity_type: current?.entity_type ?? options.entity_type ?? "",
      applied: [],
      snapshot: (current?.snapshot as Record<string, unknown>) ?? null,
      last_observation_at: current?.last_observation_at ?? null,
    };
  }

  const current = await getEntityWithProvenance(entity_id);
  if (!current) {
    throw new Error(`Entity not found: ${entity_id}`);
  }
  const entity_type = current.entity_type;
  const storedLast = current.last_observation_at ?? null;

  if (
    typeof expected_last_observation_at === "string" &&
    storedLast !== null &&
    storedLast !== expected_last_observation_at &&
    !overwrite
  ) {
    return {
      status: "conflict",
      entity_id,
      entity_type,
      applied: [],
      conflict: {
        stored_last_observation_at: storedLast,
        expected_last_observation_at,
        conflicting_fields: changes.map((c) => c.field).sort(),
      },
      snapshot: (current.snapshot as Record<string, unknown>) ?? null,
      last_observation_at: storedLast,
    };
  }

  let schema:
    | { schema_version: string; schema_definition?: { fields?: Record<string, { type?: string; enum?: unknown[] }> } }
    | null = null;
  try {
    schema = await schemaRegistry.loadActiveSchema(entity_type, user_id);
  } catch {
    schema = null;
  }
  const validation_errors = validateChangesAgainstSchema(changes, schema);
  if (validation_errors.length > 0) {
    return {
      status: "validation_error",
      entity_id,
      entity_type,
      applied: [],
      validation_errors,
      snapshot: (current.snapshot as Record<string, unknown>) ?? null,
      last_observation_at: storedLast,
    };
  }

  const sorted = changes.slice().sort((a, b) => a.field.localeCompare(b.field));
  const applied: BatchCorrectionApplied[] = [];
  for (const change of sorted) {
    const idempotency_key = idempotency_prefix
      ? `${idempotency_prefix}-${change.field}`
      : undefined;
    const res = await createCorrection({
      entity_id,
      entity_type,
      field: change.field,
      value: change.value,
      schema_version: schema?.schema_version ?? "1.0",
      user_id,
      idempotency_key,
    });
    applied.push({
      observation_id: res.observation_id,
      field: res.field,
      value: res.value,
    });
  }

  const refreshed = await getEntityWithProvenance(entity_id);
  return {
    status: "applied",
    entity_id,
    entity_type,
    applied,
    snapshot: (refreshed?.snapshot as Record<string, unknown>) ?? null,
    last_observation_at: refreshed?.last_observation_at ?? null,
  };
}

/**
 * Lightweight helper used by both surfaces to fetch the current snapshot
 * plus its `last_observation_at` marker for concurrency tracking. Avoids
 * callers pulling in `getEntityWithProvenance` directly.
 */
export async function loadEntityForEdit(entity_id: string): Promise<{
  entity_id: string;
  entity_type: string;
  schema_version: string;
  snapshot: Record<string, unknown>;
  last_observation_at: string | null;
} | null> {
  const current = await getEntityWithProvenance(entity_id);
  if (!current) return null;
  return {
    entity_id: current.entity_id ?? entity_id,
    entity_type: current.entity_type,
    schema_version: current.schema_version ?? "1.0",
    snapshot: (current.snapshot as Record<string, unknown>) ?? {},
    last_observation_at: current.last_observation_at ?? null,
  };
}

// Re-exported so tests can stub the db if needed.
export { db };
