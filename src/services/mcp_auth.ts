/**
 * MCP Authentication Service
 *
 * Validates session tokens for MCP server authentication
 */

import { getDb } from "../repositories/db/connection.js";
import { getSharedGraphUserId } from "./google_oidc.js";
import { getLocalAuthUserById } from "./local_auth.js";

export interface ValidatedUser {
  /**
   * Graph scope: the user_id every read and write is scoped to. Under
   * NEOTOMA_SHARED_GRAPH_USER_ID this is the shared graph owner, NOT the person
   * who signed in. This is the authorization principal and must stay the only
   * input to data scoping (#2228).
   */
  userId: string;
  /**
   * Email of the person actually signed in. Under shared-graph mode this is the
   * teammate's verified Google address, not the graph owner's — before #2228 it
   * was resolved from `userId` and so could only ever be the owner's.
   */
  email?: string;
  /** Per-email user_id of the signer, set only when distinct from `userId`. */
  authenticatedUserId?: string;
  /** True when this session's graph scope was remapped by shared-graph mode. */
  sharedGraph?: boolean;
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
      "SELECT user_id, access_token_expires_at, authenticated_user_id, authenticated_email FROM mcp_oauth_connections WHERE access_token = ? AND revoked_at IS NULL"
    )
    .get(token)) as
    | {
        user_id?: string;
        access_token_expires_at?: string;
        authenticated_user_id?: string | null;
        authenticated_email?: string | null;
      }
    | undefined;

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

  // #2228: `user_id` is the graph scope and stays the sole basis for data
  // access. The email, in contrast, must describe the person signed in. When
  // shared-graph mode remapped the scope, the connection row carries the
  // signer's verified identity; prefer it.
  //
  // Rows without authenticated_*:
  //   - Non-shared-graph (E4): fall back to getLocalAuthUserById(user_id) —
  //     user_id IS the signer, so the lookup is correct.
  //   - Shared-graph residual (E4b): user_id is the SHARED OWNER. Looking up
  //     email from it fabricates the owner's address as "who signed in" —
  //     the #2228 failure class until re-auth. Omit email and still emit
  //     sharedGraph so consumers degrade instead of mislabeling.
  const authenticatedEmail = connection.authenticated_email ?? undefined;
  const authenticatedUserId = connection.authenticated_user_id ?? undefined;
  const sharedOwnerId = getSharedGraphUserId();
  const isSharedGraphScope = Boolean(sharedOwnerId && connection.user_id === sharedOwnerId);

  let email: string | undefined = authenticatedEmail;
  if (!email && !isSharedGraphScope) {
    email = (await getLocalAuthUserById(connection.user_id))?.email;
  }

  // Remapped identity columns, OR a shared-scope row with no recorded signer
  // (pre-migration residual — degraded but still shared-graph).
  const sharedGraph =
    Boolean(authenticatedUserId && authenticatedUserId !== connection.user_id) ||
    (isSharedGraphScope && !authenticatedEmail);

  return {
    userId: connection.user_id,
    ...(email ? { email } : {}),
    ...(sharedGraph
      ? {
          sharedGraph: true as const,
          ...(authenticatedUserId ? { authenticatedUserId } : {}),
        }
      : {}),
  };
}
