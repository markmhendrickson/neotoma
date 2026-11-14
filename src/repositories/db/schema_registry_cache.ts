/**
 * In-memory read-through cache for active `schema_registry` lookups.
 *
 * Why: every stored entity resolves its schema four to eight times, and a
 * correction resolves it inside its write transaction, while the gate is held.
 * Each resolve was two registry queries. Serving repeats from memory removes
 * those round trips from the write path.
 *
 * Correctness rules, in the order they are applied:
 *
 * 1. Keys are built by the caller and always carry the scope and, for a
 *    user-scoped lookup, the user id. One user's row is never stored under a
 *    key another user's lookup can build.
 * 2. Entries live per database handle (`getDb()` result). A different handle
 *    (a reopened connection, a lifecycle-bound database, a test's fresh file)
 *    starts empty.
 * 3. Every write to `schema_registry` through the query adapter brackets
 *    itself with {@link beginSchemaRegistryWrite}. While any such write is
 *    unsettled, lookups bypass the cache entirely (no hit, no fill). The
 *    write counts as settled when its statement returns, or, inside a
 *    transaction, when that transaction commits or rolls back. Each bracket
 *    edge also bumps a generation, so a lookup that started before or during
 *    the write never stores what it read.
 * 4. Writes that bypass the adapter (raw SQL, another process on the same
 *    file, such as the CLI's `access set`) are caught by a change counter
 *    that triggers on `schema_registry` maintain (see sqlite_client.ts).
 *    The counter is re-read at most once per check interval
 *    ({@link SCHEMA_REGISTRY_CACHE_CHECK_INTERVAL_MS} by default); a change
 *    clears the entries. So a write from outside this process is visible
 *    within that interval, and a write through the adapter inside it is
 *    visible at once.
 * 5. If the counter cannot be read (an older database without it, a fixture
 *    built without `ensureSchema`), the cache is not used for that handle.
 *    Failure means a database read, never a cached answer.
 * 6. Values are deep-copied in and out, so a caller that mutates a returned
 *    row cannot change what the next caller sees.
 *
 * Set `NEOTOMA_SCHEMA_REGISTRY_CACHE=off` to disable it.
 */

import { getDb } from "./connection.js";
import type { DbDatabase } from "./driver.js";
import { deferUntilCurrentTransactionSettles } from "./driver.js";

export const SCHEMA_REGISTRY_CHANGE_COUNTER_TABLE = "schema_registry_change_counter";

/**
 * Default for how often a cached handle re-reads the change counter, and so
 * the longest a write from another process can go unseen. Override with
 * `NEOTOMA_SCHEMA_REGISTRY_CACHE_CHECK_MS` (0 re-reads it on every lookup).
 */
export const SCHEMA_REGISTRY_CACHE_CHECK_INTERVAL_MS = 250;

const STAMP_SQL = `SELECT version FROM ${SCHEMA_REGISTRY_CHANGE_COUNTER_TABLE} WHERE id = 1`;

interface Bucket {
  generation: number;
  /** Change-counter value the entries were read under; undefined until first check. */
  stamp: number | undefined;
  checkedAt: number;
  pendingCheck: Promise<boolean> | null;
  entries: Map<string, unknown>;
}

let generation = 0;
let unsettledWrites = 0;
let checkIntervalOverrideMs: number | null = null;
const buckets = new WeakMap<DbDatabase, Bucket>();

const counters = { hits: 0, misses: 0, bypasses: 0, invalidations: 0 };

function cacheDisabled(): boolean {
  const value = process.env.NEOTOMA_SCHEMA_REGISTRY_CACHE?.trim().toLowerCase();
  return value === "off" || value === "0" || value === "false";
}

function checkIntervalMs(): number {
  if (checkIntervalOverrideMs !== null) return checkIntervalOverrideMs;
  const raw = process.env.NEOTOMA_SCHEMA_REGISTRY_CACHE_CHECK_MS?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.min(parsed, 60_000);
  }
  return SCHEMA_REGISTRY_CACHE_CHECK_INTERVAL_MS;
}

