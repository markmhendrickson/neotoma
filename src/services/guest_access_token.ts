/**
 * Guest access token service.
 *
 * Generates and validates per-submission access tokens for guest agents
 * that don't have AAuth keys. Tokens are UUIDs stored alongside the
 * entities they grant access to, enabling submitter read-back without
 * requiring cryptographic identity.
 *
 * Storage: tokens are persisted as `guest_access_token` entities in the
 * operator's store, linked to the entities they cover via REFERS_TO.
 */

import { randomUUID, createHash } from "node:crypto";
import { db } from "../db.js";
import { getDb } from "../repositories/db/connection.js";
import { stableSerialize } from "./stable_serialize.js";
import { generateObservationId } from "./observation_identity.js";
import {
  getCurrentAgentIdentity,
  getCurrentAttribution,
  getCurrentAAuthAdmission,
} from "./request_context.js";
import { enforceAttributionPolicy } from "./attribution_policy.js";
import { enforceAgentCapability, contextFromAgentIdentity } from "./agent_capabilities.js";
import { assertCanWriteProtected } from "./protected_entity_types.js";
import { emitObservationCreated } from "../events/substrate_store_emit.js";
import { runtimeEnv } from "../config_embedded.js";

export interface GuestAccessToken {
  token: string;
  entity_ids: string[];
  thumbprint?: string;
  created_at: string;
  ttl_seconds: number;
  revoked_at?: string | null;
}

const DEFAULT_GUEST_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export function hashGuestAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function deriveTokenEntityId(token: string): string {
  return `guest_token_${hashGuestAccessToken(token).slice(0, 16)}`;
}

function getGuestTokenTtlSeconds(): number {
  const configured = Number.parseInt(runtimeEnv().NEOTOMA_GUEST_TOKEN_TTL_SECONDS ?? "", 10);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_GUEST_TOKEN_TTL_SECONDS;
}

