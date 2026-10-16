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
import { enforceAgentCapability, contextFromAgentIdentity } from "../agent_capabilities.js";
import { assertCanWriteProtectedBatch } from "../protected_entity_types.js";
import { getCurrentAAuthAdmission, getCurrentAgentIdentity } from "../request_context.js";
import { isCorrectionObservation } from "../correction_identity.js";
import { resolveOwnedObservations } from "../attachment_resolution.js";
import {
  applyCorrectionTransaction,
  CorrectionTransactionError,
} from "../correction_transaction.js";

type SyncConflictStrategy =
  | "prefer_local"
  | "prefer_remote"
  | "last_write_wins"
  | "source_priority"
  | "manual";

export interface WithheldField {
  field: string;
  /**
   * `undeclared_field`: the local schema does not declare it, so a correction
   * would never reach the snapshot. `array_corrections_combine`: the field is an
   * array rule that already holds a local correction; corrections still combine
   * (#2341), so a correction would produce a union, not the remote value.
   */
  reason: "undeclared_field" | "array_corrections_combine";
}

export interface SyncConflictResult {
  ok: boolean;
  message: string;
  /** prefer_remote: fields whose remote value was written as a correction and now stands. */
  fields_applied?: string[];
  /** prefer_remote: differing remote fields that were NOT applied, with the reason. */
  fields_withheld?: WithheldField[];
}

/**
 * Every branch of resolveSyncConflict that writes a correction-tier value runs the
 * same gate MCP `correct` and REST `/correct` run: the per-type `correct`
 * capability for an admitted agent, and the protected-type guard. This lives here,
 * not in createCorrection, because internal system writers call that directly.
 */
function assertMayCorrect(entityType: string): void {
  const identity = getCurrentAgentIdentity();
  const ctx = contextFromAgentIdentity(identity);
  if (ctx) enforceAgentCapability("correct", [entityType], ctx);
  assertCanWriteProtectedBatch({
    entity_types: [entityType],
    op: "correct",
    identity,
    admission: getCurrentAAuthAdmission(),
  });
}

export async function resolveSyncConflict(params: {
  userId: string;
  entity_id: string;
  strategy: SyncConflictStrategy;
  sender_peer_url?: string;
  guest_access_token?: string;
}): Promise<SyncConflictResult> {
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
    assertMayCorrect(entityType);
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

  // The caller's own entity, scoped by id AND user_id (see the manual branch).
  // Looked up and authorised BEFORE the fetch so a caller who may not correct
  // this type cannot make the server fetch on its behalf.
  const { data: local, error: localError } = await db
    .from("entities")
    .select("entity_type")
    .eq("id", params.entity_id)
    .eq("user_id", params.userId)
    .maybeSingle();
  if (localError) throw new Error(localError.message);
  const localType = (local as { entity_type?: string } | null)?.entity_type;
  if (localType) assertMayCorrect(localType);

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

  // Apply the fields that differ as ONE correction transaction. A correction wins
  // on every merge strategy (#2033), so this holds even where a local correction
  // already stands: the explicit remote preference is the later correction and
  // replaces it. The transaction runs the `correct` capability gate, applies all
  // fields or none, and verifies each requested value reached the snapshot.
  const { schemaRegistry } = await import("../schema_registry.js");
  const schema = await schemaRegistry.loadActiveSchema(localType, params.userId);
  if (!schema) {
    return {
      ok: false,
      message: `prefer_remote: no active schema for entity type "${localType}"; nothing was applied.`,
      fields_applied: [],
    };
  }
  const baseline = await getEntityWithProvenance(params.entity_id, false, params.userId);
  const local_snapshot = (baseline?.snapshot ?? {}) as Record<string, unknown>;

  // Fields that already hold a correction, for the array rules (see below).
  const correctedFields = new Set<string>();
  for (const row of (await resolveOwnedObservations(params.entity_id, params.userId)) ?? []) {
    if (isCorrectionObservation(row)) {
      for (const key of Object.keys(row.fields)) correctedFields.add(key);
    }
  }

  const changes: { field: string; value: unknown }[] = [];
  const withheld: WithheldField[] = [];
  for (const [field, value] of Object.entries(fields)) {
    if (stableSerialize(local_snapshot[field]) === stableSerialize(value)) continue;
    if (!Object.hasOwn(schema.schema_definition.fields, field)) {
      withheld.push({ field, reason: "undeclared_field" });
      continue;
    }
    const strategy = schema.reducer_config?.merge_policies?.[field]?.strategy;
    if (
      (strategy === "merge_array" || strategy === "merge_array_by_key") &&
      correctedFields.has(field)
    ) {
      withheld.push({ field, reason: "array_corrections_combine" });
      continue;
    }
    changes.push({ field, value });
  }

  const withheldNote = withheld.length
    ? ` Not applied: ${withheld
        .map(
          ({ field, reason }) =>
            `${field} (${reason === "undeclared_field" ? "not declared in the local schema" : "array field already holds a local correction; corrections combine, so use correct to replace it"})`
        )
        .join(", ")}.`
    : "";

  if (changes.length === 0) {
    return {
      ok: withheld.length === 0,
      fields_applied: [],
      fields_withheld: withheld,
      message:
        withheld.length === 0
          ? "prefer_remote: the local snapshot already matches the remote snapshot; nothing to apply."
          : `prefer_remote: no field could be applied.${withheldNote}`,
    };
  }

  try {
    await applyCorrectionTransaction({
      user_id: params.userId,
      idempotency_key: createHash("sha256")
        .update(
          `resolve-remote:${params.userId}:${params.entity_id}:${base}:${baseline?.observation_count ?? 0}:${stableSerialize(changes)}`
        )
        .digest("hex"),
      entities: [
        {
          entity_id: params.entity_id,
          entity_type: localType,
          expected_observation_count: baseline?.observation_count ?? 0,
          expected_snapshot: {},
          changes,
        },
      ],
    });
  } catch (err) {
    if (err instanceof CorrectionTransactionError) {
      // All-or-nothing: nothing was written.
      return {
        ok: false,
        fields_applied: [],
        fields_withheld: withheld,
        message: `prefer_remote: ${err.code}: ${err.message} Nothing was applied.${withheldNote}`,
      };
    }
    throw err;
  }

  const applied = changes.map((change) => change.field);
  return {
    ok: true,
    fields_applied: applied,
    fields_withheld: withheld,
    message:
      `prefer_remote: applied ${applied.length} differing field(s) from the remote snapshot as corrections: ${applied.join(", ")}. ` +
      `They now hold against later writes from this peer or any importer until corrected again.${withheldNote}`,
  };
}
