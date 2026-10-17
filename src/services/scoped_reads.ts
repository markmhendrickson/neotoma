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
import { createHash } from "node:crypto";
import { z } from "zod";
import type { DbConnection, DbDatabase } from "../repositories/db/driver.js";
import type { components } from "../shared/openapi_types.js";
import { NEOTOMA_ENTITY_ID_REGEX } from "../shared/neotoma_entity_id.js";
import { canonicalStoreRequest, StoreConditionError } from "./store_condition_keys.js";
import { NativeProjectionError } from "./native_transition_projection.js";
import { RelationshipReducer } from "../reducers/relationship_reducer.js";

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

/**
 * Immutable storage primitive, NOT an authorization or principal resolver.
 * The owning read/transaction service must first prove its actual tenant/history
 * read authority and verified presentation. A caller hash, tenant string, open
 * transaction, provenance block or this function's output supplies none of that.
 * No public route calls this primitive until that admission producer exists.
 */
export interface NativeBindingPresentation {
  credential_kind: "aauth_sub";
  credential_value: string;
  credential_issuer: string;
}

type NativeBindingHistoryGroup = components["schemas"]["NativeBindingHistoryGroup"];
type BindingProjection = NativeBindingHistoryGroup["projected_rows"][number];

/** Preparation read: coherence is enforced by the EXISTING database transaction. */
export async function collectOwnedPrincipalBindingCandidates(
  database: DbDatabase,
  userId: string,
  presentation: NativeBindingPresentation,
  selector: NativeBindingHistoryGroup["selector"]
): Promise<NativeBindingHistoryGroup> {
  canonicalStoreRequest({ userId, presentation, selector });
  const parsed = bindingPresentation.safeParse(presentation);
  const requested = bindingSelector.safeParse(selector);
  if (!userId || !userId.trim() || !parsed.success || !requested.success)
    throw bindingFailure("G17_binding_history_shape");
  const lookup = RelationshipReducer.generateCredentialLookupKey({
    identity_strategy: "credential-binding-v1",
    presentation: { user_id: userId, ...parsed.data },
  });
  if (selector.bindings.credential_key_sha256 !== lookup)
    throw bindingFailure("G17_binding_selector_mismatch");
  // Zod's copied values cannot be changed by the caller while the transaction
  // queues. No public authority or reusable admission token is created.
  return database.transaction((tx) =>
    collectBindingHistoryRows(tx, userId, parsed.data, requested.data)
  );
}

