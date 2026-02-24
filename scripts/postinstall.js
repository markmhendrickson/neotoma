#!/usr/bin/env node

/**
 * Neotoma postinstall script
 *
 * Displays a welcome message after npm install and, when run from the Neotoma repo,
 * saves the repo path to ~/.config/neotoma so `neotoma` and `neotoma init` work from any cwd.
 * Does NOT perform critical setup - use `neotoma init` for that.
 *
 * This script is intentionally lightweight because:
 * 1. Many users run `npm install --ignore-scripts` for security
 * 2. CI environments may skip lifecycle scripts
 * 3. Critical setup should be explicit via `neotoma init`
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function findRepoRoot(startDir) {
  let current = path.resolve(startDir);
  for (;;) {
    const pkgPath = path.join(current, "package.json");
    try {
      const raw = fs.readFileSync(pkgPath, "utf-8");
      const pkg = JSON.parse(raw);
      if (pkg.name === "neotoma") return current;
    } catch {
      // ignore
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function saveRepoPathToConfig(repoRoot) {
  const configDir = path.join(os.homedir(), ".config", "neotoma");
  const configPath = path.join(configDir, "config.json");
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    // no file or invalid
  }
  config.repo_root = repoRoot;
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

const repoRoot = findRepoRoot(process.cwd());
if (repoRoot) {
  try {
    saveRepoPathToConfig(repoRoot);
  } catch {
    // non-fatal: config may be read-only or homedir missing
  }
}

const PACK_RAT = `
         /\\    /\\
        /  \\__/  \\
       (   o  o   )  ___
        \\   ^    /  (   )
         \\_____/    ) (        Neotoma installed successfully!
        /   _   \\  /   \\
       (  ( ) )  )
        \\ /   \\ /  ^   ^
`;

console.log(PACK_RAT);
console.log("Next steps:");
console.log("");
console.log("  1. Run initial setup:");
console.log("     npx neotoma init");
console.log("");
console.log("  2. Start the API server:");
console.log("     npx neotoma api start");
console.log("");
console.log("  3. Configure MCP for Cursor:");
console.log("     npx neotoma mcp config");
console.log("");
console.log("Documentation: https://github.com/markmhendrickson/neotoma#readme");
console.log("");
