/**
 * Completion tracking for the structured store write (#2144).
 *
 * `storeStructuredForApi` persists the `sources` row that carries the
 * idempotency key BEFORE any observation exists, and the write loop that
 * follows is not one transaction (it interleaves reads, embedding work and
 * event emission, which a transaction would hold the database's global write
 * gate across). So a loop that stopped part way used to leave a key that
 * looked finished: a replay compared only `content_hash` and answered
 * `success: true, replayed: true` with whatever observations existed, and the
 * entities that never got one stayed behind as empty shells.
 *
 * The source row now records whether the write finished:
 *
 *   - `in_progress` is stamped on the row in the same insert that creates it.
 *   - `complete` replaces it only after every entity's observation (and the
 *     request's relationships) has been written.
 *
 * A replay that finds `in_progress` does not treat the key as done. Rows
 * written before this marker existed carry neither state; for those the replay
 * falls back to counting observations against the request (see
 * {@link legacyWriteLooksIncomplete}).
 *
 * The marker lives in the existing `sources.provenance` JSON column on
 * purpose: it needs no schema migration, and unlike the observations it
 * describes, the source row's provenance is bookkeeping about the ingest, not
 * a fact about the world, so marking it complete does not touch the
 * immutability of observations or of the stored bytes.
 */

import { db } from "../db.js";
import { detachDbAbortSignal } from "../repositories/worker/worker_file_database.js";

export const STORE_WRITE_PROVENANCE_KEY = "store_write";

export type StoreWriteState = "in_progress" | "complete";

/** Provenance fragment stamped on a freshly inserted source row. */
export function inProgressStoreWriteProvenance(): Record<string, unknown> {
  return { [STORE_WRITE_PROVENANCE_KEY]: { state: "in_progress" } };
}

/** The recorded state, or `undefined` for a row written before the marker existed. */
export function readStoreWriteState(provenance: unknown): StoreWriteState | undefined {
  if (!provenance || typeof provenance !== "object") return undefined;
  const marker = (provenance as Record<string, unknown>)[STORE_WRITE_PROVENANCE_KEY];
  if (!marker || typeof marker !== "object") return undefined;
  const state = (marker as { state?: unknown }).state;
  return state === "in_progress" || state === "complete" ? state : undefined;
}

/**
 * Fallback for a source written before the marker existed: with no recorded
 * state the only evidence is how many observations landed. The request's
 * distinct entity payloads are the expected count, because identical payloads
 * collapse to one deterministic observation id and so legitimately yield fewer
 * rows than entities.
 *
 * Only meaningful when the observations were written against the keyed source
 * itself. A write whose observations live on another (interpretation) source
 * cannot be counted from here, so it is left as it was: the caller passes
 * `observationsOnKeyedSource: false` and gets "not incomplete".
 */
export function legacyWriteLooksIncomplete(params: {
  entities: unknown[];
  observationCount: number;
  observationsOnKeyedSource: boolean;
}): boolean {
  if (!params.observationsOnKeyedSource) return false;
  const distinct = new Set(
    params.entities.map((entity) =>
      JSON.stringify(entity, (_key, value) => (typeof value === "bigint" ? Number(value) : value))
    )
  );
  return params.observationCount < distinct.size;
}

/**
 * Record that every observation for the keyed source has been written.
 * Throws if the marker cannot be persisted: the caller then reports an error
 * rather than a success the next replay could not confirm, and that replay
 * finishes idempotently (observation ids are deterministic).
 */
export async function markStoreWriteComplete(sourceId: string, userId: string): Promise<void> {
  const { data: row, error: readError } = await db
    .from("sources")
    .select("provenance")
    .eq("id", sourceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) {
    throw new Error(`Failed to read source for completion marker: ${readError.message}`);
  }
  if (!row) {
    throw new Error(`Cannot mark store write complete: source ${sourceId} not found`);
  }
  if (readStoreWriteState(row.provenance) === "complete") return;

  const previous =
    row.provenance && typeof row.provenance === "object"
      ? (row.provenance as Record<string, unknown>)
      : {};
  const { error: updateError } = await db
    .from("sources")
    .update({
      provenance: {
        ...previous,
        [STORE_WRITE_PROVENANCE_KEY]: {
          state: "complete",
          completed_at: new Date().toISOString(),
        },
      },
    })
    .eq("id", sourceId)
    .eq("user_id", userId);
  if (updateError) {
    throw new Error(`Failed to mark store write complete: ${updateError.message}`);
  }

  // Read it back: a 2xx-shaped result is not evidence the field landed.
  const { data: after } = await db
    .from("sources")
    .select("provenance")
    .eq("id", sourceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (readStoreWriteState(after?.provenance) !== "complete") {
    throw new Error(`Store write completion marker did not persist for source ${sourceId}`);
  }
}

const inFlightWrites = new Map<string, Promise<unknown>>();

/**
 * Run a keyed store write so that
 *   (a) the request's abort signal cannot cancel it once it starts, and
 *   (b) a second call for the same (user, idempotency key) waits for the first
 *       to settle instead of racing it.
 *
 * (b) matters because the usual reason a key is replayed is that the client's
 * first attempt timed out while the server was still writing. Without it the
 * replay sees a half-written source and either reports the half as done or
 * starts a second writer beside the first. Waiting means the replay then reads
 * the finished (or, if the first attempt failed, the still-`in_progress`) state.
 *
 * In-process only. A second process writing the same database file with the
 * same key at the same moment is not coordinated here; observation ids are
 * deterministic, so the worst case there is a UNIQUE conflict surfaced as an
 * error, not a silent duplicate.
 */
export async function runKeyedStoreWrite<T>(
  userId: string,
  idempotencyKey: string,
  write: () => Promise<T>
): Promise<T> {
  const flightKey = `${userId}\u0000${idempotencyKey}`;
  for (;;) {
    const prior = inFlightWrites.get(flightKey);
    if (!prior) break;
    await prior.catch(() => undefined);
  }
  const running = detachDbAbortSignal(write);
  inFlightWrites.set(flightKey, running);
  try {
    return await running;
  } finally {
    if (inFlightWrites.get(flightKey) === running) inFlightWrites.delete(flightKey);
  }
}
