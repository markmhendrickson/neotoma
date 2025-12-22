#!/usr/bin/env node

/**
 * Retrieve secrets from encrypted storage for agent use
 * 
 * This script reads secrets from the encrypted secrets file and outputs them
 * in a format suitable for agent instructions (base64-encoded key=value pairs).
 * 
 * Usage:
 *   node scripts/get_secrets_for_agents.js
 */

import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SECRETS_SCRIPT = join(__dirname, "secrets_manager.js");

try {
  // Export secrets as key=value pairs
  const output = execSync(`node ${SECRETS_SCRIPT} export`, {
    encoding: "utf-8",
    env: process.env,
  });

  if (!output.trim()) {
    console.error("[ERROR] No secrets found in storage");
    process.exit(1);
  }

  // Convert to base64-encoded format for agent instructions
  const keyValuePairs = output.trim().split("\n");
  const encoded = Buffer.from(keyValuePairs.join("\n")).toString("base64");

  console.log(encoded);
} catch (error) {
  console.error(`[ERROR] Failed to retrieve secrets: ${error.message}`);
  process.exit(1);
}




