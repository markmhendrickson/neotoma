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

function parseObservationPayload(obs: { fields?: unknown; payload?: unknown }): Record<string, unknown> | null {
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
    throw new Error(`Failed to persist guest access token entity: ${entityError.message ?? entityError}`);
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
    throw new Error(`Failed to persist guest access token observation: ${observationError.message ?? observationError}`);
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

  const { data: observations } = await db
    .from("observations")
    .select("fields")
    .eq("entity_id", tokenEntityId)
    .order("observed_at", { ascending: false });

  if (!observations || observations.length === 0) return null;

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
