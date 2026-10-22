/**
 * Shared observation-insert primitive (Domain Layer)
 *
 * Several code paths write rows into `observations`. Three of them are the
 * subject of this module:
 *
 *   1. `createObservation` (observation_storage.ts), used by the HTTP store
 *      path and other services;
 *   2. the structured-store core in the MCP server (`storeStructuredInternal`
 *      in server.ts);
 *   3. `createCorrection` (correction.ts).
 *
 * They are NOT the only inserters: other services (access-token handling,
 * deletion, schema-lag repair, interpretation, schema registry) still insert
 * into `observations` directly and are deliberately left untouched here. The
 * conditional-write change that follows is responsible for inventorying them.
 *
 * The three built the same row shape and probed for an existing
 * content-addressed row independently, which let them drift. This module holds
 * the three
 * mechanical steps they share, so there is one place that knows how an
 * observation row is assembled, how an already-persisted row is found, and how
 * the insert is issued:
 *
 *   - {@link buildObservationRow}: assemble the row.
 *   - {@link findExistingObservation}: the owner-scoped content-addressed probe.
 *   - {@link insertObservationRow}: issue the insert.
 *
 * The extraction is deliberately non-behavioural. Everything that differs by
 * site (which optional columns are supplied, the default `observation_source`,
 * whether `created_at` is set client-side, which columns the probe selects, how
 * a database error is worded or handled, whether a duplicate is detected by a
 * probe or by the unique constraint) stays at the call site and is passed in.
 * This module makes no decisions, performs no validation or authorization, and
 * adds no policy: guards, ownership checks, attribution policy and substrate
 * events remain where they were.
 */

import { db } from "../db.js";
import type { LocalDbClient } from "../repositories/sqlite/local_db_adapter.js";
import type { ObservationSource } from "../shared/action_schemas.js";

/** The query builder the shared database client hands out for a table. */
type ObservationsQuery = ReturnType<LocalDbClient["from"]>;

/**
 * Default `observation_source` applied by the write path when a caller
 * omits the field. MCP / CLI callers are LLM-driven by construction, so
 * unclassified writes land in the LLM-summary bucket. Sensors, workflow
 * state machines, humans, and ETL pipelines MUST set the field
 * explicitly — the default is deliberately non-sensor so the reducer
 * does not over-weight unclassified writes.
 */
export const DEFAULT_OBSERVATION_SOURCE: ObservationSource = "llm_summary";

/**
 * Input to {@link buildObservationRow}. The first group of columns is written
 * on every row. The second group is written only when the caller supplies it
 * (that is, when the property is not `undefined`); callers decide what counts
 * as "supplied" (for example a truthiness check) before passing a value in.
 */
export interface ObservationRowInput {
  id: string;
  entity_id: string;
  entity_type: string;
  schema_version: string;
  source_id: string | null;
  interpretation_id: string | null;
  observed_at: string;
  specificity_score: number;
  source_priority: number;
  fields: Record<string, unknown>;
  user_id: string;

  /** Already-resolved value; this module applies no default. */
  observation_source?: ObservationSource | null;
  /** Client-side `created_at`; omit to let the database default it. */
  created_at?: string;
  idempotency_key?: string | null;
  identity_basis?: string | null;
  identity_rule?: string | null;
  /** Cross-instance sync: Neotoma peer id that originated this replayed write. */
  source_peer_id?: string | null;
  /**
   * Attribution blob (see `getCurrentAttribution`). Stamped as `provenance`
   * only when it has at least one key, so a request with no identity context
   * writes no provenance column.
   */
  provenance?: object;
}

/** The persisted row shape: required columns plus whichever optionals were supplied. */
export type ObservationInsertRow = Record<string, unknown> & {
  id: string;
  entity_id: string;
  entity_type: string;
  schema_version: string;
  source_id: string | null;
  interpretation_id: string | null;
  observed_at: string;
  specificity_score: number;
  source_priority: number;
  fields: Record<string, unknown>;
  user_id: string;
};

/**
 * Assemble an `observations` row. Pure: no I/O, no clock, no request context.
 * Optional columns appear in the result only when their input is not
 * `undefined`, which keeps an unsupplied column out of the insert entirely
 * (so the database default applies) rather than writing an explicit null.
 */
export function buildObservationRow(input: ObservationRowInput): ObservationInsertRow {
  const row: ObservationInsertRow = {
    id: input.id,
    entity_id: input.entity_id,
    entity_type: input.entity_type,
    schema_version: input.schema_version,
    source_id: input.source_id,
    interpretation_id: input.interpretation_id,
    observed_at: input.observed_at,
    specificity_score: input.specificity_score,
    source_priority: input.source_priority,
    fields: input.fields,
    user_id: input.user_id,
  };
  if (input.observation_source !== undefined) row.observation_source = input.observation_source;
  if (input.created_at !== undefined) row.created_at = input.created_at;
  if (input.idempotency_key !== undefined) row.idempotency_key = input.idempotency_key;
  if (input.identity_basis !== undefined) row.identity_basis = input.identity_basis;
  if (input.identity_rule !== undefined) row.identity_rule = input.identity_rule;
  if (input.source_peer_id !== undefined) row.source_peer_id = input.source_peer_id;
  if (input.provenance !== undefined && Object.keys(input.provenance).length > 0) {
    row.provenance = input.provenance;
  }
  return row;
}

/**
 * Content-addressed existence probe: is there already an observation with this
 * id owned by this user? Observation ids are a deterministic hash of the write's
 * content, so a hit means the same content was stored before.
 *
 * The probe is scoped to `(id, user_id)` so a same-content observation owned by
 * another user never masks this user's write. Returns the database query builder
 * un-awaited (it is thenable): `await` it to get the raw `{ data, error }`
 * result. The caller owns the wording of any error it raises, and chooses the
 * columns it needs (`"*"` for a full row, `"id"` for a bare existence check).
 */
export function findExistingObservation(
  observationId: string,
  userId: string,
  columns = "*"
): ObservationsQuery {
  return db
    .from("observations")
    .select(columns)
    .eq("id", observationId)
    .eq("user_id", userId)
    .maybeSingle();
}

/**
 * Issue the insert for an assembled row. Returns the database builder
 * un-awaited so a caller can chain `.select().single()` to read the row back,
 * or await it directly and inspect `{ error }` (including a unique-violation
 * code, which the correction site uses as its replay signal).
 *
 * SECURITY: this carries NO guards. It performs a raw insert and checks nothing
 * about who is writing or what. Every caller must already have cleared instance
 * store policy, attribution policy, protected-type and agent-grant checks, and
 * the cross-owner guard before calling it; a call placed ahead of those gates
 * bypasses them. Structural tests pin that ordering at the three current sites.
 */
export function insertObservationRow(row: ObservationInsertRow): ObservationsQuery {
  return db.from("observations").insert(row);
}
