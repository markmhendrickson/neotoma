/**
 * source_priority_warning.ts
 *
 * Pure helper for the SOURCE_PRIORITY_IGNORED write-time warning (#1755).
 *
 * `source_priority` only affects entity field values when the field's merge
 * policy is `highest_priority`, or `most_specific` with
 * `tie_breaker: "source_priority"`. Auto-discovered schemas (and any schema
 * that hasn't been explicitly configured) default every field to `last_write`,
 * which silently ignores `source_priority`. Setting `--source-priority` on
 * such a type is a no-op footgun: accepted, stored, never honoured.
 *
 * This module exposes:
 *  - `fieldHonorsPriority(policy)` — true when a single merge-policy entry
 *    will respect source_priority.
 *  - `sourcePriorityWillBeIgnored(opts)` — true when ALL fields that will be
 *    written have policies that ignore source_priority.
 *  - `buildSourcePriorityIgnoredWarning(opts)` — constructs the structured
 *    store_warnings[] entry (or null when no warning is warranted). Use this
 *    in place of the inline warning-construction block so both the HTTP and
 *    MCP paths stay in sync.
 *
 * All exports are intentionally pure (no I/O) so they can be unit-tested
 * without mocking the database or schema registry.
 */

import type { ReducerConfig } from "./schema_registry.js";

export type MergePolicy = ReducerConfig["merge_policies"][string];

/**
 * Returns true when the given merge-policy entry actively honours
 * `source_priority` during reduction.
 *
 * The two cases that honour it:
 *  1. `strategy: "highest_priority"` — source_priority is the primary sort key.
 *  2. `strategy: "most_specific"` with `tie_breaker: "source_priority"` —
 *     source_priority acts as the tie-breaker after specificity_score.
 */
export function fieldHonorsPriority(policy: MergePolicy | undefined): boolean {
  if (!policy) return false;
  if (policy.strategy === "highest_priority") return true;
  if (policy.strategy === "most_specific" && policy.tie_breaker === "source_priority") return true;
  return false;
}

/**
 * Returns true when the combination of `sourcePriority` + `mergePolicies` +
 * `writtenFields` means source_priority will have NO effect on any field value.
 *
 * Conditions for returning true (all must hold):
 *  1. `sourcePriority` is non-default (i.e. not 100). When the caller passes
 *     the default value there is nothing to warn about — they never asked for
 *     priority semantics.
 *  2. There is at least one field being written (empty writes are a no-op for
 *     other reasons; don't pile on).
 *  3. None of the written fields' merge policies honour source_priority.
 *
 * When `mergePolicies` is undefined/null (e.g. no schema registered, or the
 * schema omits reducer_config) we treat every field as `last_write` — a
 * non-honouring strategy — so we still warn.
 */
export function sourcePriorityWillBeIgnored(opts: {
  sourcePriority: number;
  writtenFields: Record<string, unknown>;
  mergePolicies: ReducerConfig["merge_policies"] | undefined | null;
}): boolean {
  const { sourcePriority, writtenFields, mergePolicies } = opts;

  // Condition 1: non-default priority.
  if (sourcePriority === 100) return false;

  // Condition 2: at least one field is being written.
  const fieldNames = Object.keys(writtenFields);
  if (fieldNames.length === 0) return false;

  // Condition 3: no written field honours priority.
  for (const fieldName of fieldNames) {
    const policy = mergePolicies?.[fieldName];
    if (fieldHonorsPriority(policy)) return false;
  }

  return true;
}

/**
 * The shape of one store_warnings[] entry emitted by the SOURCE_PRIORITY_IGNORED
 * code path. Mirrors the shape expected by both the HTTP and MCP store handlers.
 */
export type SourcePriorityIgnoredWarning = {
  code: "SOURCE_PRIORITY_IGNORED";
  message: string;
  observation_index: number;
  entity_type: string;
  entity_id: string;
};

/**
 * Returns a structured store_warnings[] entry when `source_priority` will have
 * no effect on the observation, or `null` when no warning is warranted.
 *
 * Centralises both the predicate check and the message template so the HTTP
 * and MCP call sites are each a single expression rather than an ~11-line
 * inline block.
 */
export function buildSourcePriorityIgnoredWarning(opts: {
  sourcePriority: number;
  writtenFields: Record<string, unknown>;
  mergePolicies: ReducerConfig["merge_policies"] | undefined | null;
  observationIndex: number;
  entityType: string;
  entityId: string;
}): SourcePriorityIgnoredWarning | null {
  const { sourcePriority, writtenFields, mergePolicies, observationIndex, entityType, entityId } =
    opts;

  if (
    !sourcePriorityWillBeIgnored({ sourcePriority, writtenFields, mergePolicies })
  ) {
    return null;
  }

  return {
    code: "SOURCE_PRIORITY_IGNORED",
    message:
      `${entityType} stored with source_priority ${sourcePriority} but no field ` +
      "on this entity type uses a merge strategy that honours it. " +
      "source_priority is only effective when a field's reducer policy is " +
      '`highest_priority` (or `most_specific` with `tie_breaker: "source_priority"`). ' +
      "To fix: register a schema whose reducer_config sets the relevant field(s) to " +
      "`highest_priority` so source_priority is honoured during reduction.",
    observation_index: observationIndex,
    entity_type: entityType,
    entity_id: entityId,
  };
}
