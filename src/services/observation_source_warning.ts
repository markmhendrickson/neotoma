/**
 * observation_source_warning.ts
 *
 * Pure helper for the OBSERVATION_SOURCE_OMITTED write-time warning (#2241).
 *
 * `observation_source` records what KIND of write produced an observation.
 * Until #2241 a store request that omitted the field was recorded as
 * `llm_summary`, turning silence into a positive and frequently false claim
 * that a language model produced the value. The write path now records
 * omission as `unspecified` and tells the caller so, through one
 * `store_warnings[]` entry per request.
 *
 * Two rules this module exists to keep in one place, so the HTTP
 * (`src/actions.ts`), MCP (`src/server.ts`) and conditional
 * (`src/services/store_conditional.ts`) store paths cannot drift apart:
 *
 *  1. Omission is judged on the RAW parsed request value, before any
 *     default is applied. A caller that sends `"unspecified"` explicitly made
 *     a choice and gets no warning; only `undefined` (field absent) warns.
 *     Re-deriving omission from the persisted value would be wrong, because
 *     an explicit `unspecified` and an omitted field persist identically.
 *  2. `observation_source` is request-scoped: one value applies to every
 *     observation in the request. So the warning is emitted ONCE per store
 *     call, naming the first stored entity, never once per entity.
 *
 * The message is a static template. It never interpolates entity field
 * values, file paths or tokens, so a store response relayed to a log or
 * webhook cannot leak observation content through it.
 */

import { DEFAULT_OBSERVATION_SOURCE } from "./observation_insert.js";

export const OBSERVATION_SOURCE_OMITTED_CODE = "OBSERVATION_SOURCE_OMITTED" as const;

/**
 * The shape of the store_warnings[] entry emitted for an omitted
 * `observation_source`. Same shape as SOURCE_PRIORITY_IGNORED and the other
 * store-path warning codes.
 */
export type ObservationSourceOmittedWarning = {
  code: typeof OBSERVATION_SOURCE_OMITTED_CODE;
  message: string;
  observation_index: number;
  entity_type: string;
  entity_id: string;
};

/**
 * True when the caller did not supply `observation_source` at all.
 *
 * Pass the value exactly as parsed from the request, before any default is
 * applied. `null` is treated as omission too: the store schemas do not accept
 * it, but internal callers forward `null` to mean "not supplied", and the
 * write path applies the default to it.
 */
export function wasObservationSourceOmitted(rawObservationSource: unknown): boolean {
  return rawObservationSource === undefined || rawObservationSource === null;
}

export const OBSERVATION_SOURCE_OMITTED_MESSAGE =
  `This request omitted observation_source, so every observation in the request ` +
  `(not just the entity named here) was stored with observation_source ` +
  `"${DEFAULT_OBSERVATION_SOURCE}" (the caller did not say what kind of write this was). ` +
  `Set observation_source on the request to record lineage: ` +
  `"llm_summary" for content a language model authored, "import" for batch or ETL ` +
  `loads, "sensor" for tool or telemetry emissions, "workflow_state" for state-machine ` +
  `transitions, "human" for direct human edits, "sync" for peer replication. ` +
  `If you cannot say which applies, send "${DEFAULT_OBSERVATION_SOURCE}": it is a valid ` +
  `value that records the omission deliberately and suppresses this warning. ` +
  `Do not pick a classified value just to clear the warning.`;

/**
 * Returns the single store_warnings[] entry for a request that omitted
 * `observation_source`, or `null` when no warning is warranted (the caller
 * sent a value, or nothing was stored to point at).
 */
export function buildObservationSourceOmittedWarning(opts: {
  rawObservationSource: unknown;
  firstStored: { observation_index: number; entity_type: string; entity_id: string } | undefined;
}): ObservationSourceOmittedWarning | null {
  if (!wasObservationSourceOmitted(opts.rawObservationSource)) return null;
  if (!opts.firstStored) return null;
  return {
    code: OBSERVATION_SOURCE_OMITTED_CODE,
    message: OBSERVATION_SOURCE_OMITTED_MESSAGE,
    observation_index: opts.firstStored.observation_index,
    entity_type: opts.firstStored.entity_type,
    entity_id: opts.firstStored.entity_id,
  };
}
