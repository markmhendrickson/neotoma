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
 * Returns a list of written field names that will NOT honour source_priority,
 * paired with their effective merge strategy (from mergePolicies, or
 * "last_write" when the field is absent from the policy map / no schema exists).
 *
 * Returns an empty array when every written field honours priority (i.e. the
 * caller should not emit a warning).
 */
export function ignoredFieldStrategies(opts: {
  writtenFields: Record<string, unknown>;
  mergePolicies: ReducerConfig["merge_policies"] | undefined | null;
}): Array<{ field: string; strategy: string }> {
  const { writtenFields, mergePolicies } = opts;
  const result: Array<{ field: string; strategy: string }> = [];
  for (const fieldName of Object.keys(writtenFields)) {
    const policy = mergePolicies?.[fieldName];
    if (!fieldHonorsPriority(policy)) {
      // If the field has an explicit policy, report its strategy; otherwise it
      // falls back to the auto-discovered default ("last_write").
      result.push({ field: fieldName, strategy: policy?.strategy ?? "last_write" });
    }
  }
  return result;
}

/**
 * Returns a structured store_warnings[] entry when `source_priority` will have
 * no effect on the observation, or `null` when no warning is warranted.
 *
 * The message now names each written field that ignores source_priority and
 * states its effective merge strategy, making the warning self-diagnosing.
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

  if (!sourcePriorityWillBeIgnored({ sourcePriority, writtenFields, mergePolicies })) {
    return null;
  }

  const ignored = ignoredFieldStrategies({ writtenFields, mergePolicies });

  // Build a compact per-field summary: "field 'foo' uses last_write"
  const fieldSummary = ignored
    .map(({ field, strategy }) => `'${field}' uses ${strategy}`)
    .join(", ");

  const noSchema = !mergePolicies || Object.keys(mergePolicies).length === 0;
  const policyNote = noSchema
    ? " (reducer_config.merge_policies has no entries for this type)"
    : " (reducer_config.merge_policies has no highest_priority entry for these fields)";

  return {
    code: "SOURCE_PRIORITY_IGNORED",
    message:
      `${entityType} stored with source_priority ${sourcePriority} but the written ` +
      `field(s) ignore it — ${fieldSummary}${policyNote}. ` +
      "source_priority is only effective when a field's reducer policy is " +
      '`highest_priority` (or `most_specific` with `tie_breaker: "source_priority"`). ' +
      "To fix: register a schema whose reducer_config.merge_policies sets the relevant " +
      "field(s) to `highest_priority` so source_priority is honoured during reduction.",
    observation_index: observationIndex,
    entity_type: entityType,
    entity_id: entityId,
  };
}

// ─── SOURCE_PRIORITY_ESCALATION (#1838) ──────────────────────────────────────
//
// The mirror-image footgun of SOURCE_PRIORITY_IGNORED. `source_priority`
// defaults to 100 (see action_schemas.ts). When a caller writes to a field
// governed by a `highest_priority` reducer WITHOUT passing an explicit
// `--source-priority`, the write silently inherits priority 100 — which
// OUTRANKS any prior observation that was written with an explicit lower
// priority (e.g. a trusted import at priority 50). The result is a silent
// trust-escalation: the unprioritized write wins the field.
//
// LIMITATION (#1838): zod applies `.default(100)` before the handler runs, so
// at the warning call site we cannot distinguish "caller omitted
// source_priority" from "caller explicitly passed 100". We therefore warn
// whenever priority === 100 AND a highest_priority field is written, framed as
// "default/non-explicit 100". A caller who genuinely wants priority 100 can
// ignore the advisory; the warning is non-blocking.

/**
 * Returns the list of written field names whose merge policy honours
 * source_priority (`highest_priority`, or `most_specific` with
 * `tie_breaker: "source_priority"`). These are the fields where a default-100
 * write can silently outrank an explicit lower priority.
 */
