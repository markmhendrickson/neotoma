import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

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
    });
    await expect(loadAccessPolicies()).resolves.toEqual({ issue: "open" });
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
