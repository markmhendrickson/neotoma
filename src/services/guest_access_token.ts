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
  const configured = Number.parseInt(process.env.NEOTOMA_GUEST_TOKEN_TTL_SECONDS ?? "", 10);
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

/**
 * Validate a guest access token and return the entity IDs it covers.
 * Returns null if the token is invalid or not found.
 */
export async function validateGuestAccessToken(token: string): Promise<GuestAccessToken | null> {
  const tokenHash = hashGuestAccessToken(token);
  const tokenEntityId = deriveTokenEntityId(token);

  const record = await readTokenRecord(tokenEntityId);
  if (!record) return null;
  const { observations } = record;
  // A complete revocation for this owner and exact token identity is sticky,
  // regardless of later partial or grant-shaped observations.
  if (
    observations.some((row) => {
      const payload = parseObservationPayload(row);
      return (
        isCompleteTokenPayload(payload, tokenEntityId) &&
        payload.token_hash === tokenHash &&
        payload.revoked_at !== null
      );
    })
  )
    return null;

  for (const obs of observations) {
    const payload = parseObservationPayload(obs);
    if (payload?.token_hash !== tokenHash) {
      continue;
    }

    const revokedAt = typeof payload.revoked_at === "string" ? payload.revoked_at : null;
    if (revokedAt) return null;

    const createdAt = typeof payload.created_at === "string" ? payload.created_at : "";
    const ttlSeconds =
      typeof payload.ttl_seconds === "number" && Number.isFinite(payload.ttl_seconds)
        ? payload.ttl_seconds
        : getGuestTokenTtlSeconds();
    const createdAtMs = Date.parse(createdAt);
    if (!Number.isFinite(createdAtMs)) return null;
    if (Date.now() > createdAtMs + ttlSeconds * 1000) return null;

    return {
      token,
      entity_ids: Array.isArray(payload.entity_ids)
        ? payload.entity_ids.filter((id): id is string => typeof id === "string")
        : [],
      thumbprint: typeof payload.thumbprint === "string" ? payload.thumbprint : undefined,
      created_at: createdAt,
      ttl_seconds: ttlSeconds,
      revoked_at: revokedAt,
    };
  }

  return null;
}

/**
 * Check whether a guest access token grants access to a specific entity.
 */
export async function tokenGrantsAccessTo(token: string, entityId: string): Promise<boolean> {
  const validated = await validateGuestAccessToken(token);
  if (!validated) return false;
  return validated.entity_ids.includes(entityId);
}

export class GuestTokenRevocationError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409 | 503,
    message: string
  ) {
    super(message);
    this.name = "GuestTokenRevocationError";
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

/** Every new successful key retains one complete immutable witness. Replaying
 * that key adds nothing; a different key preserves the first revocation time. */
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
        const original = record.observations.find((row) => row.id === body.expected_observation_id);
        const originalPayload = original ? parseObservationPayload(original) : null;
        if (
          !original ||
          original.entity_type !== "guest_access_token" ||
          !isCompleteTokenPayload(originalPayload, entityId) ||
          originalPayload.revoked_at !== null
        )
          throw new GuestTokenRevocationError(
            409,
            "Expected a complete original token observation."
          );
        const unchanged = (payload: Record<string, unknown>) =>
          stableSerialize({ ...payload, revoked_at: null });
        const full = record.observations.map((row) => ({
          row,
          payload: parseObservationPayload(row),
        }));
        if (
          full.some(
            ({ row, payload }) =>
              row.entity_type !== "guest_access_token" ||
              !isCompleteTokenPayload(payload, entityId) ||
              unchanged(payload) !== unchanged(originalPayload)
          )
        )
          throw new GuestTokenRevocationError(409, "Token history is incomplete or ambiguous.");
        const times = new Set(
          full.map(({ payload }) => payload!.revoked_at).filter((value) => value !== null)
        );
        if (times.size > 1)
          throw new GuestTokenRevocationError(409, "Token revocation history is ambiguous.");
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
              "Idempotency key conflicts with a different request."
            );
          if (
            prior.entity_type !== "guest_access_token" ||
            !isCompleteTokenPayload(priorPayload, entityId) ||
            !priorPayload.revoked_at ||
            unchanged(priorPayload) !== unchanged(originalPayload)
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
        const now = requestedAt;
        const revokedAt = (times.values().next().value as string | undefined) ?? now;
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
