/**
 * What makes an observation a correction (issue #2033).
 *
 * A correction is authoritative on its field until a later correction for the
 * same field replaces it, whatever merge rule the field declares. To honour
 * that, the reducer has to tell a correction from an ordinary write, and it has
 * to do so from the stored observation alone.
 *
 * This module is the single definition. It is dependency-free so that the
 * write side (`createCorrection`) and the read side (the reducer) share the
 * same constants and cannot drift apart, and so that modules which mock the
 * schema registry in tests still get the real predicate.
 *
 * Why a derived predicate and not a stored flag: it needs no schema change, it
 * needs no backfill, and it recognises every correction already in the log,
 * because `createCorrection` has always written this exact shape. Nothing a
 * caller can send reaches it:
 *
 *   - Every public write path (`store`, `store_structured`, `createObservation`,
 *     the interpretation and schema-promotion writers) stamps a non-null
 *     `observation_source` (defaulting to `unspecified`) and, except where the
 *     writer is an internal one at priority 0, a `source_id`. A request cannot
 *     send `source_priority: 1000` and obtain the correction shape, because it
 *     cannot send a null `observation_source`.
 *   - Deletion and restore observations carry no `specificity_score` and write
 *     priorities 1000 and 1001 respectively; neither matches, and neither
 *     writes a schema field the reducer merges.
 *
 * The integration suite pins this against real rows: a correction written by
 * `createCorrection` satisfies the predicate, and writes that go through the
 * public store paths at the same priority do not.
 */

/**
 * The rule as agents read it, in the `correct` tool description (MCP), the YAML
 * mirror and the MCP spec. One definition so the prose cannot drift from the reducer:
 * a test fails if any of those surfaces stops carrying it, including the array
 * exception (merge_array and merge_array_by_key still union corrections, #2341).
 */
export const CORRECTION_RULE_TEXT =
  "A correction stays authoritative on its field, whatever the field's merge rule and whatever the priority or source kind of any other write, until a later correction replaces it (array fields excepted: corrections union, #2341); among corrections the later one wins by deterministic recency for scalar fields.";

/** `source_priority` of every correction. The highest tier any in-tree writer uses for field data. */
export const CORRECTION_SOURCE_PRIORITY = 1000;

/** `specificity_score` of every correction. */
export const CORRECTION_SPECIFICITY_SCORE = 1.0;

/**
 * The columns the predicate reads. Loaders differ in what they carry through
 * (some flatten a null `source_id` to an empty string, some omit
 * `interpretation_id`), so absence and emptiness both count as "none".
 */
export interface CorrectionIdentityFields {
  source_id?: string | null;
  interpretation_id?: string | null;
  observation_source?: string | null;
  source_priority?: number | null;
  specificity_score?: number | null;
}

/**
 * True when the observation has the shape `createCorrection` writes: no source
 * document, no interpretation run, no declared `observation_source`, priority
 * 1000, specificity 1.0.
 */
export function isCorrectionObservation(obs: CorrectionIdentityFields): boolean {
  return (
    obs.source_priority === CORRECTION_SOURCE_PRIORITY &&
    obs.specificity_score === CORRECTION_SPECIFICITY_SCORE &&
    !obs.source_id &&
    !obs.interpretation_id &&
    !obs.observation_source
  );
}
