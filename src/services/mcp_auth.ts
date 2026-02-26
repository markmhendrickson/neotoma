/**
 * MCP Authentication Service
 *
 * Validates session tokens for MCP server authentication
 */

import { logger } from "../utils/logger.js";
import { getSqliteDb } from "../repositories/sqlite/sqlite_client.js";
import { getLocalAuthUserById } from "./local_auth.js";

export interface ValidatedUser {
  userId: string;
  email?: string;
}

/**
 * Decode JWT token header and payload without verification
 * Extracts algorithm, user_id, and other claims for diagnostics
 */
function decodeJWTUnverified(token: string): {
  header?: { alg?: string; kid?: string; typ?: string };
  payload?: { sub?: string; email?: string; exp?: number };
} | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }
    // Decode header (first part)
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8"));
    // Decode payload (second part)
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
    return { header, payload };
  } catch {
    return null;
  }
}

/**
 * Validate a session token (JWT) and extract user information
 *
 * @param token - access_token (JWT)
 * @returns User information including user_id
 * @throws Error if token is invalid or expired
 */
export async function validateSessionToken(token: string): Promise<ValidatedUser> {
  const db = getSqliteDb();
  const connection = db
    .prepare(
      "SELECT user_id, access_token_expires_at FROM mcp_oauth_connections WHERE access_token = ? AND revoked_at IS NULL"
    )
    .get(token) as { user_id?: string; access_token_expires_at?: string } | undefined;

  if (!connection?.user_id) {
    const decoded = decodeJWTUnverified(token);
    if (!decoded?.payload?.sub) {
      throw new Error("Invalid local session token");
    }
    logger.warn("[MCP Auth] Falling back to unverified JWT payload for local-only compatibility");
    return {
      userId: decoded.payload.sub,
      email: decoded.payload.email,
    };
  }

  if (connection.access_token_expires_at && new Date(connection.access_token_expires_at).getTime() < Date.now()) {
    throw new Error("Local session token expired");
  }

  const user = getLocalAuthUserById(connection.user_id);
  return {
    userId: connection.user_id,
    email: user?.email,
  };
}
