import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

type NpmPackJsonEntry = {
  files?: Array<{ path?: string }>;
};

describe("npm package contents", () => {
  it("includes openapi.yaml in npm pack output", () => {
    const result = spawnSync("npm", ["pack", "--json", "--dry-run"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);

    const output = result.stdout.trim();
    expect(output.length).toBeGreaterThan(0);

    const parsed = JSON.parse(output) as NpmPackJsonEntry[];
    const files = parsed[0]?.files ?? [];
    const filePaths = files.map((file) => file.path).filter(Boolean) as string[];

    expect(filePaths).toContain("openapi.yaml");
  });
});
