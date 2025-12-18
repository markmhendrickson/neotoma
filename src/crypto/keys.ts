/**
 * Key generation and storage utilities
 * Supports both browser (WebCrypto) and Node.js (@noble/curves)
 */

import { x25519, ed25519 } from "@noble/curves/ed25519.js";
import { randomBytes } from "@noble/hashes/utils.js";
import type { X25519KeyPair, Ed25519KeyPair } from "./types.js";

/**
 * Generate X25519 keypair for encryption
 */
export async function generateX25519KeyPair(): Promise<X25519KeyPair> {
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);

  return {
    type: "x25519",
    privateKey,
    publicKey,
  };
}

/**
 * Generate Ed25519 keypair for signing/authentication
 */
export async function generateEd25519KeyPair(): Promise<Ed25519KeyPair> {
  // Ed25519 uses a 32-byte seed to generate the keypair
  const seed = randomBytes(32);
  const privateKey = seed;
  const publicKey = ed25519.getPublicKey(privateKey);

  return {
    type: "ed25519",
    privateKey,
    publicKey,
  };
}

/**
 * Derive bearer token from Ed25519 public key (base64url encoded)
 */
export function deriveBearerToken(publicKey: Uint8Array): string {
  return base64UrlEncode(publicKey);
}

/**
 * Parse bearer token back to public key
 */
export function parseBearerToken(token: string): Uint8Array {
  return base64UrlDecode(token);
}

/**
 * Base64url encode (URL-safe, no padding)
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
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return new Uint8Array([...binary].map((c) => c.charCodeAt(0)));
}