function parseObservationPayload(obs: {
  fields?: unknown;
  payload?: unknown;
}): Record<string, unknown> | null {
  try {
    const payload =
      typeof obs.fields === "string"
        ? JSON.parse(obs.fields)
        : obs.fields && typeof obs.fields === "object"
          ? obs.fields
          : typeof obs.payload === "string"
            ? JSON.parse(obs.payload)
            : obs.payload;

    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Generate a new guest access token and persist it.
 * Called after a successful guest write to return a read-back credential.
 */
export async function generateGuestAccessToken(params: {
  entityIds: string[];
  userId: string;
  thumbprint?: string;
}): Promise<string> {
  const token = randomUUID();
  const now = new Date().toISOString();
  const entityId = deriveTokenEntityId(token);

  const { error: entityError } = await db.from("entities").insert({
    id: entityId,
    entity_type: "guest_access_token",
    canonical_name: `guest_access_token:${hashGuestAccessToken(token).slice(0, 12)}`,
    user_id: params.userId,
    created_at: now,
    updated_at: now,
  });
  if (entityError && !/exists|duplicate|unique/i.test(entityError.message ?? "")) {
    throw new Error(
      `Failed to persist guest access token entity: ${entityError.message ?? entityError}`
    );
  }
  const { error: observationError } = await db.from("observations").insert({
    id: randomUUID(),
    entity_id: entityId,
    entity_type: "guest_access_token",
    user_id: params.userId,
    fields: {
      token_hash: hashGuestAccessToken(token),
      entity_ids: params.entityIds,
      thumbprint: params.thumbprint ?? null,
      created_at: now,
      ttl_seconds: getGuestTokenTtlSeconds(),
      revoked_at: null,
    },
    observed_at: now,
    source_priority: 100,
  });
  if (observationError) {
    throw new Error(
      `Failed to persist guest access token observation: ${observationError.message ?? observationError}`
    );
  }

  return token;
}

/** Stable code and neutral text for every refusal of a presented guest token. */
export const GUEST_TOKEN_INVALID_CODE = "GUEST_TOKEN_INVALID";
export const GUEST_TOKEN_INVALID_MESSAGE =
  "This link is not valid or has expired. Ask the sender for a new link.";
export const GUEST_TOKEN_SCOPE_CODE = "GUEST_TOKEN_SCOPE";
export const GUEST_TOKEN_SCOPE_MESSAGE =
  "This link does not give access to this item. Ask the sender for a link to it.";

/** A presented guest token is unknown, malformed, expired or revoked (HTTP 401). */
export class GuestTokenInvalidError extends Error {
  readonly code = GUEST_TOKEN_INVALID_CODE;
  readonly statusCode = 401;
  constructor() {
    super(GUEST_TOKEN_INVALID_MESSAGE);
    this.name = "GuestTokenInvalidError";
  }
}

/** A valid guest token was presented for an item it does not name (HTTP 403). */
export class GuestTokenScopeError extends Error {
  readonly code = GUEST_TOKEN_SCOPE_CODE;
  readonly statusCode = 403;
  constructor() {
    super(GUEST_TOKEN_SCOPE_MESSAGE);
    this.name = "GuestTokenScopeError";
  }
}

function isSet(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "" && value !== false;
}

/**
 * Validate a guest access token and return the entity IDs it covers.
 * Returns null if the token is unknown, malformed, expired, revoked or deleted.
 * Throws (never grants) when the token records cannot be read from storage.
 *
 * The token's state is the fold of EVERY record on its entity, including
 * partial records written by corrections and lifecycle records. Records can
 * only narrow a token:
 *   - any `revoked_at` revokes;
 *   - any `_deleted: true` record refuses the token, and a later restore
 *     (`_deleted: false`) does not lift it;
 *   - the lifetime is the smallest `ttl_seconds` present and the configured
 *     lifetime, counted from the earliest `created_at` present;
 *   - the covered entities are the intersection of every `entity_ids` present;
 *   - differing `thumbprint` values refuse the token;
 *   - a record that cannot be read, or that names a different token hash,
 *     refuses the token;
 *   - a token entity that was merged, or that took part in a merge or split,
 *     refuses the token rather than combining records.
 */
export async function validateGuestAccessToken(token: string): Promise<GuestAccessToken | null> {
  const tokenHash = hashGuestAccessToken(token);
  const tokenEntityId = deriveTokenEntityId(token);

  const { data: observations, error: observationsError } = await db
    .from("observations")
    .select("fields")
    .eq("entity_id", tokenEntityId)
    .order("observed_at", { ascending: false });
  if (observationsError) {
    throw new Error(`Guest token records could not be read: ${observationsError.message}`);
  }
  if (!observations || observations.length === 0) return null;

  const rows: Record<string, unknown>[] = [];
  for (const obs of observations) {
    const payload = parseObservationPayload(obs);
    if (!payload) return null; // unreadable record: fail closed
    if (isSet(payload.token_hash) && payload.token_hash !== tokenHash) return null;
    rows.push(payload);
  }
  // At least one record must positively carry this token's hash.
  if (!rows.some((payload) => payload.token_hash === tokenHash)) return null;

  if (!(await tokenEntityIsIntact(tokenEntityId))) return null;

  let createdAtMs = Number.POSITIVE_INFINITY;
  let ttlSeconds = getGuestTokenTtlSeconds();
  let entityIds = null as Set<string> | null;
  const thumbprints = new Set<string>();

  for (const payload of rows) {
    if (isSet(payload.revoked_at)) return null;
    if (payload._deleted === true) return null;

    if (isSet(payload.created_at)) {
      const ms = typeof payload.created_at === "string" ? Date.parse(payload.created_at) : NaN;
      if (!Number.isFinite(ms)) return null;
      createdAtMs = Math.min(createdAtMs, ms);
    }
    if (payload.ttl_seconds !== undefined && payload.ttl_seconds !== null) {
      if (typeof payload.ttl_seconds !== "number" || !Number.isFinite(payload.ttl_seconds)) {
        return null;
      }
      ttlSeconds = Math.min(ttlSeconds, payload.ttl_seconds);
    }
    if (payload.entity_ids !== undefined && payload.entity_ids !== null) {
      if (!Array.isArray(payload.entity_ids)) return null;
      const ids = payload.entity_ids.filter((id): id is string => typeof id === "string");
      const previous: string[] | null = entityIds === null ? null : Array.from(entityIds);
      entityIds = new Set(previous === null ? ids : previous.filter((id) => ids.includes(id)));
    }
    if (isSet(payload.thumbprint) && typeof payload.thumbprint === "string") {
      thumbprints.add(payload.thumbprint);
    }
  }

  if (!Number.isFinite(createdAtMs)) return null;
  if (!(ttlSeconds > 0)) return null;
  if (Date.now() > createdAtMs + ttlSeconds * 1000) return null;
  if (thumbprints.size > 1) return null;

  return {
    token,
    entity_ids: entityIds ? Array.from(entityIds) : [],
    thumbprint: thumbprints.size === 1 ? Array.from(thumbprints)[0] : undefined,
    created_at: new Date(createdAtMs).toISOString(),
    ttl_seconds: ttlSeconds,
    revoked_at: null,
  };
}

/**
 * The token entity must exist, must not have been merged into another entity,
 * and must not appear in a merge or split record (which can move records
 * between entities). Any of those refuses the token rather than combining.
 */
async function tokenEntityIsIntact(tokenEntityId: string): Promise<boolean> {
  const { data: entity, error } = await db
    .from("entities")
    .select("id, merged_to_entity_id")
    .eq("id", tokenEntityId)
    .maybeSingle();
  if (error) throw new Error(`Guest token entity could not be read: ${error.message}`);
  if (!entity || (entity as { merged_to_entity_id?: string | null }).merged_to_entity_id) {
    return false;
  }
  const lookups: Array<[string, string]> = [
    ["entity_merges", "from_entity_id"],
    ["entity_merges", "to_entity_id"],
    ["entity_splits", "source_entity_id"],
    ["entity_splits", "new_entity_id"],
  ];
  for (const [table, column] of lookups) {
    const { data, error: lookupError } = await db
      .from(table)
      .select("id")
      .eq(column, tokenEntityId)
      .limit(1);
    if (lookupError) {
      throw new Error(`Guest token history could not be read: ${lookupError.message}`);
    }
    if (Array.isArray(data) && data.length > 0) return false;
  }
  return true;
}

export type GuestTokenEntityCheck =
  | { state: "granted"; reason: "named" | "submitter"; grant: GuestAccessToken }
  | { state: "invalid" }
  | { state: "other_entity"; grant: GuestAccessToken };

/**
 * The single check applied wherever a guest access token is presented for an
 * entity. The token must exist, be unexpired and unrevoked (see
 * `validateGuestAccessToken`), and cover exactly this entity: either by naming
 * it (`reason: "named"`), or, for an issue, as the submitter's token
 * (`reason: "submitter"`). The submitter rule is that the token hash is
 * recorded on one of the issue owner's own records, or the token names a
 * conversation the issue refers to.
 *
 * Pass `validated` when the token was already validated for this request.
 * Every guest-readable route resolves its token through here.
 */
export async function checkGuestTokenForEntity(
  token: string,
  entityId: string,
  entity?: { entity_type: string; user_id: string } | null,
  validated?: GuestAccessToken | null
): Promise<GuestTokenEntityCheck> {
  const grant = validated ?? (await validateGuestAccessToken(token));
  if (!grant) return { state: "invalid" };
  if (grant.entity_ids.includes(entityId)) return { state: "granted", reason: "named", grant };

  const resolved =
    entity ??
    ((await db.from("entities").select("entity_type, user_id").eq("id", entityId).single())
      .data as { entity_type: string; user_id: string } | null);
  if (resolved && resolved.entity_type === "issue") {
    if (await issueRecordsToken(token, entityId, resolved.user_id, grant)) {
      return { state: "granted", reason: "submitter", grant };
    }
  }
  return { state: "other_entity", grant };
}

async function issueRecordsToken(
  token: string,
  issueId: string,
  ownerId: string,
  grant: GuestAccessToken
): Promise<boolean> {
  const tokenHash = hashGuestAccessToken(token);
  const { data: issueObservations } = await db
    .from("observations")
    .select("fields")
    .eq("entity_id", issueId)
    .eq("user_id", ownerId);
  for (const observation of issueObservations ?? []) {
    const fields = parseObservationPayload(observation as { fields?: unknown });
    if (fields?.guest_access_token_hash === tokenHash) return true;
  }
  const { data: relationships } = await db
    .from("relationship_snapshots")
    .select("target_entity_id")
    .eq("source_entity_id", issueId)
    .eq("relationship_type", "REFERS_TO")
    .eq("user_id", ownerId);
  for (const relationship of relationships ?? []) {
    const conversationId = (relationship as { target_entity_id?: string }).target_entity_id;
    if (conversationId && grant.entity_ids.includes(conversationId)) return true;
  }
  return false;
}

/**
 * Check whether a guest access token grants access to a specific entity.
 */
export async function tokenGrantsAccessTo(token: string, entityId: string): Promise<boolean> {
  return (await checkGuestTokenForEntity(token, entityId)).state === "granted";
}

/** Error codes for owner revocation; each is listed in docs/subsystems/errors.md. */
const REVOCATION_ERROR_CODES = {
  400: "VALIDATION_INVALID_FORMAT",
  404: "RESOURCE_NOT_FOUND",
  503: "DB_CONNECTION_FAILED",
} as const;
export type GuestTokenRevocationConflictCode =
  | "ERR_GUEST_TOKEN_ORIGINAL_STALE"
  | "ERR_GUEST_TOKEN_IDEMPOTENCY_CONFLICT"
  | "ERR_GUEST_TOKEN_HISTORY_UNREADABLE";

export class GuestTokenRevocationError extends Error {
  public readonly code: string;
  constructor(
    public readonly status: 400 | 404 | 409 | 503,
    message: string,
    conflictCode?: GuestTokenRevocationConflictCode
  ) {
    super(message);
    this.name = "GuestTokenRevocationError";
    this.code =
      status === 409
        ? (conflictCode ?? "ERR_GUEST_TOKEN_HISTORY_UNREADABLE")
        : REVOCATION_ERROR_CODES[status];
  }
}

type TokenObservation = Record<string, any>;
async function readTokenRecord(
  entityId: string,
  owner?: string
): Promise<{ owner: string; observations: TokenObservation[] } | null> {
  let query = db
    .from("entities")
    .select("id,user_id,entity_type")
    .eq("id", entityId)
    .eq("entity_type", "guest_access_token");
  if (owner !== undefined) query = query.eq("user_id", owner);
  const entity = await query.maybeSingle();
  if (entity.error) throw new GuestTokenRevocationError(503, "Token storage is unavailable.");
  if (!entity.data || typeof entity.data.user_id !== "string") return null;
  const result = await db
    .from("observations")
    .select("*")
    .eq("entity_id", entityId)
    .eq("user_id", entity.data.user_id)
    .order("observed_at", { ascending: false });
  if (result.error) throw new GuestTokenRevocationError(503, "Token storage is unavailable.");
  return { owner: entity.data.user_id, observations: result.data ?? [] };
}

function isCompleteTokenPayload(
  payload: Record<string, unknown> | null,
  entityId: string
): payload is Record<string, unknown> & { token_hash: string; revoked_at: string | null } {
  return (
    !!payload &&
    typeof payload.token_hash === "string" &&
    /^[a-f0-9]{64}$/.test(payload.token_hash) &&
    entityId === `guest_token_${payload.token_hash.slice(0, 16)}` &&
    Array.isArray(payload.entity_ids) &&
    payload.entity_ids.length > 0 &&
    payload.entity_ids.every((id) => typeof id === "string" && id.length > 0) &&
    (payload.thumbprint === null || typeof payload.thumbprint === "string") &&
    typeof payload.created_at === "string" &&
    Number.isFinite(Date.parse(payload.created_at)) &&
    typeof payload.ttl_seconds === "number" &&
    Number.isFinite(payload.ttl_seconds) &&
    payload.ttl_seconds > 0 &&
    (payload.revoked_at === null ||
      (typeof payload.revoked_at === "string" && Number.isFinite(Date.parse(payload.revoked_at))))
  );
}

export interface GuestTokenRevocationReceipt {
  revoked: true;
  replayed: boolean;
  token_entity_id: string;
  revocation_observation_id: string;
  revoked_at: string;
}

/** Revokes one owned token by appending an immutable observation that repeats
 * the bound original record with `revoked_at` set.
 *
 * The token history is read by the same rules as `validateGuestAccessToken`:
 * partial rows written by corrections narrow the token and are accepted; a row
 * that cannot be read, or that names a different token hash, refuses the
 * request; `_deleted` lifecycle rows are accepted (the token stays refused).
 * When any row already carries `revoked_at`, the call writes nothing and
 * replays the earliest revoking row as the receipt. The same idempotency key
 * and target replay the committed receipt; the key bound to a different
 * request conflicts. */
export async function revokeGuestAccessToken(
  owner: string,
  entityId: string,
  input: unknown
): Promise<GuestTokenRevocationReceipt> {
  if (
    !owner ||
    !/^guest_token_[a-f0-9]{16}$/.test(entityId) ||
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  )
    throw new GuestTokenRevocationError(400, "Invalid revocation request.");
  const body = input as Record<string, unknown>;
  if (
    Object.keys(body).length !== 2 ||
    !Object.keys(body).every((key) =>
      ["idempotency_key", "expected_observation_id"].includes(key)
    ) ||
    ![body.idempotency_key, body.expected_observation_id].every(
      (value) => typeof value === "string" && value.trim().length > 0 && value.length <= 200
    )
  )
    throw new GuestTokenRevocationError(
      400,
      "Expected an idempotency key and original observation ID only."
    );
  const identity = getCurrentAgentIdentity();
  enforceAttributionPolicy("corrections", identity);
  assertCanWriteProtected({
    entity_type: "guest_access_token",
    op: "correct",
    identity,
    admission: getCurrentAAuthAdmission(),
  });
  const capabilityContext = contextFromAgentIdentity(identity);
  if (capabilityContext)
    enforceAgentCapability("correct", ["guest_access_token"], capabilityContext);
  const requestedAt = new Date().toISOString();
  const { assertStorePolicyAllows } = await import("./instance_policy.js");
  const { schemaRegistry } = await import("./schema_registry.js");
  await assertStorePolicyAllows(
    [{ entity_type: "guest_access_token", fields: { revoked_at: requestedAt } }],
    async (entityType) => {
      const entry = await schemaRegistry.loadActiveSchema(entityType, owner);
      return entry?.schema_definition ?? null;
    }
  );
  const key =
    "guest-token-revoke:" +
    createHash("sha256")
      .update(stableSerialize([owner, body.idempotency_key]))
      .digest("hex");
  const fingerprint = createHash("sha256")
    .update(stableSerialize([owner, entityId, body.expected_observation_id]))
    .digest("hex");
  const receipt = await (async () => {
    try {
      const connection = await getDb();
      return await connection.transaction(async () => {
        const record = await readTokenRecord(entityId, owner);
        if (!record) throw new GuestTokenRevocationError(404, "Token record not found.");
        const history: Array<{ row: TokenObservation; payload: Record<string, unknown> }> = [];
        for (const row of record.observations) {
          const payload = parseObservationPayload(row);
          if (!payload)
            throw new GuestTokenRevocationError(409, "Token history has an unreadable record.");
          history.push({ row, payload });
        }
        const original = history.find(({ row }) => row.id === body.expected_observation_id);
        const originalPayload = original?.payload ?? null;
        if (
          !original ||
          original.row.entity_type !== "guest_access_token" ||
          !isCompleteTokenPayload(originalPayload, entityId) ||
          originalPayload.revoked_at !== null
        )
          throw new GuestTokenRevocationError(
            409,
            "Expected a complete original token observation.",
            "ERR_GUEST_TOKEN_ORIGINAL_STALE"
          );
        if (
          history.some(
            ({ payload }) =>
              isSet(payload.token_hash) && payload.token_hash !== originalPayload.token_hash
          )
        )
          throw new GuestTokenRevocationError(
            409,
            "Token history names a different token.",
            "ERR_GUEST_TOKEN_HISTORY_UNREADABLE"
          );
        const retained = await db
          .from("observations")
          .select("*")
          .eq("user_id", owner)
          .eq("idempotency_key", key);
        if (retained.error)
          throw new GuestTokenRevocationError(503, "Token storage is unavailable.");
        if (retained.data?.length) {
          const prior = retained.data[0];
          const priorPayload = parseObservationPayload(prior);
          if (
            retained.data.length !== 1 ||
            prior.canonical_hash !== fingerprint ||
            prior.entity_id !== entityId
          )
            throw new GuestTokenRevocationError(
              409,
              "Idempotency key conflicts with a different request.",
              "ERR_GUEST_TOKEN_IDEMPOTENCY_CONFLICT"
            );
          if (
            prior.entity_type !== "guest_access_token" ||
            !isCompleteTokenPayload(priorPayload, entityId) ||
            !priorPayload.revoked_at
          )
            throw new GuestTokenRevocationError(409, "Stored revocation receipt is invalid.");
          return {
            revoked: true as const,
            replayed: true,
            token_entity_id: entityId,
            revocation_observation_id: prior.id as string,
            revoked_at: priorPayload.revoked_at,
          };
        }
        const revoking = history
          .filter(({ payload }) => isSet(payload.revoked_at))
          .sort(
            (x, y) =>
              String(x.row.observed_at).localeCompare(String(y.row.observed_at)) ||
              String(x.row.id).localeCompare(String(y.row.id))
          )[0];
        if (revoking) {
          const at = revoking.payload.revoked_at;
          if (typeof at !== "string" || !Number.isFinite(Date.parse(at)))
            throw new GuestTokenRevocationError(409, "Token revocation time is unreadable.");
          return {
            revoked: true as const,
            replayed: true,
            token_entity_id: entityId,
            revocation_observation_id: revoking.row.id as string,
            revoked_at: at,
          };
        }
        const now = requestedAt;
        const revokedAt = now;
        const fields = { ...originalPayload, revoked_at: revokedAt };
        const observationId = generateObservationId(null, null, entityId, fields, key);
        const inserted = await db.from("observations").insert({
          id: observationId,
          entity_id: entityId,
          entity_type: "guest_access_token",
          user_id: owner,
          fields,
          observed_at: now,
          source_priority: 100,
          observation_source: "workflow_state",
          idempotency_key: key,
          canonical_hash: fingerprint,
          provenance: getCurrentAttribution(),
        });
        if (inserted.error)
          throw new GuestTokenRevocationError(503, "Revocation could not be committed.");
        const readback = await db
          .from("observations")
          .select("*")
          .eq("id", observationId)
          .eq("entity_id", entityId)
          .eq("user_id", owner)
          .maybeSingle();
        if (
          readback.error ||
          !readback.data ||
          readback.data.entity_type !== "guest_access_token" ||
          readback.data.idempotency_key !== key ||
          readback.data.canonical_hash !== fingerprint ||
          stableSerialize(parseObservationPayload(readback.data)) !== stableSerialize(fields)
        )
          throw new GuestTokenRevocationError(503, "Revocation readback failed.");
        return {
          revoked: true as const,
          replayed: false,
          token_entity_id: entityId,
          revocation_observation_id: observationId,
          revoked_at: revokedAt,
        };
      });
    } catch (error) {
      if (error instanceof GuestTokenRevocationError) throw error;
      throw new GuestTokenRevocationError(
        503,
        "Revocation storage outcome is unavailable; retry the identical request."
      );
    }
  })();
  if (!receipt.replayed)
    emitObservationCreated({
      user_id: owner,
      entity_id: entityId,
      entity_type: "guest_access_token",
      observation_id: receipt.revocation_observation_id,
      timestamp: receipt.revoked_at,
      observation_source: "workflow_state",
    });
  return receipt;
}
