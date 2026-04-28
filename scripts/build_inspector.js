#!/usr/bin/env node

/**
 * Build the Inspector submodule and copy its dist into dist/inspector/.
 *
 * Idempotent: skips when the submodule is absent or SKIP_INSPECTOR_BUILD=1.
 * Intended for prepublishOnly and pack:local — not called during normal
 * development (use `cd inspector && npm run dev` instead).
 */

import { existsSync, mkdirSync, rmSync, cpSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const INSPECTOR_DIR = join(ROOT, "inspector");
const INSPECTOR_DIST = join(INSPECTOR_DIR, "dist");
const TARGET_DIR = join(ROOT, "dist", "inspector");

function log(msg) {
  process.stderr.write(`[build:inspector] ${msg}\n`);
}

if (process.env.SKIP_INSPECTOR_BUILD === "1") {
  log("SKIP_INSPECTOR_BUILD=1 — skipping.");
  process.exit(0);
}

if (!existsSync(join(INSPECTOR_DIR, "package.json"))) {
  log(
    "inspector/ submodule not initialised (no package.json). Skipping. " +
      "Run `git submodule update --init inspector` to enable.",
  );
  process.exit(0);
}

// Install dependencies only when node_modules is missing or package-lock
// is newer than node_modules (cheap mtime heuristic).
const nodeModules = join(INSPECTOR_DIR, "node_modules");
const lockFile = join(INSPECTOR_DIR, "package-lock.json");
const needsInstall = (() => {
  if (!existsSync(nodeModules)) return true;
  if (!existsSync(lockFile)) return false;
  try {
    const lockMtime = statSync(lockFile).mtimeMs;
    const nmMtime = statSync(nodeModules).mtimeMs;
    return lockMtime > nmMtime;
  } catch {
    return true;
  }
})();

if (needsInstall) {
  log("Installing inspector dependencies…");
  execSync("npm ci --no-audit --no-fund", {
    cwd: INSPECTOR_DIR,
    stdio: "inherit",
  });
}

log("Building Inspector SPA…");
execSync("npm run build", {
  cwd: INSPECTOR_DIR,
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_PUBLIC_BASE_PATH: "/inspector/",
  },
});

if (!existsSync(join(INSPECTOR_DIST, "index.html"))) {
  log("ERROR: inspector/dist/index.html not found after build.");
  process.exit(1);
}

// Clear and copy to dist/inspector/
if (existsSync(TARGET_DIR)) {
  rmSync(TARGET_DIR, { recursive: true });
}
mkdirSync(TARGET_DIR, { recursive: true });
cpSync(INSPECTOR_DIST, TARGET_DIR, { recursive: true });

log(`Copied inspector/dist → dist/inspector/ (ready for npm pack).`);
