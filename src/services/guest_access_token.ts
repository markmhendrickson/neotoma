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
import { logger } from "../utils/logger.js";

export interface GuestAccessToken {
  token: string;
  entity_ids: string[];
  thumbprint?: string;
  created_at: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function deriveTokenEntityId(token: string): string {
  return `guest_token_${hashToken(token).slice(0, 16)}`;
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

  try {
    await db.from("observations").insert({
      id: randomUUID(),
      entity_id: deriveTokenEntityId(token),
      entity_type: "guest_access_token",
      user_id: params.userId,
      payload: JSON.stringify({
        token_hash: hashToken(token),
        entity_ids: params.entityIds,
        thumbprint: params.thumbprint ?? null,
        created_at: now,
      }),
      observed_at: now,
      source_priority: 100,
    });
  } catch (err) {
    logger.warn("guest_access_token generation failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return token;
}

/**
 * Validate a guest access token and return the entity IDs it covers.
 * Returns null if the token is invalid or not found.
 */
export async function validateGuestAccessToken(token: string): Promise<GuestAccessToken | null> {
  const tokenHash = hashToken(token);

  const { data: observations } = await db
    .from("observations")
    .select("payload")
    .eq("entity_type", "guest_access_token")
    .order("observed_at", { ascending: false });

  if (!observations || observations.length === 0) return null;

  for (const obs of observations) {
    try {
      const payload = typeof obs.payload === "string" ? JSON.parse(obs.payload) : obs.payload;
      if (payload?.token_hash === tokenHash) {
        return {
          token,
          entity_ids: payload.entity_ids ?? [],
          thumbprint: payload.thumbprint ?? undefined,
          created_at: payload.created_at ?? "",
        };
      }
    } catch {
      continue;
    }
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
