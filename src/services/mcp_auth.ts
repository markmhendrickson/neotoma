/**
 * MCP Authentication Service
 *
 * Validates session tokens for MCP server authentication
 */

import { getDb } from "../repositories/db/connection.js";
import { getLocalAuthUserById } from "./local_auth.js";

export interface ValidatedUser {
  userId: string;
  email?: string;
}

/**
 * Validate a session token and extract user information.
 *
 * A session token is valid only if it maps to a live (non-revoked, unexpired)
 * row in `mcp_oauth_connections`. A token that matches no such row is rejected
 * — claims decoded from the token itself are never trusted.
 *
 * SECURITY: a previous revision fell back to decoding the bearer as an
 * UNVERIFIED JWT and trusting its `sub`/`email` claims when no connection row
 * matched. That is an authentication bypass: the token is fully
 * attacker-controlled, so `Bearer <base64url({alg:none})>.<base64url({sub:<any
 * user_id>})>.x` authenticated the caller as any user over the public internet
 * (there was no local-only gate despite the "local-only" comment; the claimed
 * `user_id` is derivable as sha256(email)). The fix enforces the same
 * fail-closed invariant the Ed25519 bearer path adopted after advisory
 * 2026-08-07-ed25519-bearer-forged-key-auth-bypass: a bearer that does not
 * resolve to a pre-provisioned principal must be rejected, never mapped to a
 * caller-supplied identity.
 *
 * @param token - access_token issued by the OAuth flow
 * @returns User information including user_id
 * @throws Error if the token is unknown, revoked, or expired
 */
export async function validateSessionToken(token: string): Promise<ValidatedUser> {
  const db = await getDb();
  const connection = (await db
    .prepare(
      "SELECT user_id, access_token_expires_at FROM mcp_oauth_connections WHERE access_token = ? AND revoked_at IS NULL"
    )
    .get(token)) as { user_id?: string; access_token_expires_at?: string } | undefined;

  if (!connection?.user_id) {
    // Fail closed: a bearer that matches no live connection is not a valid
    // session. Never decode and trust the token's own claims (see SECURITY
    // note above).
    throw new Error("Invalid session token");
  }

  if (
    connection.access_token_expires_at &&
    new Date(connection.access_token_expires_at).getTime() < Date.now()
  ) {
    throw new Error("Local session token expired");
  }

  const user = await getLocalAuthUserById(connection.user_id);
  return {
    userId: connection.user_id,
    email: user?.email,
  };
}
