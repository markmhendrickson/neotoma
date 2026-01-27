/**
 * MCP Authentication Service
 * 
 * Validates Supabase session tokens for MCP server authentication
 */

import { supabase } from "../db.js";
import { logger } from "../utils/logger.js";

export interface ValidatedUser {
  userId: string;
  email?: string;
}

/**
 * Validate a Supabase session token (JWT) and extract user information
 * 
 * @param token - Supabase access_token (JWT)
 * @returns User information including user_id
 * @throws Error if token is invalid or expired
 */
export async function validateSupabaseSessionToken(
  token: string
): Promise<ValidatedUser> {
  try {
    // Use Supabase client to verify token and get user
    const { data, error } = await supabase.auth.getUser(token);

    if (error) {
      logger.error(`[MCP Auth] Token validation failed: ${error.message}`);
      throw new Error(`Invalid session token: ${error.message}`);
    }

    if (!data.user) {
      logger.error("[MCP Auth] No user found in token");
      throw new Error("Invalid session token: No user found");
    }

    logger.error(`[MCP Auth] Token validated successfully for user: ${data.user.id}`);

    return {
      userId: data.user.id,
      email: data.user.email,
    };
  } catch (error: any) {
    logger.error(`[MCP Auth] Token validation error: ${error.message}`);
    throw new Error(`Token validation failed: ${error.message}`);
  }
}
