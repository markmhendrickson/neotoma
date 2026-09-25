/**
 * Reads of user-owned rows by a caller-supplied id, scoped to one user.
 *
 * Every helper here filters on `user_id` and treats a row owned by another
 * user exactly like a row that does not exist: it returns `null` (or omits
 * the id), and callers map that to the same not-found response they already
 * give for a missing id. Nothing in a response may differ between "absent"
 * and "belongs to someone else".
 *
 * Use these in handlers that look a row up by an id the caller chose,
 * instead of writing the `.eq("user_id", userId)` filter inline each time.
 */

import { db } from "../db.js";

/**
 * Thrown when an entity id the caller named does not resolve to an entity
 * the caller owns. The message is identical for a missing entity and for one
 * owned by another user.
 */
export class OwnedEntityNotFoundError extends Error {
  readonly code = "ENTITY_NOT_FOUND";
  readonly statusCode = 404;
  readonly entityId: string;

  constructor(entityId: string) {
    super(`Entity not found: ${entityId}`);
    this.name = "OwnedEntityNotFoundError";
    this.entityId = entityId;
  }
}

/**
 * Fetch one `sources` row by id, only if `userId` owns it.
 * Returns `null` for a missing source and for another user's source alike.
 */
export async function getOwnedSource<T = Record<string, unknown>>(
  sourceId: string,
  userId: string,
  columns: string = "*"
): Promise<T | null> {
  const { data, error } = await db
    .from("sources")
    .select(columns)
    .eq("id", sourceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to look up source: ${error.message}`);
  }
  return (data as T | null) ?? null;
}

/**
 * Storage bucket that raw source content is written to (see
 * `storeRawContent`). A source row's `storage_url` is the object key within it.
 */
export const SOURCES_STORAGE_BUCKET = "sources";

/**
 * Return the `sources` row whose `storage_url` matches a caller-supplied
 * storage path, only if `userId` owns it. Accepts the path with or without a
 * leading bucket segment (`sources/<key>` or `<key>`), since callers have
 * historically passed both forms. Returns `null` when no owned row matches.
 *
 * Callers must sign or read the returned row's `storage_url` (in
 * {@link SOURCES_STORAGE_BUCKET}), not the path they were given: the match
 * ignores the first segment, so the input string is not the checked location.
 */
export async function getOwnedSourceByStoragePath(
  filePath: string,
  userId: string
): Promise<{ id: string; storage_url: string } | null> {
  const candidates = new Set<string>([filePath]);
  const slash = filePath.indexOf("/");
  if (slash > 0) candidates.add(filePath.slice(slash + 1));

  const { data, error } = await db
    .from("sources")
    .select("id, storage_url")
    .in("storage_url", Array.from(candidates))
    .eq("user_id", userId)
    .limit(1);
  if (error) {
    throw new Error(`Failed to look up source: ${error.message}`);
  }
  const row = (data as Array<{ id: string; storage_url: string }> | null)?.[0];
  return row ?? null;
}

/**
 * The subset of `entityIds` that exist and are owned by `userId`.
 */
export async function filterOwnedEntityIds(
  entityIds: readonly string[],
  userId: string
): Promise<Set<string>> {
  const unique = Array.from(new Set(entityIds.filter(Boolean)));
  if (unique.length === 0) return new Set();
  const { data, error } = await db
    .from("entities")
    .select("id")
    .in("id", unique)
    .eq("user_id", userId);
  if (error) {
    throw new Error(`Failed to look up entities: ${error.message}`);
  }
  return new Set(((data as Array<{ id: string }> | null) ?? []).map((r) => r.id));
}

/**
 * Throw {@link OwnedEntityNotFoundError} for the first id in `entityIds`
 * that `userId` does not own (missing or another user's — same error).
 */
export async function assertEntitiesOwned(
  entityIds: readonly string[],
  userId: string
): Promise<void> {
  const owned = await filterOwnedEntityIds(entityIds, userId);
  for (const id of entityIds) {
    if (!owned.has(id)) {
      throw new OwnedEntityNotFoundError(id);
    }
  }
}
