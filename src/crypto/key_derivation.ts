/**
 * Key derivation utilities for Neotoma local encryption
 *
 * Derives separate Auth, Data, and Log keys from a single root secret
 * (Ed25519 private key bytes or BIP-39 mnemonic-derived seed) using HKDF.
 *
 * Design decisions (see plan Section 7 - blockchain compatibility):
 * - Auth Key is Ed25519-compatible for future event signing
 * - Data Key encrypts DB column content only (never chain/signature metadata)
 * - Log Key encrypts persistent log entries
 * - Encryption lives in the repository layer; domain code sees plaintext
 */

import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { ed25519 } from "@noble/curves/ed25519.js";

// HKDF info strings for key separation
const AUTH_INFO = new TextEncoder().encode("neotoma-auth-v1");
const DATA_INFO = new TextEncoder().encode("neotoma-data-v1");
const LOG_INFO = new TextEncoder().encode("neotoma-logs-v1");
const MCP_AUTH_INFO = new TextEncoder().encode("neotoma-mcp-auth-v1");

// BIP-39 uses "mnemonic" + passphrase as PBKDF2 salt
const BIP39_SALT_PREFIX = "mnemonic";
const BIP39_ITERATIONS = 2048;
const BIP39_KEY_LENGTH = 64; // 512-bit seed per BIP-39

/**
 * Derived key set from a single root secret
 */
export interface DerivedKeys {
  /** 32-byte key for Ed25519 signing and authentication */
  authKey: Uint8Array;
  /** 32-byte key for AES-256-GCM column/data encryption */
  dataKey: Uint8Array;
  /** 32-byte key for AES-256-GCM log encryption */
  logKey: Uint8Array;
}

/**
 * Auth identity derived from the auth key
 */
export interface AuthIdentity {
  /** Ed25519 private key (seed) for signing */
  privateKey: Uint8Array;
  /** Ed25519 public key for verification */
  publicKey: Uint8Array;
}

/**
 * Derive Auth, Data, and Log keys from raw key material (private key bytes).
 *
 * @param ikm - Input keying material (e.g. 32-byte Ed25519 private key seed)
 * @param salt - Optional salt; if omitted, HKDF uses a zero-filled salt of hash length
 * @returns DerivedKeys with authKey, dataKey, logKey (each 32 bytes)
 */
export function deriveKeys(ikm: Uint8Array, salt?: Uint8Array): DerivedKeys {
  if (ikm.length < 16) {
    throw new Error("Input keying material must be at least 16 bytes");
  }

  const authKey = hkdf(sha256, ikm, salt, AUTH_INFO, 32);
  const dataKey = hkdf(sha256, ikm, salt, DATA_INFO, 32);
  const logKey = hkdf(sha256, ikm, salt, LOG_INFO, 32);

  return { authKey, dataKey, logKey };
}

/**
 * Derive a BIP-39-compatible seed from a mnemonic phrase.
 *
 * Uses PBKDF2-HMAC-SHA512 with 2048 iterations per BIP-39 spec.
 * The resulting 64-byte seed is then used as HKDF input keying material.
 *
 * @param mnemonic - Space-separated mnemonic words (12 or 24 words)
 * @param passphrase - Optional BIP-39 passphrase (default: empty string)
 * @returns 64-byte seed
 */
export function mnemonicToSeed(mnemonic: string, passphrase: string = ""): Uint8Array {
  const normalized = mnemonic.normalize("NFKD").trim();
  if (!normalized) {
    throw new Error("Mnemonic must not be empty");
  }

  const words = normalized.split(/\s+/);
  if (words.length !== 12 && words.length !== 24) {
    throw new Error(`Mnemonic must be 12 or 24 words (got ${words.length})`);
  }

  const salt = BIP39_SALT_PREFIX + passphrase.normalize("NFKD");
  const mnemonicBytes = new TextEncoder().encode(normalized);
  const saltBytes = new TextEncoder().encode(salt);

  return pbkdf2(sha256, mnemonicBytes, saltBytes, {
    c: BIP39_ITERATIONS,
    dkLen: BIP39_KEY_LENGTH,
  });
}

/**
 * Derive keys from a mnemonic phrase.
 *
 * Combines mnemonicToSeed + deriveKeys in one step.
 *
 * @param mnemonic - Space-separated mnemonic words (12 or 24 words)
 * @param passphrase - Optional BIP-39 passphrase
 * @returns DerivedKeys
 */
export function deriveKeysFromMnemonic(mnemonic: string, passphrase: string = ""): DerivedKeys {
  const seed = mnemonicToSeed(mnemonic, passphrase);
  return deriveKeys(seed);
}

/**
 * Derive an Ed25519 signing identity from the auth key.
 *
 * The auth key (32 bytes from HKDF) is used as the Ed25519 seed.
 * This produces a deterministic keypair suitable for authentication
 * and future event signing.
 *
 * @param authKey - 32-byte auth key from deriveKeys()
 * @returns AuthIdentity with privateKey and publicKey
 */
export function deriveAuthIdentity(authKey: Uint8Array): AuthIdentity {
  if (authKey.length !== 32) {
    throw new Error("Auth key must be exactly 32 bytes");
  }

  const publicKey = ed25519.getPublicKey(authKey);

  return {
    privateKey: authKey,
    publicKey,
  };
}

/**
 * Derive a static MCP auth token from the same root secret (key file or mnemonic).
 * Used when encryption is enabled: client and server both derive this token;
 * client sends it as Authorization: Bearer <token>, server verifies.
 *
 * @param ikm - Input keying material (same as for deriveKeys: key file bytes or mnemonic seed)
 * @returns 64-char hex string (32 bytes)
 */
export function deriveMcpAuthToken(ikm: Uint8Array): string {
  if (ikm.length < 16) {
    throw new Error("Input keying material must be at least 16 bytes");
  }
  const tokenBytes = hkdf(sha256, ikm, undefined, MCP_AUTH_INFO, 32);
  return keyToHex(tokenBytes);
}

/**
 * Convert a 32-byte key to a hex string (for use with Node.js crypto APIs).
 */
export function keyToHex(key: Uint8Array): string {
  return Array.from(key)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convert a hex string back to Uint8Array.
 */
export function hexToKey(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Hex string must have even length");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
