/**
 * Minimal sync conflict resolution. prefer_remote re-fetches a remote guest snapshot
 * and applies each field that differs from the local snapshot as a correction;
 * prefer_local is a no-op with guidance to use correct for field-level overrides.
 *
 * Why corrections (#2033): a correction wins on every field until a later correction
 * replaces it, so an ordinary write, even at priority 1000 with a "human" source kind,
 * can no longer override a locally corrected field. prefer_remote expresses an explicit
 * operator decision that the remote value is right, so it is recorded as one.
 */

import { guardedFetch, isPublicFetchUrlAllowed } from "../net/private_host_guard.js";
import { createHash } from "node:crypto";
import { db } from "../../db.js";
import { createCorrection } from "../correction.js";
import { getEntityWithProvenance } from "../entity_queries.js";
import { stableSerialize } from "../stable_serialize.js";

type SyncConflictStrategy =
  | "prefer_local"
  | "prefer_remote"
  | "last_write_wins"
  | "source_priority"
  | "manual";

export async function resolveSyncConflict(params: {
  userId: string;
  entity_id: string;
  strategy: SyncConflictStrategy;
  sender_peer_url?: string;
  guest_access_token?: string;
}): Promise<{ ok: boolean; message: string; fields_applied?: string[] }> {
  if (params.strategy === "manual") {
    // Ownership precheck (neotoma#2229): a by-id write must confirm the
    // caller owns entity_id BEFORE writing under the caller's own user_id —
    // scoping the lookup by id AND user_id, mirroring GET /entities/:id and
    // MCP correct(). Without the user_id filter here, any authenticated
    // caller could flip `sync_conflict: true` on another user's entity by
    // guessing/observing its id. A miss (missing OR owned by someone else)
    // returns the same "not found" message either way, so the response
    // itself cannot be used to probe for another user's entity ids.
    const { data: entity, error } = await db
      .from("entities")
      .select("entity_type")
      .eq("id", params.entity_id)
      .eq("user_id", params.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const entityType = (entity as { entity_type?: string } | null)?.entity_type;
    if (!entityType) {
      return { ok: false, message: "manual: entity not found" };
    }
    await createCorrection({
      entity_id: params.entity_id,
      entity_type: entityType,
      field: "sync_conflict",
      value: true,
      schema_version: "1.0",
      user_id: params.userId,
      idempotency_key: createHash("sha256")
        .update(`sync-conflict-manual:${params.userId}:${params.entity_id}`)
        .digest("hex"),
    });
    return {
      ok: true,
      message:
        "manual: marked entity sync_conflict=true. Resolve field-by-field with correct, then clear the flag.",
    };
  }

  if (params.strategy === "prefer_local" || params.strategy === "last_write_wins") {
    return {
      ok: true,
      message: `${params.strategy}: local reducer snapshot retained. Use correct for field-level overrides if needed.`,
    };
  }

  if (params.strategy === "source_priority") {
    return {
      ok: true,
      message:
        "source_priority: immutable observations already preserve both sides, and replayed sync rows rank by their source priority, but a field held by a correction is never displaced by priority; use prefer_remote or correct to replace it.",
    };
  }

  const base = params.sender_peer_url?.trim().replace(/\/$/, "");
  if (!base) {
    return {
      ok: false,
      message:
        "prefer_remote requires `sender_peer_url` (remote Neotoma base URL that serves GET /entities/:id).",
    };
  }

  const tokenQ = params.guest_access_token?.trim()
    ? `?access_token=${encodeURIComponent(params.guest_access_token.trim())}`
    : "";
  const url = `${base}/entities/${encodeURIComponent(params.entity_id)}${tokenQ}`;

  // SSRF: this is the sharpest sink of the class. The fetched JSON is ingested
  // into the caller's entities, so an internal target would be semi-reflected
  // back to them rather than merely probed blind.
  if (!isPublicFetchUrlAllowed(url)) {
    return {
      ok: false,
      message: "prefer_remote: `sender_peer_url` must be a public host.",
    };
  }

  // guardedFetch: url already passed isPublicFetchUrlAllowed above, but that
  // only checked the URL the caller supplied — an otherwise-public peer
  // could redirect this fetch to an internal target, which would then be
  // ingested into the caller's entities. Re-check every hop; a refusal
  // throws, so catch it into the same {ok:false, message} shape this
  // function already uses for the pre-fetch guard rejection above.
  let res: Response;
  try {
    res = await guardedFetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    return {
      ok: false,
      message: `prefer_remote: ${err instanceof Error ? err.message : "remote fetch failed"}`,
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      message: `prefer_remote: remote fetch failed with HTTP ${res.status}`,
    };
  }

  const remote = (await res.json()) as {
    entity_type?: string;
    snapshot?: Record<string, unknown>;
  };
  if (!remote.entity_type || !remote.snapshot || typeof remote.snapshot !== "object") {
    return {
      ok: false,
      message: "prefer_remote: remote entity response missing entity_type or snapshot",
    };
  }

  const entity_type = remote.entity_type;
  const fields = { ...remote.snapshot };
  delete (fields as Record<string, unknown>).entity_id;

  // The caller's own entity, scoped by id AND user_id (see the manual branch).
  const { data: local, error: localError } = await db
    .from("entities")
    .select("entity_type")
    .eq("id", params.entity_id)
    .eq("user_id", params.userId)
    .maybeSingle();
  if (localError) throw new Error(localError.message);
  const localType = (local as { entity_type?: string } | null)?.entity_type;

  if (!localType) {
    // Nothing exists locally, so no correction can be in the way: ingest the
    // remote snapshot as before.
    const { storeStructuredForApi } = await import("../../actions.js");
    await storeStructuredForApi({
      userId: params.userId,
      entities: [{ entity_type, ...fields }],
      sourcePriority: 1000,
      observationSource: "human",
      idempotencyKey: createHash("sha256")
        .update(`resolve-remote:${params.userId}:${params.entity_id}:${base}`)
        .digest("hex"),
    });
    return {
      ok: true,
      message: "prefer_remote: no local entity; ingested the remote guest snapshot.",
    };
  }

  if (localType !== entity_type) {
    return {
      ok: false,
      message: `prefer_remote: local entity is type "${localType}" but the remote snapshot is "${entity_type}".`,
    };
  }

  // Apply each field that differs as a correction. A correction wins on every
  // merge strategy (#2033), so this holds even where a local correction already
  // stands: the explicit remote preference is the later correction and replaces
  // it. Ordinary writes at any priority could not.
  const local_snapshot =
    (await getEntityWithProvenance(params.entity_id, false, params.userId))?.snapshot ?? {};
  const { schemaRegistry } = await import("../schema_registry.js");
  const schema_version =
    (await schemaRegistry.loadActiveSchema(entity_type, params.userId))?.schema_version ?? "1.0";

  const applied: string[] = [];
  for (const [field, value] of Object.entries(fields)) {
    const current = (local_snapshot as Record<string, unknown>)[field];
    if (stableSerialize(current) === stableSerialize(value)) continue;
    await createCorrection({
      entity_id: params.entity_id,
      entity_type,
      field,
      value,
      schema_version,
      user_id: params.userId,
      idempotency_key: createHash("sha256")
        .update(
          `resolve-remote:${params.userId}:${params.entity_id}:${base}:${field}:${stableSerialize(value)}`
        )
        .digest("hex"),
    });
    applied.push(field);
  }

  return {
    ok: true,
    fields_applied: applied,
    message:
      applied.length === 0
        ? "prefer_remote: the local snapshot already matches the remote snapshot; nothing to apply."
        : `prefer_remote: applied ${applied.length} differing field(s) from the remote snapshot as corrections: ${applied.join(", ")}.`,
  };
}
