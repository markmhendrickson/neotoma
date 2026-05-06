/**
 * Issues configuration persistence and resolution.
 *
 * Stored under the user's Neotoma config at `~/.config/neotoma/config.json`
 * as `issues.*`. Environment variables take precedence over stored config.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { GitHubAuthMethod, IssueReportingMode, IssuesConfig } from "./types.js";
import { DEFAULT_ISSUES_CONFIG, DEFAULT_ISSUES_TARGET_URL } from "./types.js";

function configFilePath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, ".config", "neotoma", "config.json");
}

interface ConfigShape {
  issues?: Partial<IssuesConfig>;
  [k: string]: unknown;
}

async function readConfig(): Promise<ConfigShape> {
  try {
    const raw = await fs.readFile(configFilePath(), "utf8");
    return JSON.parse(raw) as ConfigShape;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

async function writeConfig(cfg: ConfigShape): Promise<void> {
  const p = configFilePath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(cfg, null, 2), "utf8");
}

/**
 * Load the resolved issues config, with env var overrides applied.
 */
export async function loadIssuesConfig(): Promise<IssuesConfig> {
  const cfg = await readConfig();
  const stored = cfg.issues ?? {};

  const githubAuth: GitHubAuthMethod =
    process.env.NEOTOMA_ISSUES_GITHUB_TOKEN ? "token" :
    (stored.github_auth ?? DEFAULT_ISSUES_CONFIG.github_auth);

  const repo =
    process.env.NEOTOMA_ISSUES_REPO ??
    stored.repo ??
    DEFAULT_ISSUES_CONFIG.repo;

  const reportingMode: IssueReportingMode =
    (process.env.NEOTOMA_ISSUES_REPORTING_MODE as IssueReportingMode | undefined) ??
    stored.reporting_mode ??
    DEFAULT_ISSUES_CONFIG.reporting_mode;

  const syncStalenessMs =
    process.env.NEOTOMA_ISSUES_SYNC_STALENESS_MS
      ? parseInt(process.env.NEOTOMA_ISSUES_SYNC_STALENESS_MS, 10)
      : stored.sync_staleness_ms ?? DEFAULT_ISSUES_CONFIG.sync_staleness_ms;

  const envTargetRaw = process.env.NEOTOMA_ISSUES_TARGET_URL?.trim();
  const envTarget =
    envTargetRaw && envTargetRaw.length > 0 ? envTargetRaw : undefined;
  const storedRaw =
    typeof stored.target_url === "string" ? stored.target_url.trim() : stored.target_url;
  const storedTarget =
    typeof storedRaw === "string" && storedRaw.length > 0 ? storedRaw : undefined;
  const targetUrl =
    envTarget ??
    storedTarget ??
    DEFAULT_ISSUES_TARGET_URL;

  return {
    github_auth: githubAuth,
    repo,
    reporting_mode: reportingMode,
    sync_staleness_ms: syncStalenessMs,
    configured_at: stored.configured_at ?? null,
    target_url: targetUrl,
  };
}

/**
 * Persist partial updates to the issues config section.
 */
export async function updateIssuesConfig(
  updates: Partial<IssuesConfig>,
): Promise<IssuesConfig> {
  const cfg = await readConfig();
  const current = cfg.issues ?? {};
  const merged = {
    ...DEFAULT_ISSUES_CONFIG,
    ...current,
    ...updates,
    configured_at: new Date().toISOString(),
  };
  cfg.issues = merged;
  await writeConfig(cfg);
  return merged;
}

/**
 * Check if issues have been configured (user has gone through first-time setup).
 */
export async function isIssuesConfigured(): Promise<boolean> {
  const cfg = await loadIssuesConfig();
  return cfg.configured_at !== null;
}
