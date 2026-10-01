/**
 * #1704 — eval-harness quarantine.
 *
 * A scenario carrying meta.quarantine must be SKIPPED (not failed) by the
 * runner, so the eval_scenarios CI lane stays green on a clean main while a
 * known-broken scenario is tracked + fixed. Guards against a regression that
 * silently drops the quarantine check (which would let CI go red on the three
 * quarantined scenarios — neotoma#1726).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runScenarios } from "../../packages/eval-harness/src/index.js";
import { loadScenarioFile } from "../../packages/eval-harness/src/scenario.js";
import type { ScenarioFile } from "../../packages/eval-harness/src/types.js";

function quarantinedScenario(): ScenarioFile {
  return {
    meta: {
      id: "unit_quarantine_probe",
      description: "Quarantine unit probe — never runs.",
      quarantine: "test#0: deliberately quarantined for the unit test.",
    },
    user_prompt: "noop",
    host_tools: [],
    // A stub model whose cassette does not exist — if quarantine did NOT
    // short-circuit, this would surface as a skip (missing cassette) anyway,
    // but the reason must be the QUARANTINE reason, proving the branch ran.
    models: [{ provider: "stub", model: "replay-only" }],
    expected: [],
  };
}

describe("#1704 eval-harness quarantine", () => {
  it("skips a quarantined scenario (not failed) with a quarantine reason", async () => {
    const summary = await runScenarios({
      scenarios: [quarantinedScenario()],
      mode: "replay",
    });
    expect(summary.failed).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(summary.unexpectedSkipped).toBe(0);
    expect(summary.passed).toBe(0);
    const cell = summary.cells[0];
    expect(cell.skipped?.reason.startsWith("quarantined:")).toBe(true);
    expect(cell.skipped?.reason).toContain("test#0");
  });
});

describe("eval-harness required skip policy", () => {
  it("counts an undeclared missing cassette as an unexpected skip", async () => {
    const scenario = quarantinedScenario();
    delete scenario.meta.quarantine;
    const summary = await runScenarios({ scenarios: [scenario], mode: "replay" });
    expect(summary.skipped).toBe(1);
    expect(summary.unexpectedSkipped).toBe(1);
    expect(summary.cells[0].skipped?.kind).toBe("missing_cassette");
  });

  it("preserves a deliberately declared optional missing-cassette skip", async () => {
    const scenario = quarantinedScenario();
    delete scenario.meta.quarantine;
    scenario.meta.allowed_skips = [
      {
        kind: "missing_cassette",
        provider: "stub",
        model: "replay-only",
      },
    ];
    const summary = await runScenarios({ scenarios: [scenario], mode: "replay" });
    expect(summary.skipped).toBe(1);
    expect(summary.unexpectedSkipped).toBe(0);
  });

  it("does not let one optional cell hide a required sibling cell", async () => {
    const scenario = quarantinedScenario();
    delete scenario.meta.quarantine;
    scenario.models = [
      { provider: "stub", model: "optional-replay" },
      { provider: "stub", model: "required-replay" },
    ];
    scenario.meta.allowed_skips = [
      {
        kind: "missing_cassette",
        provider: "stub",
        model: "optional-replay",
      },
    ];
    const summary = await runScenarios({ scenarios: [scenario], mode: "replay" });
    expect(summary.skipped).toBe(2);
    expect(summary.unexpectedSkipped).toBe(1);
  });

  it("matches an allowance to the exact provider as well as the model", async () => {
    const scenario = quarantinedScenario();
    delete scenario.meta.quarantine;
    scenario.models = [
      { provider: "stub", model: "shared-model-name" },
      { provider: "openai", model: "shared-model-name" },
    ];
    scenario.meta.allowed_skips = [
      {
        kind: "missing_cassette",
        provider: "stub",
        model: "shared-model-name",
      },
    ];
    const summary = await runScenarios({ scenarios: [scenario], mode: "replay" });
    expect(summary.skipped).toBe(2);
    expect(summary.unexpectedSkipped).toBe(1);
  });

  it("matches an allowance to the exact cassette identity", async () => {
    const scenario = quarantinedScenario();
    delete scenario.meta.quarantine;
    scenario.models = [
      { provider: "stub", model: "shared-model", cassette_id: "optional-replay" },
      { provider: "stub", model: "shared-model", cassette_id: "required-replay" },
    ];
    scenario.meta.allowed_skips = [
      {
        kind: "missing_cassette",
        provider: "stub",
        model: "shared-model",
        cassette_id: "optional-replay",
      },
    ];
    const summary = await runScenarios({ scenarios: [scenario], mode: "replay" });
    expect(summary.skipped).toBe(2);
    expect(summary.unexpectedSkipped).toBe(1);
    expect(summary.unexpectedSkipDiagnostics[0].cell).toContain("cassette_id=required-replay");
  });

  it.each([
    ["provider-only", "      provider: stub\n"],
    ["model-only", "      model: replay-only\n"],
  ])("rejects a %s skip allowance", (_name, selector) => {
    const dir = mkdtempSync(join(tmpdir(), "neotoma-eval-skip-parser-"));
    const scenarioPath = join(dir, "invalid.scenario.yaml");
    writeFileSync(
      scenarioPath,
      `meta:
  id: invalid_skip_selector
  description: invalid skip selector
  allowed_skips:
    - kind: missing_cassette
${selector}user_prompt: noop
host_tools: []
models:
  - provider: stub
    model: replay-only
expected: []
`
    );
    try {
      expect(() => loadScenarioFile(scenarioPath)).toThrow(
        "meta.allowed_skips entries must specify provider and model"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("requires cassette_id when it is part of the target cell identity", () => {
    const dir = mkdtempSync(join(tmpdir(), "neotoma-eval-skip-parser-"));
    const scenarioPath = join(dir, "invalid.scenario.yaml");
    writeFileSync(
      scenarioPath,
      `meta:
  id: missing_cassette_identity
  description: missing cassette identity
  allowed_skips:
    - kind: missing_cassette
      provider: stub
      model: replay-only
user_prompt: noop
host_tools: []
models:
  - provider: stub
    model: replay-only
    cassette_id: custom-replay
expected: []
`
    );
    try {
      expect(() => loadScenarioFile(scenarioPath)).toThrow(
        "meta.allowed_skips entries must identify exactly one models[] cell"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits nonzero through the CLI when a required sibling cassette is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "neotoma-eval-skip-policy-"));
    const scenarioPath = join(dir, "mixed.scenario.yaml");
    writeFileSync(
      scenarioPath,
      `meta:
  id: mixed_cli_probe
  description: mixed required and optional cells
  allowed_skips:
    - kind: missing_cassette
      provider: stub
      model: optional-replay
user_prompt: noop
host_tools: []
models:
  - provider: stub
    model: optional-replay
  - provider: stub
    model: required-replay
expected: []
`
    );
    try {
      const result = spawnSync(
        resolve("node_modules/.bin/tsx"),
        [
          "packages/eval-harness/src/cli.ts",
          "run",
          "--scenario-file",
          scenarioPath,
          "--cassette-dir",
          dir,
        ],
        { cwd: resolve("."), encoding: "utf8" }
      );
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(1);
      expect(result.stdout).toContain("skipped=2");
      expect(result.stdout).toContain("unexpected_skipped=1");
      expect(result.stdout).toContain(
        "scenario=mixed_cli_probe provider=stub model=required-replay cassette_id=(default) kind=missing_cassette"
      );
      expect(result.stdout).toContain("record the required cassette");
      expect(result.stdout).toContain("exact meta.allowed_skips entry");

      const junit = spawnSync(
        resolve("node_modules/.bin/tsx"),
        [
          "packages/eval-harness/src/cli.ts",
          "run",
          "--scenario-file",
          scenarioPath,
          "--cassette-dir",
          dir,
          "--reporter",
          "junit",
        ],
        { cwd: resolve("."), encoding: "utf8" }
      );
      expect(junit.status, `${junit.stdout}\n${junit.stderr}`).toBe(1);
      expect(junit.stdout).toContain('failures="1"');
      expect(junit.stdout).toContain('skipped="1"');
      expect(junit.stdout).toContain(
        "scenario=mixed_cli_probe provider=stub model=required-replay cassette_id=(default) kind=missing_cassette"
      );
      expect(junit.stdout).toContain("record the required cassette");
      expect(junit.stdout).toContain("exact meta.allowed_skips entry");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
