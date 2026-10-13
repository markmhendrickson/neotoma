#!/usr/bin/env node
/** Worktree env bootstrap. Automatic callers use the no-write default. */
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isNeotomaRepoRoot, writeWorktreeEnvContents } from "./lib/worktree_dev_env.js";

const HELP = `Worktree environment bootstrap (default: no file written).

Usage: node scripts/copy-env-to-worktree.js [--mode=none|template|live] [--force]
       npm run copy:env -- --template
       npm run copy:env -- --live

Modes
  none      Automatic default. Never reads or writes an env file.
  template  Explicitly write keys with empty values from committed .env.example.
  live      Explicitly copy a local env source into this worktree (mode 0600).

An existing .env.development is preserved unless --force is given.
Run npm run worktree:list-env to find old copies for manual review.
`;

function parseArgs(args) {
  let mode = "none";
  let selected = false;
  let force = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--force") {
      force = true;
      continue;
    }
    if (arg === "--live" || arg === "--template" || arg === "--none") {
      if (selected) throw new Error("select one mode only");
      mode = arg.slice(2);
      selected = true;
      continue;
    }
    if (arg === "--mode" || arg.startsWith("--mode=")) {
      if (selected) throw new Error("select one mode only");
      mode = arg === "--mode" ? args[++i] : arg.slice("--mode=".length);
      selected = true;
      continue;
    }
    throw new Error(`unknown option: ${arg}`);
  }
  if (!["none", "template", "live"].includes(mode)) throw new Error("invalid mode");
  if (mode === "none" && force) throw new Error("--force requires template or live mode");
  return { mode, force };
}

function trackedTemplate(root) {
  let committed;
  try {
    committed = execFileSync("git", ["show", "HEAD:.env.example"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 1024 * 1024,
    });
  } catch {
    throw new Error("committed .env.example is required for template mode");
  }
  const keys = new Set();
  for (const line of committed.split(/\r?\n/u)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/u.exec(line);
    if (match) keys.add(match[1]);
  }
  if (!keys.size) throw new Error("committed .env.example contains no keys");
  return `# Keys from committed .env.example; values intentionally blank.\n${[...keys].map((key) => `${key}=`).join("\n")}\n`;
}

function mainCheckout(root) {
  const list = execFileSync("git", ["worktree", "list", "--porcelain", "-z"], {
    cwd: root,
    encoding: "utf8",
  });
  const record = list.split("\0").find((item) => item.startsWith("worktree "));
  if (!record) throw new Error("cannot locate main checkout");
  return record.slice("worktree ".length);
}

function liveSource(root) {
  const main = mainCheckout(root);
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const candidates = [
    join(main, ".env.dev"),
    join(main, ".env"),
    join(main, ".env.development"),
    ...(home ? [join(home, ".config", "neotoma", ".env")] : []),
  ];
  for (const file of candidates) {
    if (resolve(file) === resolve(root, ".env.development")) continue;
    try {
      if (lstatSync(file).isFile()) return file;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  throw new Error(
    "no local env source found for explicit live mode; provide a local source or use --template"
  );
}

function main(args) {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(HELP);
    return 0;
  }
  const root = process.cwd();
  if (!isNeotomaRepoRoot(root)) {
    console.error("[worktree-env] Run from a Neotoma checkout root. Nothing written.");
    return 1;
  }
  try {
    const { mode, force } = parseArgs(args);
    const destination = join(root, ".env.development");
    let existing = false;
    let existingKind = null;
    try {
      const stat = lstatSync(destination);
      existing = true;
      existingKind = stat.isFile() || stat.isSymbolicLink() ? "file" : "other";
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (mode === "none") {
      console.log(
        existing
          ? "[worktree-env] No file written; existing env file remains for manual review."
          : "[worktree-env] No env file written (default none)."
      );
      return 0;
    }
    if (existingKind === "other") throw new Error("destination is not a regular file or symlink");
    if (existing && !force) {
      console.log(`[worktree-env] ${mode} mode: kept ${destination} (use --force to replace)`);
      return 0;
    }
    const contents = mode === "template" ? trackedTemplate(root) : readFileSync(liveSource(root));
    const result = writeWorktreeEnvContents(root, contents, { force });
    console.log(`[worktree-env] ${mode} mode: ${result.status} ${result.destination}`);
    return 0;
  } catch (error) {
    console.error(`[worktree-env] ${error.message}; nothing written`);
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
