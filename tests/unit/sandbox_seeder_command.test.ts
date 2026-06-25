import { describe, it, expect } from "vitest";
import path from "node:path";

import { buildSeedCommand } from "../../src/services/sandbox/seeder.js";

const REPO = "/app";
const NODE = "/usr/bin/node";

describe("buildSeedCommand", () => {
  it("runs the compiled dist script with plain node when dist exists", () => {
    const { command, args } = buildSeedCommand({
      baseUrl: "http://127.0.0.1:3180",
      manifestPath: "/app/tests/fixtures/sandbox/manifest.json",
      repoRoot: REPO,
      nodeExecPath: NODE,
      distExists: true,
    });
    expect(command).toBe(NODE);
    expect(args[0]).toBe(path.join(REPO, "dist", "scripts", "seed_sandbox.js"));
    // No tsx loader for the compiled path.
    expect(args).not.toContain("tsx");
    expect(args).toEqual(expect.arrayContaining(["--base-url", "http://127.0.0.1:3180"]));
  });

  it("falls back to the tsx-loaded TS source when dist is absent (dev)", () => {
    const { command, args } = buildSeedCommand({
      baseUrl: "http://localhost:3180",
      repoRoot: REPO,
      nodeExecPath: NODE,
      distExists: false,
    });
    expect(command).toBe(NODE);
    expect(args.slice(0, 3)).toEqual([
      "--import",
      "tsx",
      path.join(REPO, "scripts", "seed_sandbox.ts"),
    ]);
  });

  it("passes a per-pack manifest with --manifest", () => {
    const manifest = "/app/tests/fixtures/sandbox/use_cases/crm/manifest.json";
    const { args } = buildSeedCommand({
      baseUrl: "http://127.0.0.1:3180",
      manifestPath: manifest,
      repoRoot: REPO,
      nodeExecPath: NODE,
      distExists: true,
    });
    const idx = args.indexOf("--manifest");
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe(manifest);
  });

  it("omits --manifest when no manifest path is given (default generic)", () => {
    const { args } = buildSeedCommand({
      baseUrl: "http://127.0.0.1:3180",
      repoRoot: REPO,
      nodeExecPath: NODE,
      distExists: true,
    });
    expect(args).not.toContain("--manifest");
  });
});
