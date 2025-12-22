#!/usr/bin/env node

/**
 * Simple Encrypted Secrets Manager
 * 
 * Stores secrets in an encrypted file using AES-256-GCM.
 * The encryption key is derived from a master password (stored separately or provided via env var).
 * 
 * Usage:
 *   node scripts/secrets_manager.js set <key> <value>
 *   node scripts/secrets_manager.js get <key>
 *   node scripts/secrets_manager.js list
 *   node scripts/secrets_manager.js delete <key>
 */

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync, scryptSync } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SECRETS_DIR = join(__dirname, "..", ".secrets");
const SECRETS_FILE = join(SECRETS_DIR, "secrets.enc");
const KEY_FILE = join(SECRETS_DIR, ".key");

// Algorithm configuration
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;

/**
 * Get or generate encryption key
 */
function getEncryptionKey() {
  // Check for master key in environment variable (preferred for CI/CD)
  if (process.env.NEOTOMA_SECRETS_MASTER_KEY) {
    return Buffer.from(process.env.NEOTOMA_SECRETS_MASTER_KEY, "hex");
  }

  // Check for key file (for local development)
  if (existsSync(KEY_FILE)) {
    try {
      const keyHex = readFileSync(KEY_FILE, "utf-8").trim();
      return Buffer.from(keyHex, "hex");
    } catch (error) {
      console.error(`[ERROR] Failed to read key file: ${error.message}`);
      process.exit(1);
    }
  }

  // Generate new key if none exists
  console.warn(
    `[WARN] No encryption key found. Generating new key at ${KEY_FILE}`
  );
  console.warn(
    "[WARN] Save this key securely! You'll need it to decrypt secrets."
  );

  const key = randomBytes(KEY_LENGTH);
  mkdirSync(SECRETS_DIR, { recursive: true });
  writeFileSync(KEY_FILE, key.toString("hex"), { mode: 0o600 });

  console.warn(`[WARN] Key saved to ${KEY_FILE} (chmod 600)`);
  return key;
}

/**
 * Encrypt data
 */
function encrypt(plaintext, key) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Format: salt:iv:tag:encrypted
  return {
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    encrypted: encrypted,
  };
}

/**
 * Decrypt data
 */
function decrypt(encryptedData, key) {
  const { iv, authTag, encrypted } = encryptedData;

  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTag, "hex"));

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Load encrypted secrets from file
 */
function loadSecrets() {
  if (!existsSync(SECRETS_FILE)) {
    return {};
  }

  try {
    const key = getEncryptionKey();
    const encryptedData = JSON.parse(readFileSync(SECRETS_FILE, "utf-8"));
    const decryptedJson = decrypt(encryptedData, key);
    return JSON.parse(decryptedJson);
  } catch (error) {
    console.error(`[ERROR] Failed to load secrets: ${error.message}`);
    console.error(
      "[ERROR] If you've lost the encryption key, secrets cannot be recovered."
    );
    process.exit(1);
  }
}

/**
 * Save secrets to encrypted file
 */
function saveSecrets(secrets) {
  const key = getEncryptionKey();
  const jsonData = JSON.stringify(secrets, null, 2);
  const encryptedData = encrypt(jsonData, key);

  mkdirSync(SECRETS_DIR, { recursive: true });
  writeFileSync(SECRETS_FILE, JSON.stringify(encryptedData, null, 2), {
    mode: 0o600,
  });
}

/**
 * CLI commands
 */
function main() {
  const command = process.argv[2];
  const key = process.argv[3];
  const value = process.argv[4];

  if (!command) {
    console.error("Usage: node scripts/secrets_manager.js <command> [args]");
    console.error("Commands:");
    console.error("  set <key> <value>  - Store a secret");
    console.error("  get <key>          - Retrieve a secret");
    console.error("  list               - List all secret keys");
    console.error("  delete <key>       - Delete a secret");
    console.error("  export             - Export all secrets as key=value pairs");
    process.exit(1);
  }

  const secrets = loadSecrets();

  switch (command) {
    case "set":
      if (!key || !value) {
        console.error("[ERROR] Usage: set <key> <value>");
        process.exit(1);
      }
      secrets[key] = value;
      saveSecrets(secrets);
      console.log(`[INFO] Secret '${key}' stored successfully`);
      break;

    case "get":
      if (!key) {
        console.error("[ERROR] Usage: get <key>");
        process.exit(1);
      }
      if (!(key in secrets)) {
        console.error(`[ERROR] Secret '${key}' not found`);
        process.exit(1);
      }
      console.log(secrets[key]);
      break;

    case "list":
      const keys = Object.keys(secrets);
      if (keys.length === 0) {
        console.log("[INFO] No secrets stored");
      } else {
        console.log("[INFO] Stored secrets:");
        keys.forEach((k) => console.log(`  - ${k}`));
      }
      break;

    case "delete":
      if (!key) {
        console.error("[ERROR] Usage: delete <key>");
        process.exit(1);
      }
      if (!(key in secrets)) {
        console.error(`[ERROR] Secret '${key}' not found`);
        process.exit(1);
      }
      delete secrets[key];
      saveSecrets(secrets);
      console.log(`[INFO] Secret '${key}' deleted`);
      break;

    case "export":
      // Export as key=value pairs for shell use
      Object.entries(secrets).forEach(([k, v]) => {
        console.log(`${k}=${v}`);
      });
      break;

    default:
      console.error(`[ERROR] Unknown command: ${command}`);
      process.exit(1);
  }
}

main();




