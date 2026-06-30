/**
 * null_cleared_field_warning.ts
 *
 * Pure helper for the NULL_CLEARED_FIELD write-time warning (#1839).
 *
 * Under the `highest_priority` reducer, a `null` observation is an explicit
 * tombstone: when it wins selection for a field, it clears that field from the
 * snapshot. This is BY DESIGN (only `undefined` is dropped/ignored by the
 * reducer; `null` is a deliberate clear). The gap reported in #1839 is that the
 * clear happens SILENTLY — a transient data-source failure that writes `null`
 * at the same-or-higher source_priority can erase a good historical value with
 * no signal to the caller.
 *
 * The fix is warn-only: emit a non-blocking `NULL_CLEARED_FIELD` store_warning
 * when an incoming `null` clears a prior non-null value under a field whose
 * merge policy is `highest_priority`. The clearing semantics are unchanged.
 *
 * This module exposes:
 *  - `buildNullClearedFieldWarning(opts)` — constructs the structured
 *    store_warnings[] entry, or `null` when no warning is warranted.
 *
 * The export is intentionally pure (no I/O) so it can be unit-tested without
 * mocking the database or schema registry.
 */

import type { ReducerConfig } from "./schema_registry.js";

export type MergePolicy = ReducerConfig["merge_policies"][string];

/**
 * The shape of one store_warnings[] entry emitted by the NULL_CLEARED_FIELD
 * code path. Mirrors the shape expected by both the HTTP and MCP store handlers.
 */
export type NullClearedFieldWarning = {
  code: "NULL_CLEARED_FIELD";
  message: string;
  observation_index: number;
  entity_type: string;
  entity_id: string;
};

/**
 * Returns a structured store_warnings[] entry when an incoming `null` value is
 * the resolved winner for a `highest_priority` field and clears a prior
 * non-null value, or `null` when no warning is warranted.
 *
 * Conditions (all must hold):
 *  1. The incoming value for the field is exactly `null` (not `undefined` — an
 *     omitted field is ignored by the reducer and clears nothing).
 *  2. The prior snapshot value for the field was non-null and non-undefined
 *     (i.e. there is a good value to lose). Clearing an already-empty field is
 *     not a data-loss event and warrants no warning.
 *  3. The newly-recomputed snapshot value for the field is null/undefined — the
 *     field was ACTUALLY cleared. This guards against false positives on store
 *     paths that strip a typed-field null before it becomes an observation (so
 *     the prior value is in fact retained, not cleared): no real clear, no
 *     warning.
 *  4. The field's merge policy strategy is `highest_priority`. Only this
 *     strategy lets a same/higher-priority null win selection in the way #1839
 *     describes. (`last_write` reaches the same clear, but the warning scope is
 *     deliberately limited to highest_priority per the approved fix.)
 *
 * Warn-only: this never alters the snapshot or the clearing semantics.
 */
export function buildNullClearedFieldWarning(opts: {
  field: string;
  strategy: string | undefined;
  prior_value: unknown;
  incoming_value: unknown;
  new_value: unknown;
  observation_index: number;
  entity_type: string;
  entity_id: string;
}): NullClearedFieldWarning | null {
  const {
    field,
    strategy,
    prior_value,
    incoming_value,
    new_value,
    observation_index,
    entity_type,
    entity_id,
  } = opts;

  // Condition 1: incoming value is an explicit null tombstone.
  if (incoming_value !== null) return null;

  // Condition 2: there was a prior non-null/undefined value to lose.
  if (prior_value === null || prior_value === undefined) return null;

  // Condition 3: the field was actually cleared in the new snapshot.
  if (new_value !== null && new_value !== undefined) return null;

  // Condition 4: the field is reduced under highest_priority.
  if (strategy !== "highest_priority") return null;

  return {
    code: "NULL_CLEARED_FIELD",
    message:
      `${entity_type} field "${field}" was cleared by a null observation under ` +
      "`highest_priority` reduction. A null value at the same or higher source_priority " +
      "is an explicit tombstone and wins selection, clearing the prior non-null value. " +
      "This is by design, but it is a data-loss vector when the null represents " +
      '"data unavailable" (e.g. an upstream timeout or solver failure). ' +
      "To retain the last-good value, omit the field entirely instead of sending null " +
      "(omitted fields are ignored by the reducer), or correct() the field back to a " +
      "non-null value.",
    observation_index,
    entity_type,
    entity_id,
  };
}
