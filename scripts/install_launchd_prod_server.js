#!/usr/bin/env node
/**
 * Install LaunchAgent so Neotoma production HTTP API (`npm run start:server:prod`) starts at login
 * and restarts after reboot. Writes com.neotoma.prod-server.plist to ~/Library/LaunchAgents.
 *
 * Usage: node scripts/install_launchd_prod_server.js
 * Or: npm run setup:launchd-prod-server
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
const plistName = "com.neotoma.prod-server.plist";
const templatePath = join(__dirname, "com.neotoma.prod-server.plist.template");
const plistPath = join(launchAgentsDir, plistName);
const logDir = join(repoRoot, "data", "logs");

const template = readFileSync(templatePath, "utf-8");
const plistContent = template.replace(/REPO_ROOT_PLACEHOLDER/g, repoRoot);

const runScript = join(__dirname, "run_prod_server_launchd.sh");
chmodSync(runScript, 0o755);
mkdirSync(logDir, { recursive: true });
mkdirSync(launchAgentsDir, { recursive: true });
writeFileSync(plistPath, plistContent);

console.log("Installed:", plistPath);
console.log("Logs:      ", join(logDir, "launchd-prod-server.{log,error.log}"));
console.log("");
console.log("Load now:   launchctl load " + plistPath);
console.log("Unload:     launchctl unload " + plistPath);
console.log("Status:     launchctl list | grep neotoma");
console.log("");
console.log("Prod-mode server will start at login and restart if it exits.");
console.log("Avoid loading dev-server and prod-server on the same default port; set HTTP_PORT in .env if needed.");

try {
  try {
    execSync(`launchctl unload "${plistPath}"`, { stdio: "ignore" });
  } catch {
    /* not loaded */
  }
  execSync(`launchctl load "${plistPath}"`, { stdio: "inherit" });
  console.log("Loaded. Prod server is starting.");
} catch {
  console.log("Run manually to start now: launchctl load " + plistPath);
}
