/**
 * Scenario YAML loader for the Tier 2 eval harness.
 *
 * Scenarios live under `packages/eval-harness/scenarios/*.scenario.yaml`.
 * The schema is documented in `docs/subsystems/agentic_eval.md`.
 *
 * The loader normalizes optional fields (`instruction_profile`,
 * `hooks_enabled`, `driver_options`) and validates the minimum required
 * surface so a malformed scenario fails loudly at load time rather than
 * mid-run.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "yaml";

import type { ScenarioFile } from "./types.js";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const PKG_ROOT = resolve(HERE, "..");

export const DEFAULT_SCENARIO_DIR = join(PKG_ROOT, "scenarios");

function assertField(condition: unknown, message: string, file: string): asserts condition {
  if (!condition) {
    throw new Error(`scenario ${file}: ${message}`);
  }
}

function normalizeScenario(raw: unknown, file: string): ScenarioFile {
  assertField(raw && typeof raw === "object", "must be a YAML object", file);
  const o = raw as Record<string, unknown>;
  const meta = o.meta as Record<string, unknown> | undefined;
  assertField(meta?.id && typeof meta.id === "string", "meta.id is required", file);
  assertField(meta?.description && typeof meta.description === "string", "meta.description is required", file);
  assertField(typeof o.user_prompt === "string", "user_prompt is required", file);
  assertField(Array.isArray(o.host_tools), "host_tools must be an array (may be empty)", file);
  assertField(Array.isArray(o.models) && (o.models as unknown[]).length > 0, "models[] is required and non-empty", file);
  assertField(Array.isArray(o.expected), "expected[] is required (may be empty)", file);

  const instruction_profile = o.instruction_profile as ScenarioFile["instruction_profile"] | undefined;
  if (instruction_profile != null) {
    assertField(
      ["full", "compact", "auto"].includes(instruction_profile),
      `instruction_profile must be one of full|compact|auto`,
      file
    );
  }

  const scenario: ScenarioFile = {
    meta: {
      id: meta!.id as string,
      description: meta!.description as string,
      tags: Array.isArray(meta!.tags) ? (meta!.tags as string[]) : undefined,
    },
    system_prompt: typeof o.system_prompt === "string" ? o.system_prompt : undefined,
    user_prompt: o.user_prompt as string,
    attachments: Array.isArray(o.attachments)
      ? (o.attachments as ScenarioFile["attachments"])
      : undefined,
    host_tools: o.host_tools as ScenarioFile["host_tools"],
    models: o.models as ScenarioFile["models"],
    instruction_profile: instruction_profile ?? "auto",
    hooks_enabled: typeof o.hooks_enabled === "boolean" ? o.hooks_enabled : true,
    driver_options: (o.driver_options as ScenarioFile["driver_options"]) ?? {},
    expected: o.expected as ScenarioFile["expected"],
  };
  return scenario;
}

export function loadScenarioFile(path: string): ScenarioFile {
  const raw = readFileSync(path, "utf-8");
  const parsed = yaml.parse(raw);
  return normalizeScenario(parsed, path);
}

export function loadScenariosFromDir(
  dir: string = DEFAULT_SCENARIO_DIR,
  filter?: string
): ScenarioFile[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const scenarios: ScenarioFile[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".scenario.yaml") && !entry.endsWith(".scenario.yml")) continue;
    const full = join(dir, entry);
    const scenario = loadScenarioFile(full);
    if (filter && !scenario.meta.id.includes(filter)) continue;
    scenarios.push(scenario);
  }
  scenarios.sort((a, b) => (a.meta.id < b.meta.id ? -1 : a.meta.id > b.meta.id ? 1 : 0));
  return scenarios;
}
