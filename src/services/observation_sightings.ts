/**
 * No-op store suppression with a seen-again marker (#2792).
 *
 * A sync job that re-stores unchanged records appends one observation per
 * record per pass, although nothing a reader can see has changed. This module
 * decides when an incoming observation is such a repeat and records that it
 * was seen again instead of appending it.
 *
 * Observations stay append-only and immutable. The marker lives in the side
 * table `observation_sightings`, keyed by the observation that was repeated
 * and its owner: one row per repeated observation, upserted on every
 * suppressed store. `seen_count` counts the repeats (the original write is not
 * a sighting), `first_seen_again_at` / `last_seen_at` bound them, and
 * `last_source_id` names the source of the latest repeat.
 *
 * ## When a store is suppressed
 *
 * Only when ALL of these hold; otherwise the store appends as it always did:
 *
 *  - the instance policy switch `suppress_noop_observations` is not false
 *    (default on; an unreadable policy means off);
 *  - the entity's current top observation T exists. T is the newest observation
 *    at the entity's highest `source_priority`, and it must also be the newest
 *    observation of the entity overall (the `last_write` strategy ignores
 *    priority, so a newer lower-priority row could otherwise be re-ordered by
 *    the repeat);
 *  - same owner, entity type, schema version, `source_priority`,
 *    `specificity_score` and `observation_source` as T, and no peer origin on
 *    either side (a replayed sync write keeps its own chain);
 *  - the incoming fields are deep-equal to T's fields (canonical JSON, key
 *    order independent);
 *  - T is an ordinary factual store row: no lifecycle authority tuple, no
 *    `_deleted` / `_encrypted` marker, not a correction, and not a conditional
 *    write (no `canonical_hash`), with a source of its own. The incoming fields
 *    carry none of those markers either.
 *
 * Why this cannot change a reader's answer. The incoming row would tie T on
 * every merge key (priority, specificity, source rank) and be newer than T,
 * which is already the newest row overall. For `last_write` the winner is the
 * newest row carrying the field: T's value, which the repeat equals. For
 * `highest_priority` and `most_specific` the repeat ties T on everything but
 * time, so it wins exactly where T wins and loses exactly where T loses, with
 * T's value. `merge_array` unions top-priority members: a repeat of T adds
 * none. What does change is bookkeeping: `observation_count` and the snapshot's
 * `last_observation_at` keep their meaning (observation ROWS), so a sighting
 * does not move them; the sighting's own `last_seen_at` carries "last
 * confirmed". Field provenance keeps pointing at the observation that decided
 * each field, which is the repeated one.
 *
 * Deliberately NOT suppressed: any entity that has a deletion, restore or
 * correction row (those write at priority 1000, above every ordinary store),
 * a store at a different priority than T, a field changed and changed back
 * (A, B, A stores all three: the repeat of A is compared with B), and every
 * write path other than the two structured stores (conditional store,
 * corrections, merges, splits, interpretation, peer replay).
 */

import { db } from "../db.js";
import { getDb } from "../repositories/db/connection.js";
import { isCorrectionObservation } from "./correction_identity.js";
import { getInstancePolicyResult } from "./instance_policy.js";
import { logger } from "../utils/logger.js";

/** Reserved field keys: a row carrying one is lifecycle or erasure state, never a plain repeat. */
const RESERVED_FIELD_KEYS = ["_deleted", "_encrypted"] as const;

/**
 * Whether no-op suppression is on for this instance. Default on; the instance
 * policy's `suppress_noop_observations: false` turns it off. A policy that
 * cannot be read means off: storing is the behaviour every client already
 * relies on, so uncertainty falls back to it.
 */
export async function isNoopSuppressionEnabled(): Promise<boolean> {
  try {
    const result = await getInstancePolicyResult();
    if (result.lookup_failed) return false;
    return result.policy?.suppress_noop_observations !== false;
  } catch {
    return false;
  }
}

/** JSON with object keys sorted at every depth, so key order cannot matter. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

function carriesReservedKey(fields: unknown): boolean {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return true;
  return RESERVED_FIELD_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(fields as Record<string, unknown>, key)
  );
}

export interface NoopCandidate {
  userId: string;
  entityId: string;
  entityType: string;
  schemaVersion: string;
  fields: Record<string, unknown>;
  sourcePriority: number;
  specificityScore: number;
  observationSource: string;
  sourcePeerId?: string | null;
}

interface TopRow {
  id: string;
  entity_id: string;
  entity_type: string;
  schema_version: string;
  source_id: string | null;
  observed_at: string;
  specificity_score: number | null;
  source_priority: number | null;
  observation_source: string | null;
  fields: unknown;
  source_peer_id?: string | null;
  canonical_hash?: string | null;
  interpretation_id?: string | null;
  entity_lifecycle_kind?: string | null;
  entity_lifecycle_sequence?: number | null;
  entity_lifecycle_target_id?: string | null;
}

/**
 * The existing observation an incoming write would only repeat, or null when
 * the write must be stored. Never throws: any doubt (a read error, an
 * unexpected row shape) answers null, which stores as today.
 */
