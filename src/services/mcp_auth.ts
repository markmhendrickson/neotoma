/**
 * MCP Authentication Service
 *
 * Validates Supabase session tokens for MCP server authentication
 */

import { supabase } from "../db.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
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
  } catch (error) {
    return null;
  }
}

/**
 * Validate a Supabase session token (JWT) and extract user information
 *
 * @param token - Supabase access_token (JWT)
 * @returns User information including user_id
 * @throws Error if token is invalid or expired
 */
export async function validateSupabaseSessionToken(token: string): Promise<ValidatedUser> {
  if (config.storageBackend === "local") {
    const db = getSqliteDb();
    const connection = db
      .prepare(
        "SELECT user_id, access_token_expires_at FROM mcp_oauth_connections WHERE access_token = ? AND revoked_at IS NULL"
      )
      .get(token) as { user_id?: string; access_token_expires_at?: string } | undefined;

    if (!connection?.user_id) {
      throw new Error("Invalid local session token");
    }

    if (
      connection.access_token_expires_at &&
      new Date(connection.access_token_expires_at).getTime() < Date.now()
    ) {
      throw new Error("Local session token expired");
    }

    const user = getLocalAuthUserById(connection.user_id);
    return {
      userId: connection.user_id,
      email: user?.email,
    };
  }

  try {
    // Use Supabase client to verify token and get user
    const { data, error } = await supabase.auth.getUser(token);

    if (error) {
      // Check if error is signing method-related (ES256/HS256 mismatch during key rotation)
      // This can happen when old tokens (HS256) are validated against new keys (ES256) or vice versa
      if (
        error.message?.includes("ES256") ||
        error.message?.includes("HS256") ||
        error.message?.includes("signing method")
      ) {
        const decoded = decodeJWTUnverified(token);
        const algorithm = decoded?.header?.alg || "unknown";
        const tokenExp = decoded?.payload?.exp;
        const isExpired = tokenExp ? Date.now() / 1000 > tokenExp : false;

        logger.warn(
          `[MCP Auth] Signing method validation error (likely key rotation transition). ` +
            `Token algorithm: ${algorithm}, Error: ${error.message}. ` +
            `Token expired: ${isExpired}. Attempting fallback decode.`
        );

        if (decoded?.payload?.sub) {
          if (isExpired) {
            logger.warn(
              `[MCP Auth] Token is expired. User must re-authenticate to get new ES256 token.`
            );
            throw new Error(`Invalid session token: Token expired. Please re-authenticate.`);
          }

          logger.warn(
            `[MCP Auth] Using fallback token decode for user: ${decoded.payload.sub} ` +
              `(algorithm: ${algorithm}, signature not verified - user should re-authenticate for new ES256 token)`
          );
          return {
            userId: decoded.payload.sub,
            email: decoded.payload.email,
          };
        }
      }

      logger.error(`[MCP Auth] Token validation failed: ${error.message}`);
      throw new Error(`Invalid session token: ${error.message}`);
    }

    if (!data?.user) {
      logger.error("[MCP Auth] No user found in token");
      throw new Error("Invalid session token: No user found");
    }

    logger.error(`[MCP Auth] Token validated successfully for user: ${data.user.id}`);

    return {
      userId: data.user.id,
      email: data.user.email ?? undefined,
    };
  } catch (error: any) {
    // If error is signing method-related, try fallback decode
    if (
      error.message?.includes("ES256") ||
      error.message?.includes("HS256") ||
      error.message?.includes("signing method")
    ) {
      const decoded = decodeJWTUnverified(token);
      const algorithm = decoded?.header?.alg || "unknown";
      const tokenExp = decoded?.payload?.exp;
      const isExpired = tokenExp ? Date.now() / 1000 > tokenExp : false;

      logger.warn(
        `[MCP Auth] Signing method validation error in catch block. ` +
          `Token algorithm: ${algorithm}, Error: ${error.message}. ` +
          `Token expired: ${isExpired}. Attempting fallback.`
      );

      if (decoded?.payload?.sub) {
        if (isExpired) {
          logger.warn(
            `[MCP Auth] Token is expired. User must re-authenticate to get new ES256 token.`
          );
          throw new Error(`Invalid session token: Token expired. Please re-authenticate.`);
        }

        logger.warn(
          `[MCP Auth] Using fallback token decode for user: ${decoded.payload.sub} ` +
            `(algorithm: ${algorithm}, signature not verified - user should re-authenticate for new ES256 token)`
        );
        return {
          userId: decoded.payload.sub,
          email: decoded.payload.email,
        };
      }
    }

    logger.error(`[MCP Auth] Token validation error: ${error.message}`);
    throw new Error(`Token validation failed: ${error.message}`);
  }
}
