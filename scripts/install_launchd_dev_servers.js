#!/usr/bin/env node
/**
 * Install LaunchAgent so Neotoma dev servers (API + tunnel) start at login and
 * restart after reboot. Writes com.neotoma.dev-servers.plist to
 * ~/Library/LaunchAgents with the current repo root.
 *
 * Usage: node scripts/install_launchd_dev_servers.js
 * Or: npm run setup:launchd-dev
 */
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "fs";
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
const plistName = "com.neotoma.dev-servers.plist";
const templatePath = join(__dirname, "com.neotoma.dev-servers.plist.template");
const plistPath = join(launchAgentsDir, plistName);
const logDir = join(repoRoot, "data", "logs");

const template = readFileSync(templatePath, "utf-8");
const plistContent = template.replace(/REPO_ROOT_PLACEHOLDER/g, repoRoot);

const runScript = join(__dirname, "run_dev_servers_launchd.sh");
chmodSync(runScript, 0o755);
mkdirSync(logDir, { recursive: true });
mkdirSync(launchAgentsDir, { recursive: true });
writeFileSync(plistPath, plistContent);

console.log("Installed:", plistPath);
console.log("Logs:      ", join(logDir, "launchd-dev-servers.{log,error.log}"));
console.log("");
console.log("Load now:   launchctl load " + plistPath);
console.log("Unload:     launchctl unload " + plistPath);
console.log("Status:     launchctl list | grep neotoma");
console.log("");
console.log("Dev servers will start at login and restart if they exit.");

try {
  execSync("launchctl load " + plistPath, { stdio: "inherit" });
  console.log("Loaded. Dev servers are starting.");
} catch (e) {
  console.log("Run manually to start now: launchctl load " + plistPath);
}
