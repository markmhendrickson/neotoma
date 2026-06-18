#!/usr/bin/env node
/**
 * Install the rc-autodeploy LaunchAgent: "rolling main = RC" auto-deploy.
 *
 * Polls origin/main every StartInterval seconds; when the RC checkout (this
 * repo) is behind, fast-forwards it (preserving the uncommitted RC version
 * bump), rebuilds dist, and HARD-restarts com.neotoma.prod-server so
 * merged-to-main changes reach the running server unattended. Mechanical deploy
 * only — Struthio still owns cutting tagged releases.
 *
 * Writes com.neotoma.rc-autodeploy.plist to ~/Library/LaunchAgents.
 *
 * Usage: node scripts/install_launchd_rc_autodeploy.js
 * Env overrides: HEALTH_URL (default https://neotoma.markmhendrickson.com/health)
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
  console.error("LaunchAgent is macOS only. Use systemd/cron or another scheduler on Linux.");
  process.exit(1);
}

const launchAgentsDir = join(homedir(), "Library", "LaunchAgents");
const plistName = "com.neotoma.rc-autodeploy.plist";
const templatePath = join(__dirname, "com.neotoma.rc-autodeploy.plist.template");
const plistPath = join(launchAgentsDir, plistName);
const logDir = join(repoRoot, "data", "logs");

// The deploy script needs node/npm on PATH under a GUI-less launchd session;
// add the running node's bin dir so `npm run build:server` resolves.
const nodeBinDir = dirname(process.execPath);
const healthUrl = process.env.HEALTH_URL || "https://neotoma.markmhendrickson.com/health";

const template = readFileSync(templatePath, "utf-8");
const plistContent = template
  .replace(/REPO_ROOT_PLACEHOLDER/g, repoRoot)
  .replace(/NODE_BIN_DIR_PLACEHOLDER/g, nodeBinDir)
  .replace(/HEALTH_URL_PLACEHOLDER/g, healthUrl);

const runScript = join(__dirname, "redeploy_rc_from_main.sh");
chmodSync(runScript, 0o755);
mkdirSync(logDir, { recursive: true });
mkdirSync(launchAgentsDir, { recursive: true });
writeFileSync(plistPath, plistContent);

console.log("Installed:", plistPath);
console.log("Logs:      ", join(logDir, "launchd-rc-autodeploy.{log,error.log}"));
console.log("Health URL:", healthUrl);
console.log("");
console.log("This agent polls origin/main every 120s and, when behind, fast-forwards the RC,");
console.log("rebuilds dist, and hard-restarts com.neotoma.prod-server. Mechanical deploy only.");
console.log("");

try {
  const uid = execSync("id -u", { encoding: "utf-8" }).trim();
  try {
    execSync(`launchctl bootout "gui/${uid}/com.neotoma.rc-autodeploy"`, { stdio: "ignore" });
  } catch {
    /* not loaded */
  }
  execSync(`launchctl bootstrap "gui/${uid}" "${plistPath}"`, { stdio: "inherit" });
  console.log("Loaded. rc-autodeploy is active (runs once now, then every 120s).");
} catch {
  console.log("Run manually to start now:");
  console.log(`  launchctl bootstrap "gui/$(id -u)" "${plistPath}"`);
}
