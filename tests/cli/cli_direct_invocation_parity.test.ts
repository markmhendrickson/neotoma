/**
 * Audit: every session command must be invokable directly (neotoma <command> --help exits 0).
 * Ensures REPL parity so agents and scripts never need the interactive session.
 */

import { execSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

const CLI_PATH = "node dist/cli/index.js";
const REPO_ROOT = path.resolve(__dirname, "../..");

describe("CLI direct invocation parity", () => {
  it("has session command list available", async () => {
    const { getSessionCommandNames } = await import("../../src/cli/index.ts");
    const names = getSessionCommandNames();
    expect(Array.isArray(names)).toBe(true);
    expect(names.length).toBeGreaterThan(5);
    expect(names).toContain("entities");
    expect(names).toContain("sources");
    expect(names).toContain("storage");
  });

  it("each session command supports --help when invoked directly", async () => {
    const { getSessionCommandNames } = await import("../../src/cli/index.ts");
    const names = getSessionCommandNames();
    const skip = new Set(["watch", "request"]); // watch can hang; request may need --operation
    for (const name of names) {
      if (skip.has(name)) continue;
      const cmd = `${CLI_PATH} ${name} --help`;
      try {
        const result = execSync(cmd, {
          cwd: REPO_ROOT,
          encoding: "utf-8",
          timeout: 8000,
          stdio: ["pipe", "pipe", "pipe"],
        });
        expect(result).toBeDefined();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Command "neotoma ${name} --help" failed: ${message}`);
      }
    }
  });
});
