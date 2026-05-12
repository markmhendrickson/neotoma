#!/usr/bin/env node
/**
 * Install LaunchAgent to run `neotoma issues sync` every 5 minutes (and once at login).
 * Writes com.neotoma.issues-sync.plist to ~/Library/LaunchAgents with the current repo root.
 *
 * Optional env for GitHub/API (not committed): copy scripts/launchd-issues-sync.env.example
 * to data/local/launchd-issues-sync.env
 *
 * Usage: node scripts/install_launchd_issues_sync.js
 * Or: npm run setup:launchd-issues-sync
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
  console.error("LaunchAgent is macOS only. Use cron or systemd on other platforms.");
  process.exit(1);
}

const launchAgentsDir = join(homedir(), "Library", "LaunchAgents");
const plistName = "com.neotoma.issues-sync.plist";
const templatePath = join(__dirname, "com.neotoma.issues-sync.plist.template");
const plistPath = join(launchAgentsDir, plistName);
const logDir = join(repoRoot, "data", "logs");

const template = readFileSync(templatePath, "utf-8");
const plistContent = template.replace(/REPO_ROOT_PLACEHOLDER/g, repoRoot);

const runScript = join(__dirname, "run_issues_sync_launchd.sh");
chmodSync(runScript, 0o755);
mkdirSync(logDir, { recursive: true });
mkdirSync(launchAgentsDir, { recursive: true });
writeFileSync(plistPath, plistContent);

console.log("Installed:", plistPath);
console.log("Logs:      ", join(logDir, "launchd-issues-sync.{log,error.log}"));
console.log("");
console.log("Unload (if upgrading):  launchctl unload " + plistPath);
console.log("Load:                   launchctl load " + plistPath);
console.log("Status:                 launchctl list | grep issues-sync");
console.log("");
console.log("Runs `neotoma issues sync` every 5 minutes and once at login.");

try {
  try {
    execSync("launchctl unload " + plistPath, { stdio: "ignore" });
  } catch {
    /* not loaded */
  }
  execSync("launchctl load " + plistPath, { stdio: "inherit" });
  console.log("Loaded. First sync may run immediately (RunAtLoad).");
} catch {
  console.log("Run manually: launchctl load " + plistPath);
}
