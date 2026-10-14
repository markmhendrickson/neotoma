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
import {
  currentDbAbortSignal,
  detachDbAbortSignal,
} from "../repositories/worker/worker_file_database.js";

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

/** What an unfinished keyed store left behind, for the caller's recovery. */
export interface UnfinishedStoreSummary {
  source_id: string;
  entities_requested: number;
  entities_written: number;
  /** Zero-based positions in the request's `entities` array that have no observation yet. */
  missing_entity_indexes: number[];
}

/**
 * Work out which of a request's entities already have an observation on the
 * keyed source, so `ERR_STORE_WRITE_INCOMPLETE` can tell the caller exactly
 * what to resend. Best effort and conservative: an entity whose identity
 * cannot be resolved is reported as missing, never as written.
 */
export async function summarizeUnfinishedStore(params: {
  userId: string;
  sourceId: string;
  entities: Array<Record<string, unknown>>;
}): Promise<UnfinishedStoreSummary> {
  const { listObservationsForSource } = await import("./observation_storage.js");
  const { resolveEntityWithTrace } = await import("./entity_resolution.js");
  const observations = await listObservationsForSource(params.sourceId, params.userId);
  const written = new Set(observations.map((o: { entity_id: string }) => o.entity_id));
  const missing: number[] = [];
  for (let index = 0; index < params.entities.length; index++) {
    const raw = params.entities[index] ?? {};
    const entityType =
      (typeof raw.entity_type === "string" && raw.entity_type) ||
      (typeof raw.type === "string" && raw.type) ||
      "generic";
    const targetId = typeof raw.target_id === "string" ? raw.target_id : undefined;
    const fields: Record<string, unknown> = { ...raw };
    for (const key of ["entity_type", "type", "intent", "schema_version", "target_id"]) {
      delete fields[key];
    }
    try {
      const { entityId } = await resolveEntityWithTrace({
        entityType,
        fields,
        userId: params.userId,
        commit: false,
        targetId,
      });
      if (!written.has(entityId)) missing.push(index);
    } catch {
      missing.push(index);
    }
  }
  return {
    source_id: params.sourceId,
    entities_requested: params.entities.length,
    entities_written: params.entities.length - missing.length,
    missing_entity_indexes: missing,
  };
}

/**
 * Recovery text for `ERR_STORE_WRITE_INCOMPLETE`, shared by HTTP and MCP.
 *
 * Relationships are written only after every entity, so an interrupted request
 * never wrote any of its relationships, and they address entities by position
 * in the original request. They cannot be resent by position after a partial
 * resend, so the advice is to recreate them by entity id.
 */
export function incompleteStoreHint(summary: UnfinishedStoreSummary): string {
  const relationships =
    "The original request's relationships were not written; recreate them separately, " +
    "referencing the entities by entity id.";
  if (summary.missing_entity_indexes.length === 0) {
    return (
      "All of the request's entities are stored; only its relationships may be missing. " +
      "Do not resend the entities. " +
      relationships
    );
  }
  return (
    `Resend ONLY the entities at request positions [${summary.missing_entity_indexes.join(", ")}] ` +
    "under a new idempotency_key. Resending the full payload writes a second set of " +
    `observations to the ${summary.entities_written} entities already written. ` +
    relationships
  );
}

const inFlightWrites = new Map<string, Promise<unknown>>();

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted", "AbortError");
}

/** Resolve when `prior` settles; reject as soon as `signal` aborts. */
function waitForPrior(prior: Promise<unknown>, signal: AbortSignal | undefined): Promise<void> {
  const settled = prior.then(
    () => undefined,
    () => undefined
  );
  if (!signal) return settled;
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    void settled.then(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    });
  });
}

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
 * A call that has to wait still honours ITS OWN hang-up: if its request is
 * cancelled while it is queued, it stops waiting and never starts a write.
 * Only a write that has started is detached from the signal. Without this,
 * several impatient retries queued behind one failing write would each re-run
 * it for a client that is no longer there.
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
  // JSON-encoded pair: no (user, key) pair of strings can collide with another.
  const flightKey = JSON.stringify([userId, idempotencyKey]);
  const callerSignal = currentDbAbortSignal();
  let waited = false;
  for (;;) {
    const prior = inFlightWrites.get(flightKey);
    if (!prior) break;
    waited = true;
    // Rejects as soon as this caller's own request is cancelled, so a queued
    // call never reaches the write below for a client that has gone.
    await waitForPrior(prior, callerSignal);
  }
  // A hang-up that lands at the instant the predecessor settles resolves the
  // wait before the abort listener can reject it. Check once more, before
  // detaching, so a queued call for a client that has gone never starts a write.
  if (waited && callerSignal?.aborted) throw abortReason(callerSignal);
  const running = detachDbAbortSignal(write);
  inFlightWrites.set(flightKey, running);
  try {
    return await running;
  } finally {
    if (inFlightWrites.get(flightKey) === running) inFlightWrites.delete(flightKey);
  }
}
