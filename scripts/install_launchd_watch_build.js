#!/usr/bin/env node
/**
 * Install LaunchAgent so `tsc --watch` runs at login and after reboot, keeping
 * dist/ (and thus the global `neotoma` CLI) in sync with source changes.
 *
 * Usage: node scripts/install_launchd_watch_build.js
 * Or: npm run setup:launchd-cli-sync (alias: setup:launchd-watch-build)
 */
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir, platform } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import {
  buildLaunchdCliSyncEnv,
  resolveLaunchdCliSyncTooling,
} from "./lib/launchd_cli_sync_tooling.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const isMac = platform() === "darwin";

if (!isMac) {
  console.error("LaunchAgent is macOS only. Use systemd or another process manager on Linux.");
  process.exit(1);
}

const launchAgentsDir = join(homedir(), "Library", "LaunchAgents");
const plistName = "com.neotoma.watch-build.plist";
const templatePath = join(__dirname, "com.neotoma.watch-build.plist.template");
const plistPath = join(launchAgentsDir, plistName);
const logDir = join(repoRoot, "data", "logs");

const template = readFileSync(templatePath, "utf-8");
const tooling = resolveLaunchdCliSyncTooling();
const launchdEnv = buildLaunchdCliSyncEnv(tooling);
const plistContent = template
  .replace(/REPO_ROOT_PLACEHOLDER/g, repoRoot)
  .replace(/NODE_PATH_PLACEHOLDER/g, launchdEnv.NEOTOMA_LAUNCHD_NODE ?? "")
  .replace(/NPM_CLI_PATH_PLACEHOLDER/g, launchdEnv.NEOTOMA_LAUNCHD_NPM_CLI ?? "")
  .replace(/NPM_BIN_PATH_PLACEHOLDER/g, launchdEnv.NEOTOMA_LAUNCHD_NPM_BIN ?? "");

const runScript = join(__dirname, "run_watch_build_launchd.sh");
const apiWatchScript = join(__dirname, "run-neotoma-api-node-watch.sh");
chmodSync(runScript, 0o755);
chmodSync(apiWatchScript, 0o755);
mkdirSync(logDir, { recursive: true });
mkdirSync(launchAgentsDir, { recursive: true });
writeFileSync(plistPath, plistContent);

console.log("Installed:", plistPath);
console.log("Logs:      ", join(logDir, "launchd-watch-build.{log,error.log}"));
console.log("");
if (launchdEnv.NEOTOMA_LAUNCHD_NODE) {
  console.log("Node:      ", launchdEnv.NEOTOMA_LAUNCHD_NODE);
}
if (launchdEnv.NEOTOMA_LAUNCHD_NPM_CLI) {
  console.log("npm cli:   ", launchdEnv.NEOTOMA_LAUNCHD_NPM_CLI);
} else if (launchdEnv.NEOTOMA_LAUNCHD_NPM_BIN) {
  console.log("npm:       ", launchdEnv.NEOTOMA_LAUNCHD_NPM_BIN);
}
console.log("");
console.log("Load now:   launchctl load " + plistPath);
console.log("Unload:     launchctl unload " + plistPath);
console.log("Status:     launchctl list | grep neotoma");
console.log("");
console.log("tsc --watch will run at login and re-link the global neotoma CLI to this checkout.");

try {
  execSync("launchctl load " + plistPath, { stdio: "inherit" });
  console.log("Loaded. Watch is running.");
} catch (e) {
  console.log("Run manually to start now: launchctl load " + plistPath);
}
