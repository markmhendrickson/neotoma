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

    return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
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
 * Returns null if the token is invalid, expired, revoked, or not found.
 *
 * Lifetime is bounded twice: by the TTL stored on the token and by the
 * currently configured TTL, measured from the earliest recorded creation time
 * for the token. A later observation can therefore neither lift a revocation
 * nor extend the lifetime.
 */
export async function validateGuestAccessToken(token: string): Promise<GuestAccessToken | null> {
  const tokenHash = hashGuestAccessToken(token);
  const tokenEntityId = deriveTokenEntityId(token);

  const { data: observations } = await db
    .from("observations")
    .select("fields")
    .eq("entity_id", tokenEntityId)
    .order("observed_at", { ascending: false });

  if (!observations || observations.length === 0) return null;

  const matching: Record<string, unknown>[] = [];
  for (const obs of observations) {
    const payload = parseObservationPayload(obs);
    if (payload?.token_hash === tokenHash) matching.push(payload);
  }
  if (matching.length === 0) return null;

  // Any revocation record revokes the token.
  for (const payload of matching) {
    if (typeof payload.revoked_at === "string" && payload.revoked_at) return null;
  }

  const configuredTtl = getGuestTokenTtlSeconds();
  let createdAtMs = Number.POSITIVE_INFINITY;
  let ttlSeconds = configuredTtl;
  for (const payload of matching) {
    const ms = typeof payload.created_at === "string" ? Date.parse(payload.created_at) : NaN;
    if (!Number.isFinite(ms)) return null;
    createdAtMs = Math.min(createdAtMs, ms);
    if (typeof payload.ttl_seconds === "number" && Number.isFinite(payload.ttl_seconds)) {
      ttlSeconds = Math.min(ttlSeconds, payload.ttl_seconds);
    }
  }
  if (!(ttlSeconds > 0)) return null;
  if (Date.now() > createdAtMs + ttlSeconds * 1000) return null;

  const latest = matching[0];
  return {
    token,
    entity_ids: Array.isArray(latest.entity_ids)
      ? latest.entity_ids.filter((id): id is string => typeof id === "string")
      : [],
    thumbprint: typeof latest.thumbprint === "string" ? latest.thumbprint : undefined,
    created_at: new Date(createdAtMs).toISOString(),
    ttl_seconds: ttlSeconds,
    revoked_at: null,
  };
}

export type GuestTokenEntityCheck =
  | { state: "granted"; grant: GuestAccessToken }
  | { state: "invalid" }
  | { state: "other_entity"; grant: GuestAccessToken };

/**
 * The single check applied wherever a guest access token is presented for an
 * entity: the token must exist, be unexpired and unrevoked, and name exactly
 * this entity. Every guest-readable route resolves its token through here.
 */
export async function checkGuestTokenForEntity(
  token: string,
  entityId: string
): Promise<GuestTokenEntityCheck> {
  const grant = await validateGuestAccessToken(token);
  if (!grant) return { state: "invalid" };
  return grant.entity_ids.includes(entityId)
    ? { state: "granted", grant }
    : { state: "other_entity", grant };
}

/**
 * Check whether a guest access token grants access to a specific entity.
 */
export async function tokenGrantsAccessTo(token: string, entityId: string): Promise<boolean> {
  return (await checkGuestTokenForEntity(token, entityId)).state === "granted";
}