export async function findRepeatedObservation(
  candidate: NoopCandidate
): Promise<{ id: string; row: Record<string, unknown> } | null> {
  try {
    if (candidate.sourcePeerId) return null;
    if (carriesReservedKey(candidate.fields)) return null;

    // Newest observation at the highest priority. idx_observations_entity_id
    // (entity_id, source_priority, observed_at) serves this as one seek.
    const { data: top, error: topError } = await db
      .from("observations")
      .select("*")
      .eq("entity_id", candidate.entityId)
      .eq("user_id", candidate.userId)
      .order("source_priority", { ascending: false })
      .order("observed_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(1);
    if (topError || !top || top.length === 0) return null;
    const row = top[0] as TopRow;

    if (row.entity_type !== candidate.entityType) return null;
    if (row.schema_version !== candidate.schemaVersion) return null;
    if (row.source_priority !== candidate.sourcePriority) return null;
    if (row.specificity_score !== candidate.specificityScore) return null;
    if ((row.observation_source ?? null) !== candidate.observationSource) return null;
    if (!row.source_id) return null;
    if (row.source_peer_id) return null;
    if (row.canonical_hash) return null;
    if (
      row.entity_lifecycle_kind != null ||
      row.entity_lifecycle_sequence != null ||
      row.entity_lifecycle_target_id != null
    )
      return null;
    if (carriesReservedKey(row.fields)) return null;
    if (
      isCorrectionObservation({
        source_id: row.source_id,
        interpretation_id: row.interpretation_id ?? null,
        observation_source: row.observation_source,
        source_priority: row.source_priority,
        specificity_score: row.specificity_score,
      })
    )
      return null;
    if (canonicalJson(row.fields) !== canonicalJson(candidate.fields)) return null;

    // T must also be the newest row overall. Index-only: the entity's rows are
    // read from idx_observations_entity_id, never fetched.
    const { data: newer, error: newerError } = await db
      .from("observations")
      .select("id")
      .eq("entity_id", candidate.entityId)
      .eq("user_id", candidate.userId)
      .gte("observed_at", row.observed_at)
      .not("id", "eq", row.id)
      .limit(1);
    if (newerError || (newer && newer.length > 0)) return null;

    return { id: row.id, row: row as unknown as Record<string, unknown> };
  } catch (error) {
    logger.warn(
      `[observation_sightings] suppression check failed, storing instead: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

export interface Sighting {
  observation_id: string;
  seen_count: number;
  first_seen_again_at: string;
  last_seen_at: string;
  last_source_id: string | null;
}

/** Upsert the seen-again marker for a repeated observation and return it. */
export async function recordSighting(params: {
  observationId: string;
  userId: string;
  entityId: string;
  sourceId: string | null;
  at?: string;
}): Promise<Sighting> {
  const at = params.at ?? new Date().toISOString();
  const database = await getDb();
  await database
    .prepare(
      `INSERT INTO observation_sightings
         (observation_id, user_id, entity_id, seen_count, first_seen_again_at, last_seen_at, last_source_id)
       VALUES (?, ?, ?, 1, ?, ?, ?)
       ON CONFLICT(observation_id, user_id) DO UPDATE SET
         seen_count = seen_count + 1,
         last_seen_at = excluded.last_seen_at,
         last_source_id = excluded.last_source_id`
    )
    .run(params.observationId, params.userId, params.entityId, at, at, params.sourceId);
  const row = (await database
    .prepare(
      "SELECT observation_id, seen_count, first_seen_again_at, last_seen_at, last_source_id FROM observation_sightings WHERE observation_id = ? AND user_id = ?"
    )
    .get(params.observationId, params.userId)) as Sighting | undefined;
  if (!row) throw new Error("Failed to read back the sighting just recorded.");
  return row;
}

/** The seen-again markers for some observations of one owner, keyed by observation id. */
export async function getSightings(
  observationIds: readonly string[],
  userId: string
): Promise<Map<string, Sighting>> {
  const result = new Map<string, Sighting>();
  if (observationIds.length === 0) return result;
  const database = await getDb();
  for (let i = 0; i < observationIds.length; i += 400) {
    const part = observationIds.slice(i, i + 400);
    const rows = (await database
      .prepare(
        `SELECT observation_id, seen_count, first_seen_again_at, last_seen_at, last_source_id
           FROM observation_sightings
          WHERE user_id = ? AND observation_id IN (${part.map(() => "?").join(",")})`
      )
      .all(userId, ...part)) as Sighting[];
    for (const row of rows) result.set(row.observation_id, row);
  }
  return result;
}

/**
 * Attach `seen_again` ({ seen_count, first_seen_again_at, last_seen_at }) to
 * observation rows that have been seen again. Rows without a sighting are
 * returned untouched, so existing fields and consumers are unaffected. A read
 * failure leaves the rows as they were rather than failing the listing.
 */
export async function attachSightings<T extends { id?: unknown }>(
  observations: T[],
  userId: string
): Promise<
  Array<T & { seen_again?: Pick<Sighting, "seen_count" | "first_seen_again_at" | "last_seen_at"> }>
> {
  const ids = observations.map((o) => o.id).filter((id): id is string => typeof id === "string");
  let sightings: Map<string, Sighting>;
  try {
    sightings = await getSightings(ids, userId);
  } catch (error) {
    logger.warn(
      `[observation_sightings] could not read sightings: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return observations;
  }
  if (sightings.size === 0) return observations;
  return observations.map((o) => {
    const s = typeof o.id === "string" ? sightings.get(o.id) : undefined;
    return s
      ? {
          ...o,
          seen_again: {
            seen_count: s.seen_count,
            first_seen_again_at: s.first_seen_again_at,
            last_seen_at: s.last_seen_at,
          },
        }
      : o;
  });
}
