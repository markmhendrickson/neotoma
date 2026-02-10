/**
 * Log encryption utilities for Neotoma
 *
 * Encrypts individual log lines (JSONL format) with AES-256-GCM using the
 * Log Key derived from the user's private key or mnemonic.
 *
 * Format: each line is iv:authTag:ciphertext (hex), one per line.
 *
 * Design decisions:
 * - Per-entry IV ensures unique ciphertext per line
 * - No global file key; each line is independently decryptable
 * - Works with log rotation (each file is a sequence of encrypted lines)
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { readFileSync } from "fs";
import { config } from "../config.js";
import { deriveKeys, deriveKeysFromMnemonic, hexToKey } from "../crypto/key_derivation.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/** Cached log encryption key */
let cachedLogKey: Uint8Array | null = null;

/**
 * Load the log encryption key from config.
 * Returns null if log encryption is not enabled.
 */
export function getLogKey(): Uint8Array | null {
  if (!config.encryption.enabled || !config.encryption.logEncryptionEnabled) {
    return null;
  }
  if (cachedLogKey) {
    return cachedLogKey;
  }

  if (config.encryption.keyFilePath) {
    const raw = readFileSync(config.encryption.keyFilePath, "utf8").trim();
    const keyBytes = hexToKey(raw);
    const derived = deriveKeys(keyBytes);
    cachedLogKey = derived.logKey;
    return cachedLogKey;
  }

  if (config.encryption.mnemonic) {
    const derived = deriveKeysFromMnemonic(
      config.encryption.mnemonic,
      config.encryption.mnemonicPassphrase,
    );
    cachedLogKey = derived.logKey;
    return cachedLogKey;
  }

  throw new Error(
    "Log encryption is enabled but no key source configured. " +
    "Set NEOTOMA_KEY_FILE_PATH or NEOTOMA_MNEMONIC."
  );
}

/**
 * Clear the cached log key (for testing or key rotation).
 */
export function clearCachedLogKey(): void {
  cachedLogKey = null;
}

/**
 * Encrypt a single log line for persistent storage.
 *
 * @param plaintext - The JSON log line to encrypt
 * @param key - 32-byte AES-256 key (Log Key)
 * @returns Encrypted string in iv:authTag:ciphertext format
 */
export function encryptLogLine(plaintext: string, key: Uint8Array): string {
  if (key.length !== 32) {
    throw new Error("Log encryption key must be exactly 32 bytes");
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
 * Decrypt a single encrypted log line.
 *
 * @param encrypted - Encrypted line in iv:authTag:ciphertext format
 * @param key - 32-byte AES-256 key (same Log Key used for encryption)
 * @returns Decrypted plaintext string
 */
export function decryptLogLine(encrypted: string, key: Uint8Array): string {
  if (key.length !== 32) {
    throw new Error("Log decryption key must be exactly 32 bytes");
  }

  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted log line format (expected iv:authTag:ciphertext)");
  }

  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const ciphertext = parts[2];

  const decipher = createDecipheriv(ALGORITHM, Buffer.from(key), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Check if a line looks like an encrypted log line.
 */
export function isEncryptedLogLine(line: string): boolean {
  if (!line || typeof line !== "string") {
    return false;
  }
  const parts = line.split(":");
  if (parts.length !== 3) {
    return false;
  }
  return (
    parts[0].length === 32 &&
    parts[1].length === 32 &&
    parts[2].length > 0 &&
    /^[0-9a-f]+$/.test(parts[0]) &&
    /^[0-9a-f]+$/.test(parts[1]) &&
    /^[0-9a-f]+$/.test(parts[2])
  );
}
