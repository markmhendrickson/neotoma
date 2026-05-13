/**
 * MCP auth token derivation from config (key file or mnemonic).
 * Shared by server, CLI, and MCP clients so they use the same token.
 */

import { readFileSync } from "fs";
import { config } from "../config.js";
import {
  deriveMcpAuthToken,
  hexToKey,
  mnemonicToSeed,
} from "./key_derivation.js";

/**
 * Derive the MCP auth token from the same key source as data encryption.
 * Returns a token whenever a key source (NEOTOMA_KEY_FILE_PATH or
 * NEOTOMA_MNEMONIC) is available, regardless of whether data-at-rest
 * encryption is enabled. This lets operators use key-derived Bearer auth
 * through tunnels even without enabling full encryption.
 * Returns null only when no key source is configured.
 */
export function getMcpAuthToken(): string | null {
  if (config.encryption.keyFilePath) {
    const raw = readFileSync(config.encryption.keyFilePath, "utf8").trim();
    const keyBytes = hexToKey(raw);
    return deriveMcpAuthToken(keyBytes);
  }
  if (config.encryption.mnemonic) {
    const seed = mnemonicToSeed(
      config.encryption.mnemonic,
      config.encryption.mnemonicPassphrase || "",
    );
    return deriveMcpAuthToken(seed);
  }
  return null;
}
