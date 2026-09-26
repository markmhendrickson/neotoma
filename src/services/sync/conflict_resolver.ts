/**
 * Minimal sync conflict resolution. prefer_remote re-fetches a remote guest snapshot;
 * prefer_local is a no-op with guidance to use correct for field-level overrides.
 */

import { createHash } from "node:crypto";
import { db } from "../../db.js";
import { createCorrection } from "../correction.js";

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
}): Promise<{ ok: boolean; message: string }> {
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
        "source_priority: immutable observations already preserve both sides; configure peer source priorities before replaying sync rows to change reducer precedence.",
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

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
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

  const { storeStructuredForApi } = await import("../../actions.js");
  const idempotencyKey = createHash("sha256")
    .update(`resolve-remote:${params.userId}:${params.entity_id}:${base}`)
    .digest("hex");

  await storeStructuredForApi({
    userId: params.userId,
    entities: [{ entity_type, ...fields }],
    sourcePriority: 1000,
    observationSource: "human",
    idempotencyKey,
  });

  return {
    ok: true,
    message: "prefer_remote: applied remote guest snapshot with human-classified priority.",
  };
}
