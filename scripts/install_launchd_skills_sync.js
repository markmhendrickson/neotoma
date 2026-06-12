#!/usr/bin/env node
/**
 * Install LaunchAgent to continuously mirror skills into every harness.
 *
 * Writes com.neotoma.skills-sync.plist to ~/Library/LaunchAgents pointing at
 * the current repo root. The agent watches `skills/` and re-runs
 * `neotoma skills sync` on any change (and once at login), keeping
 * ~/.claude/skills, ~/.cursor/skills, ~/.codex/skills, ~/.openclaw/skills in
 * sync — and creating the skills dir for any harness installed later.
 *
 * Usage: node scripts/install_launchd_skills_sync.js
 * Or:    npm run setup:launchd-skills-sync
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
  console.error(
    "LaunchAgent is macOS only. On Linux, run `neotoma skills sync` from a systemd path unit or cron."
  );
  process.exit(1);
}

const launchAgentsDir = join(homedir(), "Library", "LaunchAgents");
const plistName = "com.neotoma.skills-sync.plist";
const templatePath = join(__dirname, "com.neotoma.skills-sync.plist.template");
const plistPath = join(launchAgentsDir, plistName);
const logDir = join(repoRoot, "data", "logs");

const template = readFileSync(templatePath, "utf-8");
const plistContent = template.replace(/REPO_ROOT_PLACEHOLDER/g, repoRoot);

const runScript = join(__dirname, "run_skills_sync_launchd.sh");
chmodSync(runScript, 0o755);
mkdirSync(logDir, { recursive: true });
mkdirSync(launchAgentsDir, { recursive: true });
writeFileSync(plistPath, plistContent);

console.log("Installed:", plistPath);
console.log("Logs:      ", join(logDir, "launchd-skills-sync.{log,error.log}"));
console.log("");
console.log("Unload (if upgrading):  launchctl unload " + plistPath);
console.log("Load:                   launchctl load " + plistPath);
console.log("Status:                 launchctl list | grep skills-sync");
console.log("");
console.log("Watches skills/ and re-runs `neotoma skills sync` on change (and once at login).");
console.log("Tip: `brew install fswatch` for event-driven sync; otherwise a 30s poll is used.");

try {
  try {
    execSync("launchctl unload " + plistPath, { stdio: "ignore" });
  } catch {
    /* not loaded */
  }
  execSync("launchctl load " + plistPath, { stdio: "inherit" });
  console.log("Loaded. Initial sync runs immediately (RunAtLoad).");
} catch {
  console.log("Run manually: launchctl load " + plistPath);
}
