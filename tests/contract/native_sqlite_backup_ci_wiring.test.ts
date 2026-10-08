import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const workflow = fs.readFileSync(
  path.resolve(here, "..", "..", ".github", "workflows", "ci_test_lanes.yml"),
  "utf8"
);

function jobBlock(jobName: string): string {
  const lines = workflow.split("\n");
  const start = lines.findIndex((line) => new RegExp(`^  ${jobName}:\\s*$`).test(line));
  if (start === -1) throw new Error(`no ${jobName} job in CI workflow`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}\S/.test(line));
  return rest.slice(0, end === -1 ? undefined : end).join("\n");
}

describe("native SQLite backup CI lane", () => {
  it("requires a Node 24 native-DatabaseSync backup-create effect test", () => {
    const nativeLane = jobBlock("native_sqlite_backup");

    expect(nativeLane).not.toMatch(/^    if:/m);
    expect(nativeLane).not.toContain("continue-on-error: true");
    expect(nativeLane).toMatch(/node-version:\s*["']?24["']?/);
    expect(nativeLane).toContain('require("node:sqlite")');
    expect(nativeLane).toContain("NEOTOMA_REQUIRE_NATIVE_SQLITE=1");
    expect(nativeLane).toContain("tests/cli/backup_verify.test.ts");
  });
});
