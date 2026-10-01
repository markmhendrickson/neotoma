import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function runTier2DirCli(dir: string, output: "tty" | "json" | "md" = "json") {
  return spawnSync(
    resolve("node_modules/.bin/tsx"),
    [
      "packages/eval-combined/src/cli.ts",
      "run",
      "--tier2-only",
      "--scenarios-dir",
      dir,
      "--output",
      output,
    ],
    { cwd: resolve("."), encoding: "utf8" }
  );
}

function runTier2Cli(scenario: string, output: "tty" | "json" | "md" = "json") {
  const dir = mkdtempSync(join(tmpdir(), "neotoma-combined-tier2-"));
  writeFileSync(join(dir, "probe.scenario.yaml"), scenario);
  try {
    return runTier2DirCli(dir, output);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("combined eval Tier 2 fail-closed CLI", () => {
  it("exits nonzero when a requested Tier 2 run throws before producing a summary", () => {
    const result = runTier2Cli("meta: [\n");
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(1);
    expect(result.stderr).toContain("Tier 2 run failed");
    const report = JSON.parse(result.stdout) as { tier2Summary: unknown; tier2Error?: string };
    expect(report.tier2Summary).toBeNull();
    expect(report.tier2Error).toBeTruthy();
  });

  it("exits nonzero when a valid Tier 2 run has an unexpected skip", () => {
    const scenario = `meta:
  id: unexpected_skip_cli_probe
  description: required cassette is absent
user_prompt: noop
host_tools: []
models:
  - provider: stub
    model: required-replay
expected: []
`;
    const result = runTier2Cli(scenario);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(1);
    const report = JSON.parse(result.stdout) as {
      tier2Summary: {
        skipped: number;
        unexpectedSkipped: number;
        unexpectedSkipDiagnostics: Array<{ cell: string }>;
        unexpectedSkipRepair: string;
      };
    };
    expect(report.tier2Summary.skipped).toBe(1);
    expect(report.tier2Summary.unexpectedSkipped).toBe(1);
    expect(report.tier2Summary.unexpectedSkipDiagnostics[0].cell).toContain(
      "scenario=unexpected_skip_cli_probe provider=stub model=required-replay cassette_id=(default) kind=missing_cassette"
    );
    expect(report.tier2Summary.unexpectedSkipRepair).toContain("record the required cassette");

    for (const output of ["tty", "md"] as const) {
      const human = runTier2Cli(scenario, output);
      expect(human.status, `${human.stdout}\n${human.stderr}`).toBe(1);
      expect(human.stdout).toContain("unexpected skips: 1");
      expect(human.stdout).toContain(
        "scenario=unexpected_skip_cli_probe provider=stub model=required-replay cassette_id=(default) kind=missing_cassette"
      );
      expect(human.stdout).toContain("record the required cassette");
      expect(human.stdout).toContain("exact meta.allowed_skips entry");
    }
  });

  it("exits zero when every Tier 2 skip is explicitly allowed", () => {
    const result = runTier2Cli(`meta:
  id: allowed_skip_cli_probe
  description: optional cassette is absent
  allowed_skips:
    - kind: missing_cassette
      provider: stub
      model: optional-replay
user_prompt: noop
host_tools: []
models:
  - provider: stub
    model: optional-replay
expected: []
`);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const report = JSON.parse(result.stdout) as {
      tier2Summary: { skipped: number; unexpectedSkipped: number };
    };
    expect(report.tier2Summary.skipped).toBe(1);
    expect(report.tier2Summary.unexpectedSkipped).toBe(0);
  });

  it("exits nonzero when the requested Tier 2 directory does not exist", () => {
    const parent = mkdtempSync(join(tmpdir(), "neotoma-combined-tier2-missing-"));
    const missing = join(parent, "not-present");
    try {
      const result = runTier2DirCli(missing, "tty");
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(1);
      expect(result.stderr).toContain("Tier 2 run failed");
      expect(`${result.stdout}\n${result.stderr}`).toContain("No Tier 2 scenarios found");
      expect(`${result.stdout}\n${result.stderr}`).toContain("correct --scenarios-dir");
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("exits nonzero when the requested Tier 2 directory is empty", () => {
    const empty = mkdtempSync(join(tmpdir(), "neotoma-combined-tier2-empty-"));
    try {
      const result = runTier2DirCli(empty, "md");
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(1);
      expect(result.stderr).toContain("Tier 2 run failed");
      expect(`${result.stdout}\n${result.stderr}`).toContain("No Tier 2 scenarios found");
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "add at least one *.scenario.yaml file"
      );
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