function copy<T>(value: T): T {
  return value == null ? value : structuredClone(value);
}

/** Drop every cached entry, for every database handle. */
export function invalidateSchemaRegistryCache(): void {
  generation += 1;
  counters.invalidations += 1;
}

/**
 * Mark the start of a write to `schema_registry`. Call the returned function
 * once the statement has returned (whether it succeeded or failed). Lookups
 * bypass the cache until the write settles, as described in rule 3 above.
 */
export function beginSchemaRegistryWrite(): () => void {
  unsettledWrites += 1;
  invalidateSchemaRegistryCache();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    const settle = () => {
      unsettledWrites -= 1;
      invalidateSchemaRegistryCache();
    };
    if (!deferUntilCurrentTransactionSettles(settle)) settle();
  };
}

async function readStamp(database: DbDatabase): Promise<number | null> {
  try {
    const row = (await database.prepare(STAMP_SQL).get()) as { version?: unknown } | undefined;
    const version = row?.version;
    if (typeof version === "number" && Number.isFinite(version)) return version;
    if (typeof version === "bigint") return Number(version);
    return null;
  } catch {
    return null;
  }
}

function bucketFor(database: DbDatabase, atGeneration: number): Bucket {
  let bucket = buckets.get(database);
  if (!bucket || bucket.generation !== atGeneration) {
    bucket = {
      generation: atGeneration,
      stamp: undefined,
      checkedAt: 0,
      pendingCheck: null,
      entries: new Map(),
    };
    buckets.set(database, bucket);
  }
  return bucket;
}

/** Re-read the change counter when due. Resolves false when the cache must not be used. */
async function validate(database: DbDatabase, bucket: Bucket): Promise<boolean> {
  if (bucket.stamp !== undefined && Date.now() - bucket.checkedAt < checkIntervalMs()) return true;
  if (!bucket.pendingCheck) {
    bucket.pendingCheck = (async () => {
      const stamp = await readStamp(database);
      if (stamp === null) return false;
      if (bucket.stamp !== undefined && bucket.stamp !== stamp) bucket.entries.clear();
      bucket.stamp = stamp;
      bucket.checkedAt = Date.now();
      return true;
    })().finally(() => {
      bucket.pendingCheck = null;
    });
  }
  return bucket.pendingCheck;
}

/**
 * Serve `key` from the cache, or run `load` and remember its result.
 * `load` must be a pure read of committed `schema_registry` rows for exactly
 * the scope `key` names. A thrown error is never cached.
 */
export async function readThroughSchemaRegistryCache<T>(
  key: string,
  load: () => Promise<T>
): Promise<T> {
  if (cacheDisabled() || unsettledWrites > 0) {
    counters.bypasses += 1;
    return load();
  }
  const database = await getDb();
  const startGeneration = generation;
  const bucket = bucketFor(database, startGeneration);
  const usable = await validate(database, bucket);
  if (!usable || generation !== startGeneration || unsettledWrites > 0) {
    counters.bypasses += 1;
    return load();
  }
  if (bucket.entries.has(key)) {
    counters.hits += 1;
    return copy(bucket.entries.get(key) as T);
  }
  counters.misses += 1;
  const stampBefore = bucket.stamp;
  const value = await load();
  if (
    generation === startGeneration &&
    unsettledWrites === 0 &&
    buckets.get(database) === bucket &&
    bucket.stamp === stampBefore
  ) {
    bucket.entries.set(key, copy(value));
  }
  return value;
}

/** Test-only: counters since the last reset. */
export function schemaRegistryCacheStatsForTests(): Readonly<typeof counters> {
  return { ...counters };
}

/** Test-only: reset counters and drop all entries. Optionally change the counter re-read interval. */
export function resetSchemaRegistryCacheForTests(options?: { checkIntervalMs?: number }): void {
  counters.hits = 0;
  counters.misses = 0;
  counters.bypasses = 0;
  counters.invalidations = 0;
  checkIntervalOverrideMs = options?.checkIntervalMs ?? null;
  invalidateSchemaRegistryCache();
}
