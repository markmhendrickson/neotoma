#!/usr/bin/env node
/**
 * Installs or removes Neotoma hooks in a Cursor project.
 *
 * Usage:
 *   npx @neotoma/cursor-hooks install         # add to .cursor/hooks.json in cwd
 *   npx @neotoma/cursor-hooks install --path  # custom project root
 *   npx @neotoma/cursor-hooks --uninstall
 *
 * The script merges Neotoma's hook entries into any existing hooks.json
 * so it plays nicely with hooks another tool may have installed.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "..");
const templatePath = join(packageRoot, "hooks.template.json");

function parseArgs(argv) {
  const args = { uninstall: false, projectRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--uninstall" || arg === "uninstall") {
      args.uninstall = true;
    } else if (arg === "--path" && argv[i + 1]) {
      args.projectRoot = resolve(argv[i + 1]);
      i += 1;
    } else if (arg === "install") {
      // no-op, default
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: neotoma-cursor-hooks [install|--uninstall] [--path <dir>]

Installs Neotoma hooks into .cursor/hooks.json in the target project.
Defaults to the current directory.`);
}

function loadExistingHooks(hooksFile) {
  if (!existsSync(hooksFile)) return { version: 1, hooks: {} };
  try {
    return JSON.parse(readFileSync(hooksFile, "utf-8"));
  } catch (err) {
    console.error(`Failed to parse existing ${hooksFile}: ${err.message}`);
    process.exit(1);
  }
}

function renderTemplate(hookDir) {
  const raw = readFileSync(templatePath, "utf-8");
  return JSON.parse(raw.replaceAll("${HOOK_DIR}", hookDir));
}

const NEOTOMA_HOOK_SCRIPTS = [
  "before_submit_prompt.js",
  "after_tool_use.js",
  "stop.js",
];

function neotomaTag(entry) {
  if (!Array.isArray(entry?.args)) return false;
  return entry.args.some((a) => {
    if (typeof a !== "string") return false;
    if (a.includes("@neotoma/cursor-hooks")) return true;
    return (
      a.includes("cursor-hooks") &&
      NEOTOMA_HOOK_SCRIPTS.some((name) => a.endsWith(name) || a.includes(`dist/${name}`))
    );
  });
}

function mergeHooks(existing, additions) {
  const out = {
    version: existing.version ?? 1,
    hooks: { ...(existing.hooks ?? {}) },
  };
  for (const [event, entries] of Object.entries(additions.hooks)) {
    const prior = out.hooks[event] ?? [];
    const filtered = prior.filter((e) => !neotomaTag(e));
    out.hooks[event] = [...filtered, ...entries];
  }
  return out;
}

function removeNeotoma(existing) {
  const out = {
    version: existing.version ?? 1,
    hooks: {},
  };
  for (const [event, entries] of Object.entries(existing.hooks ?? {})) {
    const filtered = (entries ?? []).filter((e) => !neotomaTag(e));
    if (filtered.length > 0) out.hooks[event] = filtered;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = args.projectRoot;
  const cursorDir = join(projectRoot, ".cursor");
  const hooksFile = join(cursorDir, "hooks.json");

  mkdirSync(cursorDir, { recursive: true });
  const existing = loadExistingHooks(hooksFile);

  if (args.uninstall) {
    const out = removeNeotoma(existing);
    writeFileSync(hooksFile, JSON.stringify(out, null, 2) + "\n");
    console.log(`Removed Neotoma hooks from ${hooksFile}`);
    return;
  }

  // Point the template at this package's installed location so hooks
  // resolve to dist/*.js at runtime.
  const additions = renderTemplate(packageRoot);
  const merged = mergeHooks(existing, additions);
  writeFileSync(hooksFile, JSON.stringify(merged, null, 2) + "\n");
  console.log(`Installed Neotoma hooks into ${hooksFile}`);
}

main();
