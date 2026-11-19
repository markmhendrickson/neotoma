import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as yaml from "yaml";
import { readCassette } from "../../packages/eval-harness/src/cassette.js";
import { replayCassetteAgainstServer } from "../../packages/eval-harness/src/drivers/base.js";
import {
  parseBackupCliInput,
  validateBackupCassette,
} from "../../packages/eval-harness/src/neotoma_cli.js";
import { loadScenarioFile } from "../../packages/eval-harness/src/scenario.js";
import { runScenarios } from "../../packages/eval-harness/src/runner.js";
import type { CassetteFile } from "../../packages/eval-harness/src/cassette.js";
import type { DriverInvocation } from "../../packages/eval-harness/src/types.js";

const scenarioPath = path.resolve(
  "packages/eval-harness/scenarios/backup_restore_cli_safety.scenario.yaml"
);
const cassettePath = path.resolve(
  "packages/eval-harness/cassettes/backup_restore_cli_safety__stub__replay-only.cassette.json"
);
const scenario = loadScenarioFile(scenarioPath);
const cassette = readCassette(cassettePath)!.cassette;
const temps: string[] = [];
afterEach(() => {
  for (const temp of temps.splice(0)) rmSync(temp, { recursive: true, force: true });
});

function copyCassette(): CassetteFile {
  return structuredClone(cassette);
}

function alteredScenario(edit: (value: Record<string, unknown>) => void): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "neotoma-restore-schema-"));
  temps.push(dir);
  const source = path.resolve(scenarioPath);
  const value = yaml.parse(readFileSync(source, "utf8")) as Record<string, unknown>;
  edit(value);
  const target = path.join(dir, "altered.scenario.yaml");
  writeFileSync(target, yaml.stringify(value));
  return target;
}

describe("required backup CLI eval contract", () => {
  it("accepts only fixed symbolic operations, without arbitrary argv, env or paths", () => {
    expect(
      parseBackupCliInput({ operation: "create", source: "source", output: "created_output" })
        .operation
    ).toBe("create");
    for (const input of [
      { operation: "create", source: "source", output: "../../outside" },
      { operation: "verify", backup: "/tmp/arbitrary" },
      { operation: "restore", backup: "legacy_backup", target: "target", argv: ["--force"] },
      {
        operation: "create",
        source: "source",
        output: "created_output",
        env: { NODE_OPTIONS: "--inspect" },
      },
      { operation: "create", source: "source", output: "created_output", command: "sh" },
    ])
      expect(() => parseBackupCliInput(input)).toThrow();
  });

  it("rejects cassette outcome/error forgery and changed identity or sequence", () => {
    validateBackupCassette(cassette, scenario);
    for (const edit of [
      (value: CassetteFile) => {
        value.tool_calls[0].output = { status: "complete" };
      },
      (value: CassetteFile) => {
        value.tool_calls[0].error = undefined;
      },
      (value: CassetteFile) => {
        value.meta.scenario_id = "other";
      },
      (value: CassetteFile) => {
        value.tool_calls[1].sequence = 0;
      },
      (value: CassetteFile) => {
        value.tool_calls[2].input = {
          operation: "restore",
          backup: "legacy_backup",
          target: "../outside",
        };
      },
    ]) {
      const forged = copyCassette();
      edit(forged);
      expect(() => validateBackupCassette(forged, scenario)).toThrow();
    }
  });

  it("rejects deleted live assertions, quarantine and added executable host stubs", () => {
    for (let index = 0; index < 7; index++) {
      expect(() =>
        loadScenarioFile(
          alteredScenario((value) => {
            (value.expected as unknown[]).splice(index, 1);
          })
        )
      ).toThrow(/assertions/);
      expect(() =>
        loadScenarioFile(
          alteredScenario((value) => {
            const predicate = (value.expected as Array<Record<string, unknown>>)[index];
            if (index === 0) predicate.value = 0;
            else (predicate.result_subset as Record<string, unknown>).exitCode = 1;
          })
        )
      ).toThrow(/assertions/);
    }
    expect(() =>
      loadScenarioFile(
        alteredScenario((value) => {
          (value.meta as Record<string, unknown>).quarantine = "skip";
        })
      )
    ).toThrow(/quarantined/);
    expect(() =>
      loadScenarioFile(
        alteredScenario((value) => {
          value.host_tools = [{ name: "Bash", output: { status: "complete" } }];
        })
      )
    ).toThrow(/canned host_tools/);
  });

  it("executes each cassette-selected effect once and ignores assistant text as proof", async () => {
    const runCli = vi.fn(async (input: unknown) => ({
      operation: (input as { operation: string }).operation,
      live: true,
    }));
    const result = await replayCassetteAgainstServer(
      { scenario, backupEval: { runCli } } as unknown as DriverInvocation,
      cassette,
      {
        invoke: vi.fn(() => {
          throw new Error("generic host registry must not execute");
        }),
      } as never
    );
    expect(runCli).toHaveBeenCalledTimes(3);
    expect(result.toolCalls.map((call) => call.output)).toEqual([
      { operation: "create", live: true },
      { operation: "verify", live: true },
      { operation: "restore", live: true },
    ]);
  });

  it("counts missing required cassette as a failed cell, never a skip", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "neotoma-restore-missing-"));
    temps.push(dir);
    const summary = await runScenarios({ scenarios: [scenario], mode: "replay", cassetteDir: dir });
    expect([summary.passed, summary.failed, summary.skipped]).toEqual([0, 1, 0]);
    expect(summary.cells[0].errorMessage).toContain("cassette missing");
  });
});
