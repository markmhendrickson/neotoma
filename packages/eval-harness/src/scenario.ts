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
import { isDeepStrictEqual } from "node:util";
import * as yaml from "yaml";

import type { ScenarioFile } from "./types.js";

const RESTORE_SCENARIO = "backup_restore_cli_safety";

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, i) => key === [...keys].sort()[i]);
}

function validateRestoreScenario(o: Record<string, unknown>, file: string): void {
  const probes = o.causal_probes;
  assertField(
    Array.isArray(probes) && probes.length === 2,
    "restore eval needs exactly two causal_probes",
    file
  );
  for (const [i, member] of ["neotoma_db", "wal"].entries()) {
    const probe = probes[i];
    assertField(
      probe && typeof probe === "object" && !Array.isArray(probe),
      "invalid causal probe",
      file
    );
    const p = probe as Record<string, unknown>;
    assertField(
      exactKeys(p, ["kind", "member"]) &&
        p.kind === "restore_staged_substitution" &&
        p.member === member,
      `causal_probes[${i}] must be the ${member} substitution`,
      file
    );
  }
  assertField(
    !(o.meta as Record<string, unknown>).quarantine,
    "required restore eval cannot be quarantined",
    file
  );
  const models = o.models as Array<Record<string, unknown>>;
  assertField(
    models.length === 1 &&
      models[0]?.provider === "stub" &&
      models[0]?.model === "replay-only" &&
      exactKeys(models[0], ["provider", "model"]),
    "restore eval requires one stub/replay-only model",
    file
  );
  assertField(
    Array.isArray(o.host_tools) && o.host_tools.length === 0,
    "restore eval cannot declare canned host_tools",
    file
  );
  const requiredExpectations = [
    { type: "host_tool.invocations", tool_name: "neotoma_cli", op: "eq", value: 3 },
    {
      type: "cli.result",
      operation: "create",
      result_subset: {
        exitCode: 0,
        stderr: "",
        stdoutJson: { status: "complete", verified: true },
      },
    },
    {
      type: "cli.result",
      operation: "verify",
      result_subset: { exitCode: 0, stderr: "", stdoutJson: { status: "valid" } },
    },
    {
      type: "cli.result",
      operation: "restore",
      result_subset: { exitCode: 0, stderr: "", stdoutJson: { status: "restored" } },
    },
    {
      type: "fixture.state",
      result_subset: {
        mainRow: true,
        walOnlyRow: true,
        staleSidecarsAbsentBeforeOpen: true,
        modePreserved: true,
        unrelatedBytesPreserved: true,
        unexpectedWrites: false,
      },
    },
    ...(["neotoma_db", "wal"] as const).map((member) => ({
      type: "causal_probe.result",
      member,
      result_subset: {
        preflightCliValid: true,
        originalIntegrity: true,
        replacementIntegrity: true,
        replacementDistinct: true,
        mismatchMember: member,
        priorTargetHashesUnchanged: true,
        published: false,
      },
    })),
  ];
  assertField(
    isDeepStrictEqual(o.expected, requiredExpectations),
    "required restore eval assertions must retain every live effect and causal guard",
    file
  );
}

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
  assertField(
    meta?.description && typeof meta.description === "string",
    "meta.description is required",
    file
  );
  assertField(typeof o.user_prompt === "string", "user_prompt is required", file);
  assertField(Array.isArray(o.host_tools), "host_tools must be an array (may be empty)", file);
  assertField(
    Array.isArray(o.models) && (o.models as unknown[]).length > 0,
    "models[] is required and non-empty",
    file
  );
  assertField(Array.isArray(o.expected), "expected[] is required (may be empty)", file);
  if (meta.id === RESTORE_SCENARIO) validateRestoreScenario(o, file);
  else
    assertField(o.causal_probes === undefined, "causal_probes only belongs to restore eval", file);

  const instruction_profile = o.instruction_profile as
    | ScenarioFile["instruction_profile"]
    | undefined;
  if (instruction_profile != null) {
    assertField(
      ["full", "compact", "auto"].includes(instruction_profile),
      `instruction_profile must be one of full|compact|auto`,
      file
    );
  }

  const seedStrategy = o.seed_strategy as ScenarioFile["seed_strategy"] | undefined;
  if (seedStrategy != null) {
    assertField(
      ["generated", "real_derived", "hybrid_amplified"].includes(seedStrategy),
      `seed_strategy must be one of generated|real_derived|hybrid_amplified`,
      file
    );
    if (seedStrategy === "real_derived" || seedStrategy === "hybrid_amplified") {
      assertField(
        typeof o.source_pattern === "string" && o.source_pattern.length > 0,
        `source_pattern is required when seed_strategy is ${seedStrategy}`,
        file
      );
    }
  }

  const scenario: ScenarioFile = {
    meta: {
      id: meta!.id as string,
      description: meta!.description as string,
      tags: Array.isArray(meta!.tags) ? (meta!.tags as string[]) : undefined,
      quarantine: typeof meta!.quarantine === "string" ? (meta!.quarantine as string) : undefined,
    },
    system_prompt: typeof o.system_prompt === "string" ? o.system_prompt : undefined,
    user_prompt: o.user_prompt as string,
    attachments: Array.isArray(o.attachments)
      ? (o.attachments as ScenarioFile["attachments"])
      : undefined,
    host_tools: o.host_tools as ScenarioFile["host_tools"],
    causal_probes: o.causal_probes as ScenarioFile["causal_probes"],
    models: o.models as ScenarioFile["models"],
    instruction_profile: instruction_profile ?? "auto",
    hooks_enabled: typeof o.hooks_enabled === "boolean" ? o.hooks_enabled : true,
    driver_options: (o.driver_options as ScenarioFile["driver_options"]) ?? {},
    seed_strategy: seedStrategy,
    source_transcript_ref:
      typeof o.source_transcript_ref === "string" ? o.source_transcript_ref : undefined,
    source_pattern: typeof o.source_pattern === "string" ? o.source_pattern : undefined,
    privacy_transform: typeof o.privacy_transform === "string" ? o.privacy_transform : undefined,
    seed_entities: Array.isArray(o.seed_entities)
      ? (o.seed_entities as ScenarioFile["seed_entities"])
      : undefined,
    real_storage: o.real_storage === true ? true : undefined,
    server_faults:
      o.server_faults && typeof o.server_faults === "object"
        ? (o.server_faults as ScenarioFile["server_faults"])
        : undefined,
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
