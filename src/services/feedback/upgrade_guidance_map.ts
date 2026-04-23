/**
 * Load and query the upgrade-guidance map used by the feedback ingest cron
 * and the `process_feedback` triage skill.
 *
 * Each entry maps a set of fix keywords / surface names to a pre-populated
 * `UpgradeGuidance` template. The classifier matches a feedback's title/body
 * against these entries to determine whether the fix has already shipped and,
 * if so, what install/verification instructions to hand back to the agent.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { UpgradeGuidance } from "./types.js";

export interface GuidanceMapEntry {
  keywords: string[];
  surface_names: string[];
  guidance: UpgradeGuidance;
}

interface GuidanceMap {
  version: number;
  description: string;
  entries: GuidanceMapEntry[];
}

let cached: GuidanceMap | null = null;

function resolveMapPath(): string {
  const envPath = process.env.NEOTOMA_UPGRADE_GUIDANCE_MAP_PATH;
  if (envPath) return envPath;
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../../docs/subsystems/feedback_upgrade_guidance_map.json");
}

export function loadUpgradeGuidanceMap(): GuidanceMap {
  if (cached) return cached;
  const raw = readFileSync(resolveMapPath(), "utf8");
  cached = JSON.parse(raw) as GuidanceMap;
  return cached;
}

export function findUpgradeGuidance(text: string): GuidanceMapEntry | null {
  const map = loadUpgradeGuidanceMap();
  const needle = text.toLowerCase();
  for (const entry of map.entries) {
    const hit =
      entry.keywords.some((k) => needle.includes(k.toLowerCase())) ||
      entry.surface_names.some((s) => needle.includes(s.toLowerCase()));
    if (hit) return entry;
  }
  return null;
}
