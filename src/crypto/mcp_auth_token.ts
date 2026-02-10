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
 * Returns null if encryption is not enabled.
 */
export function getMcpAuthToken(): string | null {
  if (!config.encryption.enabled) {
    return null;
  }
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
