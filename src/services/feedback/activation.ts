/**
 * Feedback reporting mode persistence.
 *
 * Stored under the user's Neotoma config at `~/.config/neotoma/config.json`
 * as `feedback.reporting_mode`. The MCP server consults this value (via
 * `loadFeedbackReportingMode`) to decide whether to auto-submit agent
 * feedback without explicit consent, ask for consent per event, or block
 * auto-submission entirely.
 *
 * Default mode on first activation is `proactive` (opt-out model), per the
 * plan's decision. Users can change it any time with `neotoma feedback mode`.
 * The `NEOTOMA_FEEDBACK_AUTO_SUBMIT=0` env var acts as a session-scope kill
 * switch that takes precedence over the stored mode.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { FeedbackReportingMode } from "./types.js";

const VALID_MODES: FeedbackReportingMode[] = ["proactive", "consent", "off"];

export const DEFAULT_FEEDBACK_REPORTING_MODE: FeedbackReportingMode = "proactive";

function configFilePath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, ".config", "neotoma", "config.json");
}

interface ConfigShape {
  feedback?: { reporting_mode?: FeedbackReportingMode; activated_at?: string };
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

export async function loadFeedbackReportingMode(): Promise<FeedbackReportingMode> {
  const cfg = await readConfig();
  const mode = cfg.feedback?.reporting_mode;
  if (mode && VALID_MODES.includes(mode)) return mode;
  return DEFAULT_FEEDBACK_REPORTING_MODE;
}

export async function setFeedbackReportingMode(mode: FeedbackReportingMode): Promise<void> {
  if (!VALID_MODES.includes(mode)) {
    throw new Error(`invalid feedback reporting mode: ${mode} (expected one of ${VALID_MODES.join("|")})`);
  }
  const cfg = await readConfig();
  cfg.feedback = {
    ...(cfg.feedback ?? {}),
    reporting_mode: mode,
    activated_at: new Date().toISOString(),
  };
  await writeConfig(cfg);
}

export function describeModes(): string {
  return [
    "  proactive  Agent submits feedback automatically without per-event consent. (Default.)",
    "  consent    Agent prompts for consent on every submission.",
    "  off        Auto-submission is disabled. Explicit user requests still work.",
  ].join("\n");
}