/** Private transaction-local body; do not expose a nontransactional read path. */
async function collectBindingHistoryRows(
  tx: DbConnection,
  userId: string,
  presentation: NativeBindingPresentation,
  selector: NativeBindingHistoryGroup["selector"]
): Promise<NativeBindingHistoryGroup> {
  try {
    // Never filter by credential, target, key, current liveness or expiry here:
    // malformed/legacy/conflicting history cannot disappear before selection.
    const census = (await tx
      .prepare(
        "SELECT count(*) AS n FROM relationship_observations WHERE user_id=? AND relationship_type=?"
      )
      .get(userId, "principal_binding")) as { n?: unknown } | undefined;
    if (!census || !Number.isSafeInteger(census.n) || Number(census.n) < 0)
      throw bindingFailure("G17_binding_history_unavailable");
    if (Number(census.n) > 4096) throw bindingFailure("complete_readset_bound");
    const rawRows = await tx
      .prepare(
        "SELECT id,relationship_key,relationship_type,source_entity_id,target_entity_id," +
          "source_id,interpretation_id,observed_at,metadata,canonical_hash,provenance," +
          "source_priority,specificity_score,user_id FROM relationship_observations " +
          "WHERE user_id=? AND relationship_type=? ORDER BY id ASC LIMIT 4097"
      )
      .all(userId, "principal_binding");
    if (rawRows.length !== census.n) throw bindingFailure("G17_binding_history_unavailable");
    const all: BindingProjection[] = [];
    const matches: BindingProjection[] = [];
    let previousId: string | undefined;
    for (const value of rawRows) {
      canonicalStoreRequest(value);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw bindingFailure("G17_binding_history_shape");
      const row = value as Record<string, unknown>;
      if (
        row.user_id !== userId ||
        row.relationship_type !== "principal_binding" ||
        row.source_entity_id !== null ||
        typeof row.id !== "string" ||
        !/^[\x21-\x7e]+$/.test(row.id) ||
        (previousId !== undefined && previousId >= row.id) ||
        typeof row.target_entity_id !== "string" ||
        !NEOTOMA_ENTITY_ID_REGEX.test(row.target_entity_id)
      )
        throw bindingFailure("G17_binding_history_shape");
      previousId = row.id;
      const metadata = await decodeBindingObject(tx, row.metadata, false);
      const provenance = await decodeBindingObject(tx, row.provenance, true);
      const identity = bindingMetadata.safeParse(metadata);
      if (!identity.success) throw bindingFailure("G17_binding_history_shape");
      const expectedKey = RelationshipReducer.generateRelationshipKey({
        identity_strategy: "credential-binding-v1",
        relationship_type: "principal_binding",
        source_entity_id: null,
        target_entity_id: row.target_entity_id,
        presentation: {
          user_id: userId,
          credential_kind: identity.data.credential_kind,
          credential_value: identity.data.credential_value,
          credential_issuer: identity.data.credential_issuer,
        },
      });
      if (row.relationship_key !== expectedKey) throw bindingFailure("G17_binding_history_shape");
      for (const key of ["source_id", "interpretation_id", "observed_at", "canonical_hash"])
        if (row[key] !== null && typeof row[key] !== "string")
          throw bindingFailure("G17_binding_history_shape");
      for (const key of ["source_priority", "specificity_score"])
        if (row[key] !== null && (typeof row[key] !== "number" || !Number.isFinite(row[key])))
          throw bindingFailure("G17_binding_history_shape");
      // Numeric R3's READ projection, intentionally distinct from receipt P.
      const columns = [
        "id",
        "relationship_key",
        "relationship_type",
        "source_entity_id",
        "target_entity_id",
        "source_id",
        "interpretation_id",
        "observed_at",
        "canonical_hash",
        "source_priority",
        "specificity_score",
      ];
      if (
        Object.keys(row).some(
          (key) => ![...columns, "metadata", "provenance", "user_id"].includes(key)
        )
      )
        throw bindingFailure("G17_binding_history_shape");
      const projected = {
        ...Object.fromEntries(columns.map((column) => [column, row[column]])),
        metadata,
        provenance,
      } as BindingProjection;
      all.push(projected);
      if (
        identity.data.credential_kind === presentation.credential_kind &&
        identity.data.credential_value === presentation.credential_value &&
        identity.data.credential_issuer === presentation.credential_issuer
      )
        matches.push(projected);
    }
    if (
      Buffer.byteLength(canonicalStoreRequest(["native-readset-v2", selector, all]), "utf8") >
      1024 * 1024
    )
      throw bindingFailure("complete_readset_bound");
    const canonical = canonicalStoreRequest(["native-readset-v2", selector, matches]);
    return {
      recipe_version: "native-readset-v2",
      selector,
      count: matches.length,
      projected_rows: matches,
      canonical_json_utf8: canonical,
      rows_sha256: createHash("sha256").update(canonical, "utf8").digest("hex"),
      complete: true,
    };
  } catch (error) {
    if (error instanceof NativeProjectionError) throw error;
    // No SQL, stored credential/provenance or backend message in the envelope.
    throw bindingFailure("G17_binding_history_unavailable");
  }
}

const bindingText = z
  .string()
  .min(1)
  .refine((s) => s.trim().length > 0);
const bindingPresentation = z
  .object({
    credential_kind: z.literal("aauth_sub"),
    credential_value: bindingText,
    credential_issuer: bindingText,
  })
  .strict();
const bindingMetadata = bindingPresentation
  .extend({ expires_at: z.string().datetime().nullable(), _deleted: z.boolean().optional() })
  .strict();
const bindingSelector = z
  .object({
    bindings: z
      .object({
        credential_kind: z.literal("aauth_sub"),
        credential_key_sha256: z.string().regex(/^[0-9a-f]{64}$/),
      })
      .strict(),
  })
  .strict();
function bindingFailure(
  dependency: NonNullable<NativeProjectionError["dependency"]>
): NativeProjectionError {
  return new NativeProjectionError(
    "NATIVE_DEPENDENCY_UNAVAILABLE",
    "Complete native binding history could not be acquired; do not infer absence or authority.",
    dependency
  );
}
/** Fixed input-only JSON1 inspection; no record read or authority is acquired. */
export async function decodeStrictJsonObject(
  tx: DbConnection,
  raw: unknown
): Promise<Record<string, unknown>> {
  try {
    if (typeof raw !== "string") throw new Error();
    const duplicate = await tx
      .prepare(
        "SELECT 1 AS duplicate FROM json_tree(?) WHERE key IS NOT NULL " +
          "GROUP BY parent,key HAVING count(*)>1 LIMIT 1"
      )
      .get(raw);
    if (duplicate) throw new Error();
    const decoded: unknown = JSON.parse(raw);
    canonicalStoreRequest(decoded);
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error();
    return decoded as Record<string, unknown>;
  } catch {
    // Never expose SQL diagnostics or raw request/relationship content.
    throw new StoreConditionError("VALIDATION_ERROR", "A strict finite JSON object is required.");
  }
}
async function decodeBindingObject(
  tx: DbConnection,
  raw: unknown,
  nullable: boolean
): Promise<Record<string, unknown> | null> {
  if (raw === null && nullable) return null;
  try {
    return await decodeStrictJsonObject(tx, raw);
  } catch {
    throw bindingFailure("G17_binding_history_shape");
  }
}
