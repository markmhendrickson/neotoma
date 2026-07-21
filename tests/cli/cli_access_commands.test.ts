import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { WIN_SHELL } from "../../src/shared/spawn_platform.js";

const REPO_ROOT = path.resolve(__dirname, "../..");
const TSX_BIN = path.join(REPO_ROOT, "node_modules/.bin/tsx");
const BOOTSTRAP_PATH = path.join(REPO_ROOT, "src/cli/bootstrap.ts");

/**
 * Runs the real `neotoma` entrypoint (bootstrap.ts, not runCli directly) so
 * the `neotoma prod ...` / `neotoma dev ...` shorthand's NEOTOMA_ENV-before-
 * config-load ordering is exercised faithfully (#1979 qa follow-up: this
 * ordering means the shorthand can never trigger env_flag_mismatch, only the
 * literal `--env prod` spelling can).
 */
function runBootstrap(argvSuffix: string[]): { stdout: string; stderr: string } {
  const testHome = path.join(os.tmpdir(), "neotoma-bootstrap-test-" + Date.now() + "-" + Math.random().toString(36).slice(2));
  const configDir = path.join(testHome, ".config", "neotoma");
  const dataDir = path.join(testHome, "data");
  try {
    mkdirSync(configDir, { recursive: true });
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(path.join(configDir, "config.json"), "{}", "utf8");
    const result = spawnSync(TSX_BIN, [BOOTSTRAP_PATH, ...argvSuffix], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      timeout: 20000,
      env: { HOME: testHome, PATH: process.env.PATH ?? "", NEOTOMA_DATA_DIR: dataDir },
      stdio: ["pipe", "pipe", "pipe"],
      ...WIN_SHELL,
    });
    if (result.error) {
      throw new Error(
        `Failed to spawn tsx for bootstrap test: ${result.error.message}. ` +
          `Ensure dependencies are installed (npm install).`
      );
    }
    return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  } finally {
    rmSync(testHome, { recursive: true, force: true });
  }
}

const schemaRegistryMockState = vi.hoisted(() => ({
  schemas: new Map<string, {
    entity_type: string;
    metadata?: { guest_access_policy?: string };
  }>(),
}));

vi.mock("../../src/services/schema_registry.js", () => ({
  SchemaRegistryService: class {
    async listActiveSchemas() {
      return Array.from(schemaRegistryMockState.schemas.values());
    }

    async loadGlobalSchema(entityType: string) {
      return schemaRegistryMockState.schemas.get(entityType) ?? null;
    }

    async updateMetadata(
      entityType: string,
      patch: { guest_access_policy?: string },
    ) {
      const existing = schemaRegistryMockState.schemas.get(entityType);
      if (!existing) {
        throw new Error(`No active schema found for entity type "${entityType}"`);
      }
      schemaRegistryMockState.schemas.set(entityType, {
        ...existing,
        metadata: {
          ...(existing.metadata ?? {}),
          ...patch,
        },
      });
    }
  },
}));

