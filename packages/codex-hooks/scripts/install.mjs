#!/usr/bin/env node
/**
 * Installs or removes Neotoma Codex CLI hooks by writing a config
 * snippet to ~/.codex/config.toml.
 *
 * Codex CLI discovers external hooks via config.toml keys like:
 *   [notify] command = [...]
 * We wire Neotoma's hook scripts into those keys while preserving any
 * unrelated entries already present.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "..");

function hookPath(name) {
  return join(packageRoot, "hooks", name);
}

const MARKER = "# BEGIN neotoma-codex-hooks";
const END_MARKER = "# END neotoma-codex-hooks";

function buildBlock() {
  const python = process.env.NEOTOMA_PYTHON ?? "python3";
  return `${MARKER}
[notify]
command = ["${python}", "${hookPath("notify.py")}"]

[history]
session_start_command = ["${python}", "${hookPath("session_start.py")}"]
session_end_command = ["${python}", "${hookPath("session_end.py")}"]
${END_MARKER}
`;
}

function stripBlock(source) {
  const start = source.indexOf(MARKER);
  if (start === -1) return source;
  const end = source.indexOf(END_MARKER);
  if (end === -1) return source;
  return source.slice(0, start) + source.slice(end + END_MARKER.length + 1);
}

function parseArgs(argv) {
  const out = { uninstall: false, configPath: join(homedir(), ".codex", "config.toml") };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--uninstall") out.uninstall = true;
    else if (arg === "--config" && argv[i + 1]) {
      out.configPath = resolve(argv[i + 1]);
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: neotoma-codex-hooks [--uninstall] [--config <path to config.toml>]"
      );
      process.exit(0);
    }
  }
  return out;
}

function main() {
  const { uninstall, configPath } = parseArgs(process.argv.slice(2));
  mkdirSync(dirname(configPath), { recursive: true });
  const existing = existsSync(configPath) ? readFileSync(configPath, "utf-8") : "";
  const stripped = stripBlock(existing);

  if (uninstall) {
    writeFileSync(configPath, stripped.replace(/\n+$/g, "\n"));
    console.log(`Removed Neotoma Codex hooks from ${configPath}`);
    return;
  }

  const next = stripped.replace(/\n+$/g, "\n") + "\n" + buildBlock();
  writeFileSync(configPath, next);
  console.log(`Installed Neotoma Codex hooks into ${configPath}`);
}

main();
