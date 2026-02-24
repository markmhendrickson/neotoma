#!/usr/bin/env node
/**
 * Watch site sources and rebuild on change.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const WATCH_PATHS = [
  path.join(repoRoot, "scripts", "build_github_pages_site.tsx"),
  path.join(repoRoot, "frontend", "src", "components", "SitePage.tsx"),
  path.join(repoRoot, "frontend", "src", "site", "site_data.ts"),
  path.join(repoRoot, "docs", "developer", "getting_started.md"),
  path.join(repoRoot, "docs", "developer", "agent_cli_configuration.md"),
  path.join(repoRoot, "docs", "developer", "mcp_cursor_setup.md"),
  path.join(repoRoot, "docs", "developer", "mcp_claude_code_setup.md"),
  path.join(repoRoot, "docs", "developer", "cli_overview.md"),
];

const BUILD_COMMAND = "tsx";
const BUILD_ARGS = [path.join(repoRoot, "scripts", "build_github_pages_site.tsx")];
const DEBOUNCE_MS = 300;

let debounceTimer = null;

function runBuild() {
  console.log(`[${new Date().toISOString().slice(11, 19)}] Rebuilding site...`);
  const child = spawn(BUILD_COMMAND, BUILD_ARGS, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
  });
  child.on("close", (code) => {
    if (code !== 0) {
      console.error("Build exited with code", code);
    }
  });
}

function scheduleBuild() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runBuild();
  }, DEBOUNCE_MS);
}

function watch(targetPath) {
  if (!fs.existsSync(targetPath)) {
    console.warn("Watch path does not exist:", targetPath);
    return;
  }
  fs.watch(targetPath, { recursive: false }, (_event, filename) => {
    if (filename) {
      scheduleBuild();
    }
  });
}

console.log("Watching site sources. Edit and save to rebuild.");
runBuild();
WATCH_PATHS.forEach(watch);
