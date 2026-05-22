#!/usr/bin/env node
/**
 * Install LaunchAgent so Neotoma dev HTTP stack (`npm run dev:server`) starts at login and
 * restarts after reboot. Writes com.neotoma.dev-server.plist to ~/Library/LaunchAgents.
 * Unloads legacy com.neotoma.dev-servers if present.
 *
 * Usage: node scripts/install_launchd_dev_server.js
 * Or: npm run setup:launchd-dev
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { homedir, platform } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const isMac = platform() === "darwin";

if (!isMac) {
  console.error("LaunchAgent is macOS only. Use systemd or another process manager on Linux.");
  process.exit(1);
}

const launchAgentsDir = join(homedir(), "Library", "LaunchAgents");
const legacyPlistName = "com.neotoma.dev-servers.plist";
const legacyPlistPath = join(launchAgentsDir, legacyPlistName);
const plistName = "com.neotoma.dev-server.plist";
const templatePath = join(__dirname, "com.neotoma.dev-server.plist.template");
const plistPath = join(launchAgentsDir, plistName);
const logDir = join(repoRoot, "data", "logs");

if (existsSync(legacyPlistPath)) {
  try {
    execSync(`launchctl unload "${legacyPlistPath}"`, { stdio: "ignore" });
  } catch {
    /* ignore */
  }
  try {
    unlinkSync(legacyPlistPath);
    console.log("Removed legacy LaunchAgent:", legacyPlistPath);
  } catch {
    console.log("Could not remove legacy plist (unload may be enough):", legacyPlistPath);
  }
}

const template = readFileSync(templatePath, "utf-8");
const plistContent = template.replace(/REPO_ROOT_PLACEHOLDER/g, repoRoot);

const runScript = join(__dirname, "run_dev_server_launchd.sh");
const apiWatchScript = join(__dirname, "run-neotoma-api-node-watch.sh");
const apiPollWatchScript = join(__dirname, "run_neotoma_api_chokidar_poll_watch.js");
chmodSync(runScript, 0o755);
chmodSync(apiWatchScript, 0o755);
chmodSync(apiPollWatchScript, 0o755);
mkdirSync(logDir, { recursive: true });
mkdirSync(launchAgentsDir, { recursive: true });
writeFileSync(plistPath, plistContent);

console.log("Installed:", plistPath);
console.log("Logs:      ", join(logDir, "launchd-dev-server.{log,error.log}"));
console.log("");
console.log("Load now:   launchctl load " + plistPath);
console.log("Unload:     launchctl unload " + plistPath);
console.log("Status:     launchctl list | grep neotoma");
console.log("");
console.log("Dev server will start at login and restart if it exits.");

try {
  try {
    execSync(`launchctl unload "${plistPath}"`, { stdio: "ignore" });
  } catch {
    /* not loaded */
  }
  execSync(`launchctl load "${plistPath}"`, { stdio: "inherit" });
  console.log("Loaded. Dev server is starting.");
} catch {
  console.log("Run manually to start now: launchctl load " + plistPath);
}