export function priorityHonouringFields(opts: {
  writtenFields: Record<string, unknown>;
  mergePolicies: ReducerConfig["merge_policies"] | undefined | null;
}): Array<{ field: string; strategy: string }> {
  const { writtenFields, mergePolicies } = opts;
  const result: Array<{ field: string; strategy: string }> = [];
  for (const fieldName of Object.keys(writtenFields)) {
    const policy = mergePolicies?.[fieldName];
    if (fieldHonorsPriority(policy)) {
      result.push({ field: fieldName, strategy: policy?.strategy ?? "highest_priority" });
    }
  }
  return result;
}

/**
 * Returns true when a write at the default priority (100) participates in at
 * least one field that honours source_priority — i.e. the write could silently
 * outrank a prior observation written with an explicit lower priority.
 *
 * Conditions (all must hold):
 *  1. `sourcePriority === 100` — the (possibly-defaulted) value. Because zod
 *     applies the default before this runs, we cannot tell an omitted value
 *     from an explicit 100; we warn on both.
 *  2. At least one written field's merge policy honours source_priority.
 */
export function sourcePriorityMayEscalate(opts: {
  sourcePriority: number;
  writtenFields: Record<string, unknown>;
  mergePolicies: ReducerConfig["merge_policies"] | undefined | null;
}): boolean {
  const { sourcePriority, writtenFields, mergePolicies } = opts;
  if (sourcePriority !== 100) return false;
  return priorityHonouringFields({ writtenFields, mergePolicies }).length > 0;
}

/**
 * The shape of one store_warnings[] entry emitted by the
 * SOURCE_PRIORITY_ESCALATION code path. Mirrors SourcePriorityIgnoredWarning.
 */
export type SourcePriorityEscalationWarning = {
  code: "SOURCE_PRIORITY_ESCALATION";
  message: string;
  observation_index: number;
  entity_type: string;
  entity_id: string;
};

/**
 * Returns a structured store_warnings[] entry when a default-priority (100)
 * write participates in a `highest_priority` field and could silently outrank
 * an explicit lower priority, or `null` when no warning is warranted.
 *
 * Mitigation surfaced in the message: pass an explicit `--source-priority`
 * (CLI) / `source_priority` (API) for any write whose value should be ranked,
 * so the relative trust is intentional rather than inherited from the default.
 */
export function buildSourcePriorityEscalationWarning(opts: {
  sourcePriority: number;
  writtenFields: Record<string, unknown>;
  mergePolicies: ReducerConfig["merge_policies"] | undefined | null;
  observationIndex: number;
  entityType: string;
  entityId: string;
}): SourcePriorityEscalationWarning | null {
  const { sourcePriority, writtenFields, mergePolicies, observationIndex, entityType, entityId } =
    opts;

  if (!sourcePriorityMayEscalate({ sourcePriority, writtenFields, mergePolicies })) {
    return null;
  }

  const honouring = priorityHonouringFields({ writtenFields, mergePolicies });
  const fieldSummary = honouring
    .map(({ field, strategy }) => `'${field}' uses ${strategy}`)
    .join(", ");

  return {
    code: "SOURCE_PRIORITY_ESCALATION",
    message:
      `${entityType} written at the default source_priority ${sourcePriority} into ` +
      `field(s) that rank by priority — ${fieldSummary}. A default/non-explicit ` +
      `priority ${sourcePriority} OUTRANKS any prior observation written with an ` +
      "explicit lower priority (e.g. a trusted import at 50), silently escalating " +
      "this write's trust. Note: an explicit source_priority of 100 is " +
      "indistinguishable from the default at write time, so this advisory fires on " +
      "both. To make ranking intentional, pass an explicit --source-priority " +
      "(CLI) / source_priority (API) reflecting how this write should rank against " +
      "others — see docs/subsystems/conflict_resolution.md.",
    observation_index: observationIndex,
    entity_type: entityType,
    entity_id: entityId,
  };
}
