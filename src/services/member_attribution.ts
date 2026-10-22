/**
 * Per-member write-attribution ids (#2240).
 *
 * The id stamped into write provenance to say which signed-in member made a
 * write. It is a random UUID minted the first time a member's session is
 * resolved on this instance and stored in `member_attribution_ids`, keyed by
 * the member's local-auth user id.
 *
 * Why random rather than derived. The local-auth user id is an unkeyed hash
 * of the normalized email, so stamping it would let anyone holding a list of
 * candidate addresses re-identify the author of a record, and would give one
 * person the same value on every instance. A keyed HMAC would fix both but
 * depends on an instance secret that is not guaranteed to exist on every
 * deployment (the encryption key, key file and bearer token are all optional),
 * so attribution would silently vanish wherever it was unset. A random id
 * needs no secret, cannot be recomputed from anything outside this database,
 * and differs per instance by construction. Deleting a member's row severs
 * the link between that member and every record carrying the id.
 *
 * Fails closed: any failure to resolve returns null and the write is left
 * unattributed. It never falls back to the local-auth id or the graph id.
 */

import { randomUUID } from "node:crypto";

import { getDb } from "../repositories/db/connection.js";
import { logger } from "../utils/logger.js";

type Row = { attribution_id?: string | null } | undefined;

async function readAttributionId(localUserId: string): Promise<string | null> {
  const db = await getDb();
  const row = (await db
    .prepare("SELECT attribution_id FROM member_attribution_ids WHERE local_user_id = ?")
    .get(localUserId)) as Row;
  const id = row?.attribution_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * Resolve the attribution id for a signed-in member, minting one on first use.
 *
 * `localUserId` must name an existing local-auth user — the per-email id a
 * verified sign-in recorded on the OAuth connection. Anything else resolves to
 * null. Concurrent first calls converge on one id: the insert is
 * `INSERT OR IGNORE` on the primary key and the winner is re-read.
 */
export async function getOrCreateMemberAttributionId(
  localUserId: string | null | undefined
): Promise<string | null> {
  if (typeof localUserId !== "string" || localUserId.length === 0) return null;
  try {
    const existing = await readAttributionId(localUserId);
    if (existing) return existing;

    const db = await getDb();
    const member = (await db
      .prepare("SELECT id FROM local_auth_users WHERE id = ?")
      .get(localUserId)) as { id?: string } | undefined;
    if (!member?.id) return null;

    await db
      .prepare(
        "INSERT OR IGNORE INTO member_attribution_ids (local_user_id, attribution_id, created_at) VALUES (?, ?, ?)"
      )
      .run(localUserId, randomUUID(), new Date().toISOString());
    return await readAttributionId(localUserId);
  } catch (error) {
    logger.warn(
      `[member_attribution] could not resolve an attribution id; write left unattributed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}
