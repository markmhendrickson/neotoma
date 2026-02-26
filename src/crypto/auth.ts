/**
 * Request authentication utilities
 * Signs HTTP requests and MCP messages with Ed25519
 */

import { signMessage, verifySignature } from "./signature.js";
import { deriveBearerToken, parseBearerToken } from "./keys.js";
import type { Ed25519KeyPair } from "./types.js";

/**
 * Sign HTTP request body for authentication
 * Returns signature that can be included in Authorization header or request body
 */
export function signRequest(
  body: Uint8Array | string,
  keyPair: Ed25519KeyPair,
): { signature: string; bearerToken: string } {
  const message =
    typeof body === "string" ? new TextEncoder().encode(body) : body;
  const signature = signMessage(message, keyPair.privateKey);

  // Base64url encode signature
  const signatureStr = base64UrlEncode(signature);
  const bearerToken = deriveBearerToken(keyPair.publicKey);

  return { signature: signatureStr, bearerToken };
}

/**
 * Verify request signature
 */
export function verifyRequest(
  body: Uint8Array | string,
  signature: string,
  bearerToken: string,
): boolean {
  try {
    const message =
      typeof body === "string" ? new TextEncoder().encode(body) : body;
    const signatureBytes = base64UrlDecode(signature);
    if (signatureBytes.length === 0) {
      return false; // Invalid signature encoding
    }
    const publicKey = parseBearerToken(bearerToken);
    if (publicKey.length === 0) {
      return false; // Invalid bearer token
    }
    return verifySignature(message, signatureBytes, publicKey);
  } catch {
    return false;
  }
}

/**
 * Create Authorization header value with signature
 * Format: Bearer <token> Signature <signature>
 */
export function createAuthHeader(
  body: Uint8Array | string,
  keyPair: Ed25519KeyPair,
): string {
  const { signature, bearerToken } = signRequest(body, keyPair);
  return `Bearer ${bearerToken} Signature ${signature}`;
}

/**
 * Parse Authorization header
 */
export function parseAuthHeader(header: string): {
  bearerToken: string;
  signature?: string;
} {
  const parts = header.split(" ");
  const bearerIndex = parts.indexOf("Bearer");
  const signatureIndex = parts.indexOf("Signature");

  const bearerToken =
    bearerIndex >= 0 && parts[bearerIndex + 1] ? parts[bearerIndex + 1] : "";
  const signature =
    signatureIndex >= 0 && parts[signatureIndex + 1]
      ? parts[signatureIndex + 1]
      : undefined;

  return { bearerToken, signature };
}

/**
 * Base64url encode
 */
function base64UrlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Base64url decode
 */
function base64UrlDecode(str: string): Uint8Array {
  try {
    const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    return new Uint8Array([...binary].map((c) => c.charCodeAt(0)));
  } catch {
    // Return empty array for invalid base64 strings
    return new Uint8Array(0);
  }
}
