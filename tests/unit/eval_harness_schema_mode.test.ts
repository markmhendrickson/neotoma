/**
 * eval-harness support for bundle-gated scenarios:
 *  - `schema_mode` / `bundle_state` / `replay_over_mcp` scenario fields load;
 *  - `schemaModeEnv` points the isolated server at the scenario's own bundle
 *    state file (never the host's) and cleans it up;
 *  - the `tool_result.matches` `result_contains` substring check.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  evaluatePredicate,
  type AssertionContext,
} from "../../packages/eval-harness/src/assertions.js";
import { schemaModeEnv } from "../../packages/eval-harness/src/runner.js";
import { loadScenarioFile } from "../../packages/eval-harness/src/scenario.js";
import type { ScenarioFile, ToolCall } from "../../packages/eval-harness/src/types.js";

const BASE_YAML = `
meta:
  id: probe
  description: probe
system_prompt: s
user_prompt: u
host_tools: []
models:
  - provider: stub
    model: replay-only
expected: []
`;

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function writeScenario(extra: string): string {
  const dir = mkdtempSync(join(tmpdir(), "eval-schema-mode-"));
  dirs.push(dir);
  const file = join(dir, "probe.scenario.yaml");
  writeFileSync(file, BASE_YAML + extra);
  return file;
}

describe("scenario loader", () => {
  it("loads schema_mode, bundle_state and replay_over_mcp", () => {
    const s = loadScenarioFile(
      writeScenario(
        "schema_mode: guided\nbundle_state:\n  enabled: [crm]\nreplay_over_mcp: [store]\n"
      )
    );
    expect(s.schema_mode).toBe("guided");
    expect(s.bundle_state).toEqual({ enabled: ["crm"] });
    expect(s.replay_over_mcp).toEqual(["store"]);
  });

  it("rejects an unknown schema_mode", () => {
    expect(() => loadScenarioFile(writeScenario("schema_mode: frozen\n"))).toThrow(/schema_mode/);
  });

  it("leaves the fields undefined when absent", () => {
    const s = loadScenarioFile(writeScenario(""));
    expect(s.schema_mode).toBeUndefined();
    expect(s.bundle_state).toBeUndefined();
    expect(s.replay_over_mcp).toBeUndefined();
  });
});

describe("schemaModeEnv", () => {
  it("sets NEOTOMA_SCHEMA_MODE and a scenario-private bundle state file", () => {
    const { env, cleanup } = schemaModeEnv({
      schema_mode: "guided",
      bundle_state: { enabled: ["engineering"] },
    } as ScenarioFile);
    expect(env.NEOTOMA_SCHEMA_MODE).toBe("guided");
    const statePath = env.NEOTOMA_BUNDLE_STATE_PATH;
    expect(statePath.startsWith(tmpdir())).toBe(true);
    expect(JSON.parse(readFileSync(statePath, "utf8"))).toEqual({
      version: 1,
      enabled: { engineering: true },
    });
    cleanup();
    expect(existsSync(statePath)).toBe(false);
  });

  it("sets nothing for a scenario without the fields (default server env)", () => {
    const { env } = schemaModeEnv({} as ScenarioFile);
    expect(env).toEqual({});
  });
});

describe("tool_result.matches result_contains", () => {
  const ctx = (toolCalls: ToolCall[]): AssertionContext => ({
    baseUrl: "http://localhost:0",
    stats: null,
    hostToolRegistry: { stubs: new Map(), invocations: [], invoke: async () => ({}) } as never,
    effectiveProfile: "auto",
    toolCalls,
  });

  it("matches a substring of a synthesized error envelope", async () => {
    const c = ctx([
      {
        name: "store",
        input: {},
        error: 'ERR_SCHEMA_MODE_GUIDED_UNPROVIDED: provided by bundle "crm"',
        sequence: 0,
      },
    ]);
    expect(
      await evaluatePredicate(
        { type: "tool_result.matches", tool_name: "store", result_contains: "GUIDED_UNPROVIDED" },
        c
      )
    ).toBeNull();
  });

  it("fails when the substring is absent", async () => {
    const c = ctx([{ name: "store", input: {}, output: { entities: [] }, sequence: 0 }]);
    const fail = await evaluatePredicate(
      { type: "tool_result.matches", tool_name: "store", result_contains: "GUIDED_UNPROVIDED" },
      c
    );
    expect(fail).not.toBeNull();
    expect(fail!.message).toContain("GUIDED_UNPROVIDED");
  });
});
