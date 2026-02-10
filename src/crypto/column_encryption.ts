/**
 * Column-level encryption for SQLite DB fields
 *
 * Uses AES-256-GCM with per-value random IV.
 * Storage format: iv:authTag:ciphertext (all hex-encoded)
 *
 * Design decisions (see plan Section 7 - blockchain compatibility):
 * - Only content/payload columns are encrypted (never IDs, timestamps, hashes, signatures)
 * - Hash-chain integrity uses ciphertext: event_hash = hash(ciphertext || metadata)
 * - Encryption/decryption happens in the repository layer only
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 128-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

/**
 * Encrypt a string value for storage in a DB column.
 *
 * @param plaintext - The value to encrypt (typically JSON-stringified)
 * @param key - 32-byte AES-256 key (Data Key from key_derivation)
 * @returns Encrypted string in format iv:authTag:ciphertext (hex)
 */
export function encryptColumn(plaintext: string, key: Uint8Array): string {
  if (key.length !== 32) {
    throw new Error("Encryption key must be exactly 32 bytes");
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, Buffer.from(key), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt a column value from the iv:authTag:ciphertext format.
 *
 * @param encrypted - Encrypted string in format iv:authTag:ciphertext (hex)
 * @param key - 32-byte AES-256 key (same Data Key used for encryption)
 * @returns Decrypted plaintext string
 * @throws Error if decryption fails (wrong key, tampered data, bad format)
 */
export function decryptColumn(encrypted: string, key: Uint8Array): string {
  if (key.length !== 32) {
    throw new Error("Decryption key must be exactly 32 bytes");
  }

  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted column format (expected iv:authTag:ciphertext)");
  }

  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const ciphertext = parts[2];

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH}, got ${authTag.length}`);
  }

  const decipher = createDecipheriv(ALGORITHM, Buffer.from(key), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Check whether a string value looks like an encrypted column (iv:authTag:ciphertext hex format).
 *
 * Useful for backward compatibility: detect whether a value is plaintext or already encrypted.
 *
 * @param value - The string to check
 * @returns true if the value matches the encrypted column format
 */
export function isEncryptedColumn(value: string): boolean {
  if (!value || typeof value !== "string") {
    return false;
  }
  const parts = value.split(":");
  if (parts.length !== 3) {
    return false;
  }
  // IV = 32 hex chars (16 bytes), authTag = 32 hex chars (16 bytes), ciphertext = any length
  return (
    parts[0].length === 32 &&
    parts[1].length === 32 &&
    parts[2].length > 0 &&
    /^[0-9a-f]+$/.test(parts[0]) &&
    /^[0-9a-f]+$/.test(parts[1]) &&
    /^[0-9a-f]+$/.test(parts[2])
  );
}
