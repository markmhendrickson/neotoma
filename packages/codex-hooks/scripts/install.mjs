#!/usr/bin/env node
/**
 * Installs or removes Neotoma Codex CLI hooks by writing a config
 * snippet to ~/.codex/config.toml.
 *
 * Codex expects a root-level `notify = ["argv0", "argv1", …]` (argv array),
 * not a `[notify]` table with `command = …` (that shape errors as map vs sequence).
 * We wire Neotoma's hook scripts while preserving unrelated entries.
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

/** Codex requires a top-level history.persistence key; insert once if absent (TOML merges repeated [history]). */
function ensureHistoryPersistenceLine(toml) {
  if (/^\s*persistence\s*=/m.test(toml)) return toml;
  return toml.replace(
    /^(\[history\][^\n]*)$/m,
    '$1\n# Required by Codex CLI; omitting yields: missing field persistence in history.\npersistence = "save-all"\n'
  );
}

/** Older Neotoma snippets used `[notify]` + `command = […]`; Codex expects `notify = […]`. */
function migrateLegacyNotifyTableToArray(toml) {
  return toml.replace(
    /^\[notify\]\s*\n\s*command\s*=\s*(\[[^\]]+\])\s*$/m,
    "notify = $1"
  );
}

function buildBlock() {
  const python = process.env.NEOTOMA_PYTHON ?? "python3";
  return `${MARKER}
notify = ["${python}", "${hookPath("notify.py")}"]

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

  let next = stripped.replace(/\n+$/g, "\n") + "\n" + buildBlock();
  next = migrateLegacyNotifyTableToArray(next);
  next = ensureHistoryPersistenceLine(next);
  writeFileSync(configPath, next);
  console.log(`Installed Neotoma Codex hooks into ${configPath}`);
}

main();