describe("neotoma access CLI helpers", () => {
  const originalEnv = process.env;
  const testHome = path.join(os.tmpdir(), "neotoma-cli-access-test-" + Date.now());
  const configPath = path.join(testHome, ".config", "neotoma", "config.json");
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    process.env = { ...originalEnv, HOME: testHome };
    delete process.env.NEOTOMA_ACCESS_POLICY_ISSUE;
    schemaRegistryMockState.schemas.clear();
    schemaRegistryMockState.schemas.set("issue", {
      entity_type: "issue",
      metadata: { guest_access_policy: "submitter_scoped" },
    });
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify({}), "utf8");
    stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
  });

  afterEach(async () => {
    stdoutSpy.mockRestore();
    process.env = originalEnv;
    await fs.rm(testHome, { recursive: true, force: true });
  });

  it("reset clears deprecated config fallback and makes schema-backed issue policy closed", async () => {
    const { accessReset } = await import("../../src/cli/access.js");
    const { loadAccessPolicies, setAccessPolicy } = await import(
      "../../src/services/access_policy.js"
    );
    await setAccessPolicy("issue", "submitter_scoped");

    await accessReset("issue", { json: true });

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({
      entity_type: "issue",
      mode: "closed",
      status: "reset",
      effective_mode: "closed",
      effective_source: "schema_metadata",
      sqlite_path: expect.any(String),
      environment: expect.any(String),
      env_flag_mismatch: false,
    });
    await expect(loadAccessPolicies()).resolves.toEqual({});
  });

  it("reset reports a remaining env override instead of claiming effective closure", async () => {
    const { accessReset } = await import("../../src/cli/access.js");
    const { loadAccessPolicies, setAccessPolicy } = await import(
      "../../src/services/access_policy.js"
    );
    await setAccessPolicy("issue", "submitter_scoped");
    process.env.NEOTOMA_ACCESS_POLICY_ISSUE = "open";

    await accessReset("issue", { json: true });

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({
      entity_type: "issue",
      mode: "closed",
      status: "reset",
      effective_mode: "open",
      effective_source: "env",
      sqlite_path: expect.any(String),
      environment: expect.any(String),
      env_flag_mismatch: false,
    });
    await expect(loadAccessPolicies()).resolves.toEqual({ issue: "open" });
  });

  it("set reports the resolved DB target and warns on --env prod mismatch", async () => {
    const originalArgv = process.argv;
    process.argv = [...originalArgv, "--env", "prod"];
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const { accessSet } = await import("../../src/cli/access.js");

      await accessSet("issue", "open", { json: true });

      const payload = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
      expect(payload).toMatchObject({
        entity_type: "issue",
        mode: "open",
        status: "set",
        env_flag_mismatch: true,
      });
      expect(payload.sqlite_path).toEqual(expect.any(String));
      expect(payload.environment).toEqual(expect.any(String));
      const warning = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
      expect(warning).toMatch(/development DB/i);
      expect(warning).toMatch(/production server will NOT see this change/i);
    } finally {
      process.argv = originalArgv;
      stderrSpy.mockRestore();
    }
  });

  it("set reports the resolved DB target without warning when no env flag is passed", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const { accessSet } = await import("../../src/cli/access.js");

      await accessSet("issue", "open", { json: true });

      const payload = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
      expect(payload).toMatchObject({
        entity_type: "issue",
        mode: "open",
        status: "set",
        env_flag_mismatch: false,
      });
      const warning = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
      expect(warning).not.toMatch(/development DB/i);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("set non-JSON output includes the resolved environment DB suffix", async () => {
    const { accessSet } = await import("../../src/cli/access.js");

    await accessSet("issue", "open", { json: false });

    const text = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(text).toMatch(/Access policy for "issue" set to "open"/);
    expect(text).toMatch(/DB: .*neotoma.*\.db/);
  });

  it("enable-issues and disable-issues warn on env mismatch exactly once, not once per entity type", async () => {
    const originalArgv = process.argv;
    process.argv = [...originalArgv, "--env", "prod"];
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const { accessEnableIssues, accessDisableIssues } = await import("../../src/cli/access.js");
      const { ISSUE_SUBMISSION_ENTITY_TYPES } = await import(
        "../../src/services/access_policy.js"
      );
      for (const et of ISSUE_SUBMISSION_ENTITY_TYPES) {
        schemaRegistryMockState.schemas.set(et, {
          entity_type: et,
          metadata: { guest_access_policy: "closed" },
        });
      }
      expect(ISSUE_SUBMISSION_ENTITY_TYPES.length).toBeGreaterThan(1);

      await accessEnableIssues({ json: true });
      const enablePayload = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
      expect(enablePayload.entity_types).toEqual([...ISSUE_SUBMISSION_ENTITY_TYPES]);
      expect(enablePayload.mode).toBe("submitter_scoped");
      expect(enablePayload.env_flag_mismatch).toBe(true);
      const enableWarnings = stderrSpy.mock.calls.filter((c) =>
        String(c[0]).match(/development DB/i)
      );
      expect(enableWarnings).toHaveLength(1);

      stdoutSpy.mockClear();
      stderrSpy.mockClear();
      await accessDisableIssues({ json: true });
      const disablePayload = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
      expect(disablePayload.entity_types).toEqual([...ISSUE_SUBMISSION_ENTITY_TYPES]);
      expect(disablePayload.mode).toBe("closed");
      expect(disablePayload.env_flag_mismatch).toBe(true);
      const disableWarnings = stderrSpy.mock.calls.filter((c) =>
        String(c[0]).match(/development DB/i)
      );
      expect(disableWarnings).toHaveLength(1);
    } finally {
      process.argv = originalArgv;
      stderrSpy.mockRestore();
    }
  });
});

