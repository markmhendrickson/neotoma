import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function runTier2Cli(scenario: string) {
  const dir = mkdtempSync(join(tmpdir(), "neotoma-combined-tier2-"));
  writeFileSync(join(dir, "probe.scenario.yaml"), scenario);
  try {
    return spawnSync(
      resolve("node_modules/.bin/tsx"),
      [
        "packages/eval-combined/src/cli.ts",
        "run",
        "--tier2-only",
        "--scenarios-dir",
        dir,
        "--output",
        "json",
      ],
      { cwd: resolve("."), encoding: "utf8" }
    );
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
    const result = runTier2Cli(`meta:
  id: unexpected_skip_cli_probe
  description: required cassette is absent
user_prompt: noop
host_tools: []
models:
  - provider: stub
    model: required-replay
expected: []
`);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(1);
    const report = JSON.parse(result.stdout) as {
      tier2Summary: { skipped: number; unexpectedSkipped: number };
    };
    expect(report.tier2Summary.skipped).toBe(1);
    expect(report.tier2Summary.unexpectedSkipped).toBe(1);
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
});
