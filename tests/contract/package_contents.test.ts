import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

type NpmPackJsonEntry = {
  files?: Array<{ path?: string }>;
};

function parseNpmPackJsonOutput(output: string): NpmPackJsonEntry[] {
  const trimmed = output.trim();
  const jsonStart = trimmed.lastIndexOf("\n[");
  const jsonText = jsonStart >= 0 ? trimmed.slice(jsonStart + 1) : trimmed.slice(trimmed.indexOf("["));
  return JSON.parse(jsonText) as NpmPackJsonEntry[];
}

describe("npm package contents", () => {
  it("includes openapi.yaml in npm pack output", () => {
    const result = spawnSync("npm", ["pack", "--json", "--dry-run"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);

    const output = result.stdout.trim();
    expect(output.length).toBeGreaterThan(0);

    const parsed = parseNpmPackJsonOutput(output);
    const files = parsed[0]?.files ?? [];
    const filePaths = files.map((file) => file.path).filter(Boolean) as string[];

    expect(filePaths).toContain("openapi.yaml");
  });

  // Regression for #1904: `neotoma hooks install` / `neotoma setup --tool
  // claude-code` copy hook templates from packages/*, but those directories
  // were absent from the npm `files` allowlist, so a global npm install failed
  // with "Could not locate the Neotoma package root". Assert the hook package
  // templates the installers reference (src/cli/hooks.ts) actually ship.
  it("includes the hook packages the installers copy at runtime (#1904)", () => {
    const result = spawnSync("npm", ["pack", "--json", "--dry-run"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);

    const parsed = parseNpmPackJsonOutput(result.stdout.trim());
    const filePaths = (parsed[0]?.files ?? [])
      .map((file) => file.path)
      .filter(Boolean) as string[];

    // The Claude Code plugin hooks (installer target for --tool claude-code)
    // and the codex/cursor installer entry points must be in the tarball.
    const required = [
      "packages/claude-code-plugin/hooks/session_start.py",
      "packages/codex-hooks/scripts/install.mjs",
      "packages/cursor-hooks/scripts/install.mjs",
    ];
    for (const path of required) {
      expect(filePaths, `missing from npm pack: ${path}`).toContain(path);
    }
  });
});
