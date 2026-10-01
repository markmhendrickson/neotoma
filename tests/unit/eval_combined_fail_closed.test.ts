import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("combined eval Tier 2 fail-closed CLI", () => {
  it("exits nonzero when a requested Tier 2 run throws before producing a summary", () => {
    const dir = mkdtempSync(join(tmpdir(), "neotoma-combined-tier2-error-"));
    writeFileSync(join(dir, "broken.scenario.yaml"), "meta: [\n");
    try {
      const result = spawnSync(
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
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(1);
      expect(result.stderr).toContain("Tier 2 run failed");
      const report = JSON.parse(result.stdout) as { tier2Summary: unknown; tier2Error?: string };
      expect(report.tier2Summary).toBeNull();
      expect(report.tier2Error).toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
