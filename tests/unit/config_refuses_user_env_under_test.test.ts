/**
 * Issue #2387 — a test-shaped process must not resolve its data directory from
 * the user-level config (`~/.config/neotoma/.env`).
 *
 * Before the fix, a CLI child spawned by a test that did not inherit
 * `NEOTOMA_DATA_DIR` hydrated it from the user-level config and then operated on
 * the data directory named there — real data — silently, exiting 0. The isolation
 * every CLI test relied on was ambient: nothing asserted it.
 *
 * These cases drive the **built** config module in a real child process, because
 * the refusal path calls `process.exit` and cannot be observed in-process. Every
 * case uses a synthetic `HOME` containing a synthetic user-level config, so no
 * real config file or database is read, written, or even resolved.
 */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** A directory that stands in for the operator's real one. Never actually used. */
const STANDIN_DIR_NAME = "stands-in-for-real-data";

let sandbox: string;
let homeDir: string;
let standInDataDir: string;
let probePath: string;

interface ProbeResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Run the built config module in a child process with a synthetic HOME.
 *
 * `NEOTOMA_DATA_DIR` and `VITEST` are cleared from the inherited environment
 * first — that inheritance is exactly what made the defect invisible — so each
 * case states the environment it means to test.
 */
async function runProbe(overrides: Record<string, string>): Promise<ProbeResult> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  delete env.NEOTOMA_DATA_DIR;
  delete env.VITEST;
  delete env.NEOTOMA_ALLOW_USER_ENV_IN_TEST;
  delete env.NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR;
  env.HOME = homeDir;
  env.USERPROFILE = homeDir;
  env.NEOTOMA_PROJECT_ROOT = projectRoot;
  for (const [key, value] of Object.entries(overrides)) env[key] = value;

  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [probePath], {
      env,
      cwd: projectRoot,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

describe("config refuses the user-level data dir fallback under test (#2387)", () => {
  beforeAll(async () => {
    sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-2387-"));
    homeDir = path.join(sandbox, "home");
    standInDataDir = path.join(sandbox, STANDIN_DIR_NAME);
    await fs.mkdir(path.join(homeDir, ".config", "neotoma"), { recursive: true });
    await fs.mkdir(standInDataDir, { recursive: true });
    await fs.writeFile(
      path.join(homeDir, ".config", "neotoma", ".env"),
      `NEOTOMA_DATA_DIR=${standInDataDir}\n`
    );

    // The probe must live inside the repo so its relative import of the built
    // config resolves; it is removed in afterAll.
    probePath = path.join(projectRoot, `probe_config_2387_${process.pid}.mjs`);
    await fs.writeFile(
      probePath,
      [
        'import { config } from "./dist/config.js";',
        'console.log("RESOLVED_DATA_DIR=" + config.dataDir);',
        "",
      ].join("\n")
    );
  });

  afterAll(async () => {
    if (probePath) await fs.rm(probePath, { force: true });
    if (sandbox) await fs.rm(sandbox, { recursive: true, force: true });
  });

  it("refuses and exits non-zero when NODE_ENV=test and no data dir is set", async () => {
    const result = await runProbe({ NODE_ENV: "test" });

    expect(result.code).not.toBe(0);
    expect(result.stdout).not.toContain("RESOLVED_DATA_DIR=");
    // The message must name the variable to set, or the refusal is not actionable.
    expect(result.stderr).toContain("NEOTOMA_DATA_DIR");
    expect(result.stderr).toContain("NEOTOMA_ALLOW_USER_ENV_IN_TEST");
    // It must not silently resolve to the user-level path, nor leak it.
    expect(result.stderr).not.toContain(standInDataDir);
  });

  it("refuses and exits non-zero when VITEST is set and no data dir is set", async () => {
    const result = await runProbe({ VITEST: "true" });

    expect(result.code).not.toBe(0);
    expect(result.stdout).not.toContain("RESOLVED_DATA_DIR=");
    expect(result.stderr).toContain("NEOTOMA_DATA_DIR");
  });

  it("refuses when NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR=1 outside a test runner", async () => {
    const result = await runProbe({ NEOTOMA_REQUIRE_EXPLICIT_DATA_DIR: "1" });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("NEOTOMA_DATA_DIR");
  });

  it("proceeds when a test-shaped process sets an explicit data dir", async () => {
    const explicit = path.join(sandbox, "explicit-test-data");
    await fs.mkdir(explicit, { recursive: true });

    const result = await runProbe({ NODE_ENV: "test", NEOTOMA_DATA_DIR: explicit });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`RESOLVED_DATA_DIR=${explicit}`);
    expect(result.stdout).not.toContain(standInDataDir);
  });

  it("proceeds via the escape hatch when a test opts in deliberately", async () => {
    const result = await runProbe({ NODE_ENV: "test", NEOTOMA_ALLOW_USER_ENV_IN_TEST: "1" });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`RESOLVED_DATA_DIR=${standInDataDir}`);
  });

  /**
   * The regression guard. Normal operation — the interactive CLI, the server —
   * must keep hydrating from the user-level config exactly as before. If this
   * goes red, the fix has broken every non-test entry point.
   */
  it("still hydrates from the user-level config in a non-test process", async () => {
    const result = await runProbe({ NODE_ENV: "" });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`RESOLVED_DATA_DIR=${standInDataDir}`);
  });

  it("falls back to projectRoot/data under test when the user config names no data dir", async () => {
    const bareHome = path.join(sandbox, "bare-home");
    await fs.mkdir(path.join(bareHome, ".config", "neotoma"), { recursive: true });
    await fs.writeFile(path.join(bareHome, ".config", "neotoma", ".env"), "NEOTOMA_ENV=test\n");

    const result = await runProbe({ NODE_ENV: "test", HOME: bareHome, USERPROFILE: bareHome });

    // Nothing to refuse: no user-level data dir exists, so the pre-existing
    // projectRoot/data default still applies and the process proceeds.
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`RESOLVED_DATA_DIR=${path.join(projectRoot, "data")}`);
  });
});
