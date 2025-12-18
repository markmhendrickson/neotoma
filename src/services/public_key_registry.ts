/**
 * Public key registry for authentication
 * Maps bearer tokens (base64url-encoded public keys) to user identities
 */

import { parseBearerToken } from "../crypto/keys.js";

// In-memory registry (in production, use persistent storage)
const publicKeyRegistry = new Map<
  string,
  {
    publicKey: Uint8Array;
    userId?: string;
    createdAt: Date;
    lastUsed: Date;
  }
>();

/**
 * Register a public key (derived from bearer token)
 */
export function registerPublicKey(bearerToken: string, userId?: string): void {
  try {
    const publicKey = parseBearerToken(bearerToken);
    publicKeyRegistry.set(bearerToken, {
      publicKey,
      userId,
      createdAt: new Date(),
      lastUsed: new Date(),
    });
  } catch (error) {
    throw new Error("Invalid bearer token format");
  }
}

/**
 * Get public key from bearer token
 */
export function getPublicKey(bearerToken: string): Uint8Array | null {
  const entry = publicKeyRegistry.get(bearerToken);
  if (!entry) {
    return null;
  }

  // Update last used timestamp
  entry.lastUsed = new Date();
  return entry.publicKey;
}

/**
 * Verify bearer token is registered
 */
export function isBearerTokenValid(bearerToken: string): boolean {
  return publicKeyRegistry.has(bearerToken);
}

/**
 * Auto-register public key if not exists (for first-time users)
 * Returns true if registration succeeded, false if token format is invalid
 */
export function ensurePublicKeyRegistered(bearerToken: string): boolean {
  if (publicKeyRegistry.has(bearerToken)) {
    return true;
  }
  try {
    registerPublicKey(bearerToken);
    return true;
  } catch (error) {
    // Invalid bearer token format - return false instead of throwing
    return false;
  }
}

/**
 * Get all registered public keys (for admin/debugging)
 */
export function getAllPublicKeys(): Array<{
  bearerToken: string;
  userId?: string;
  createdAt: Date;
}> {
  return Array.from(publicKeyRegistry.entries()).map(([token, entry]) => ({
    bearerToken: token,
    userId: entry.userId,
    createdAt: entry.createdAt,
  }));
}