interface CliRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: unknown;
}

async function runCliWithEnv(
  argvSuffix: string[],
  env: Record<string, string | undefined>,
): Promise<CliRunResult> {
  const stdoutParts: string[] = [];
  const stderrParts: string[] = [];
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    stdoutParts.push(
      typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8"),
    );
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderrParts.push(
      typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8"),
    );
    return true;
  });

  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    saved[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  const previousExitCode = process.exitCode;
  const previousIsTTY = process.stdout.isTTY;
  Object.defineProperty(process.stdout, "isTTY", {
    value: false,
    writable: true,
    configurable: true,
  });
  process.exitCode = undefined;

  let caught: unknown;
  try {
    vi.resetModules();
    const cli = await import("../../src/cli/index.ts");
    await cli.runCli(["node", "cli", ...argvSuffix]);
  } catch (error) {
    caught = error;
  }

  const exitCode =
    process.exitCode !== undefined && process.exitCode !== 0
      ? process.exitCode
      : caught
        ? 1
        : (process.exitCode ?? 0);

  process.exitCode = previousExitCode;
  Object.defineProperty(process.stdout, "isTTY", {
    value: previousIsTTY,
    writable: true,
    configurable: true,
  });

  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();

  return {
    exitCode,
    stdout: stdoutParts.join(""),
    stderr: stderrParts.join(""),
    error: caught,
  };
}

describe("CLI access commands", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("rejects remote transport flags for access enable-issues", async () => {
    const result = await runCliWithEnv(
      ["--json", "--api-only", "--base-url", "https://neotoma.example", "access", "enable-issues", "--no-log-file"],
      {
        NEOTOMA_API_ONLY: undefined,
        NEOTOMA_BASE_URL: undefined,
        NEOTOMA_OFFLINE: undefined,
        NEOTOMA_USER_ID: undefined,
      },
    );

    expect(result.exitCode).toBe(1);
    const payload = JSON.parse(result.stdout) as { ok?: boolean; error?: string };
    expect(payload.ok).toBe(false);
    expect(payload.error).toMatch(/mutate local state only/i);
    expect(payload.error).toMatch(/--api-only/);
    expect(payload.error).toMatch(/--base-url/);
  });

  it("rejects remote transport env overrides for access set", async () => {
    const result = await runCliWithEnv(["--json", "access", "set", "issue", "open", "--no-log-file"], {
      NEOTOMA_API_ONLY: "1",
      NEOTOMA_BASE_URL: "https://neotoma.example",
      NEOTOMA_OFFLINE: undefined,
      NEOTOMA_USER_ID: undefined,
    });

    expect(result.exitCode).toBe(1);
    const payload = JSON.parse(result.stdout) as { ok?: boolean; error?: string };
    expect(payload.ok).toBe(false);
    expect(payload.error).toMatch(/mutate local state only/i);
    expect(payload.error).toMatch(/NEOTOMA_API_ONLY/);
    expect(payload.error).toMatch(/NEOTOMA_BASE_URL/);
  });
});

describe("neotoma prod/dev shorthand vs --env prod flag (#1979 env mismatch reach)", () => {
  it("`neotoma prod access set` never reports env_flag_mismatch: NEOTOMA_ENV is set before config loads", () => {
    const { stdout, stderr } = runBootstrap([
      "prod",
      "access",
      "set",
      "issue",
      "open",
      "--json",
      "--no-log-file",
    ]);

    const payload = JSON.parse(stdout);
    expect(payload.environment).toBe("production");
    expect(payload.sqlite_path).toMatch(/neotoma\.prod\.db$/);
    expect(payload.env_flag_mismatch).toBe(false);
    expect(stderr).not.toMatch(/development DB/i);
  });

  it("literal `--env prod` (no `prod` positional) resolves to dev DB and reports env_flag_mismatch: true", () => {
    const { stdout, stderr } = runBootstrap([
      "--env",
      "prod",
      "access",
      "set",
      "issue",
      "open",
      "--json",
      "--no-log-file",
    ]);

    const payload = JSON.parse(stdout);
    expect(payload.environment).toBe("development");
    expect(payload.sqlite_path).toMatch(/neotoma\.db$/);
    expect(payload.env_flag_mismatch).toBe(true);
    expect(stderr).toMatch(/development DB/i);
    expect(stderr).toMatch(/production server will NOT see this change/i);
  });
});
