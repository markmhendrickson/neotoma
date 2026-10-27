/**
 * What makes an observation a correction (issue #2341).
 *
 * The reducer has to tell a correction from an ordinary write using the stored
 * observation alone, so that a later correction can replace an earlier one on
 * an array field instead of unioning with it.
 *
 * This module is the single definition. It is dependency-free so that the write
 * side (`createCorrection`) and the read side (the reducer) share the same
 * constants and cannot drift apart, and so modules that mock the schema registry
 * in tests still get the real predicate.
 *
 * Why a derived predicate and not a stored flag: it needs no schema change and
 * no backfill, and it recognises every correction already in the log, because
 * `createCorrection` has always written this exact shape. A request cannot
 * produce it: every public write path (`store`, `store_structured`,
 * `createObservation`, interpretation and schema-promotion writers) stamps a
 * non-null `observation_source` (default `unspecified`) and, except for internal
 * priority-0 writers, a `source_id`. Sending `source_priority: 1000` therefore
 * does not yield the correction shape.
 */

/** `source_priority` of every correction. */
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
