import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Embedded (in-process) configuration. Synthetic env files live only in temp dirs.
 */

interface Fixture {
  root: string;
  homeDir: string;
  projectRoot: string;
  explicitDataDir: string;
  decoys: string[];
}

async function makeFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-embedded-"));
  const homeDir = path.join(root, "home");
  const projectRoot = path.join(root, "project");
  const explicitDataDir = path.join(root, "explicit-data");
  const decoys = ["decoy-prod", "decoy-dotenv", "decoy-home", "decoy-process-env"].map((n) =>
    path.join(root, n)
  );
  await fs.mkdir(path.join(homeDir, ".config", "neotoma"), { recursive: true });
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.mkdir(explicitDataDir, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, "package.json"),
    JSON.stringify({ name: "neotoma", version: "0.0.0-test" })
  );
  await fs.writeFile(path.join(projectRoot, ".env.production"), `NEOTOMA_DATA_DIR=${decoys[0]}\n`);
  await fs.writeFile(path.join(projectRoot, ".env"), `NEOTOMA_DATA_DIR=${decoys[1]}\n`);
  await fs.writeFile(
    path.join(homeDir, ".config", "neotoma", ".env"),
    `NEOTOMA_DATA_DIR=${decoys[2]}\n`
  );
  return { root, homeDir, projectRoot, explicitDataDir, decoys };
}

function stubHostEnvironment(f: Fixture, environment: string): void {
  // Order matters for restoration: stub NEOTOMA_DATA_DIR first so vitest restores it
  // even when a legacy env-file load overwrites it directly.
  vi.stubEnv("NEOTOMA_DATA_DIR", f.decoys[3]);
  vi.stubEnv("HOME", f.homeDir);
  vi.stubEnv("USERPROFILE", f.homeDir);
  vi.stubEnv("NEOTOMA_ENV", environment);
  vi.stubEnv("NEOTOMA_PROJECT_ROOT", f.projectRoot);
  vi.stubEnv("NEOTOMA_SQLITE_PATH", path.join(f.decoys[3], "conflicting.db"));
  vi.stubEnv("NEOTOMA_RAW_STORAGE_DIR", path.join(f.decoys[3], "raw"));
  vi.stubEnv("NEOTOMA_ALLOW_USER_ENV_IN_TEST", "1");
}

function snapshotHostEnvironment(): string {
  return JSON.stringify(Object.entries(process.env).sort());
}

async function listTree(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string): Promise<void> {
    for (const entry of await fs.readdir(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      out.push(full);
      if (entry.isDirectory()) await walk(full);
    }
  }
  await walk(dir);
  return out.sort();
}

async function exists(p: string): Promise<boolean> {
  return fs.access(p).then(
    () => true,
    () => false
  );
}

describe("embedded configuration", () => {
  let f: Fixture;

  beforeEach(async () => {
    f = await makeFixture();
    vi.resetModules();
  });

  afterEach(async () => {
    const { clearEmbeddedConfig } = await import("../../src/config_embedded.ts");
    clearEmbeddedConfig();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await fs.rm(f.root, { recursive: true, force: true });
  });

  it("explicit config wins over env files and host variables, and leaves the host environment untouched", async () => {
    stubHostEnvironment(f, "production");
    const before = snapshotHostEnvironment();
    const homeFile = path.join(f.homeDir, ".config", "neotoma", ".env");
    const homeFileBefore = await fs.readFile(homeFile, "utf-8");

    const { createEmbeddedNeotoma } = await import("../../src/embedded.ts");
    const neotoma = await createEmbeddedNeotoma({
      dataDir: f.explicitDataDir,
      environment: "production",
    });

    expect(neotoma.config.dataDir).toBe(f.explicitDataDir);
    expect(neotoma.config.sqlitePath).toBe(path.join(f.explicitDataDir, "neotoma.prod.db"));
    expect(neotoma.config.rawStorageDir).toBe(path.join(f.explicitDataDir, "sources_prod"));
    expect(neotoma.config.logsDir.startsWith(f.explicitDataDir)).toBe(true);
    expect(neotoma.config.eventLogPath.startsWith(f.explicitDataDir)).toBe(true);

    const ops = neotoma.createOperations({ userId: "00000000-0000-4000-8000-000000000001" });
    await ops.store({
      entities: [{ entity_type: "note", title: "embedded smoke" }],
      idempotency_key: "embedded-smoke-1",
    });

    // The host environment is exactly as the host left it.
    expect(snapshotHostEnvironment()).toBe(before);

    // Nothing was written to any location a conflicting file or variable named.
    for (const decoy of f.decoys) expect(await exists(decoy)).toBe(false);
    // The database landed inside the explicit directory.
    expect(await exists(path.join(f.explicitDataDir, "neotoma.prod.db"))).toBe(true);
    // The project root and home directory are unchanged.
    expect((await listTree(f.projectRoot)).map((p) => path.basename(p)).sort()).toEqual(
      [".env", ".env.production", "package.json"].sort()
    );
    expect(await fs.readFile(homeFile, "utf-8")).toBe(homeFileBefore);
    expect(await listTree(f.homeDir)).toEqual([
      path.join(f.homeDir, ".config"),
      path.join(f.homeDir, ".config", "neotoma"),
      homeFile,
    ]);
  });

  it("makes no network request when no adapter is configured", async () => {
    stubHostEnvironment(f, "development");
    vi.stubEnv("OPENAI_API_KEY", "synthetic-key-not-used");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    const httpSpy = vi.spyOn(http, "request");
    const httpsSpy = vi.spyOn(https, "request");

    const { createEmbeddedNeotoma } = await import("../../src/embedded.ts");
    const neotoma = await createEmbeddedNeotoma({ dataDir: f.explicitDataDir });
    const ops = neotoma.createOperations({ userId: "00000000-0000-4000-8000-000000000002" });
    await ops.store({
      entities: [{ entity_type: "note", title: "no network" }],
      idempotency_key: "embedded-nonet-1",
    });

    const { config } = await import("../../src/config.ts");
    expect(config.openaiApiKey).toBe("");
    const { generateEmbedding } = await import("../../src/embeddings.ts");
    const trace: { reason?: string } = {};
    expect(await generateEmbedding("hello", trace)).toBeNull();
    expect(trace.reason).toBe("embedding_not_configured");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(httpSpy).not.toHaveBeenCalled();
    expect(httpsSpy).not.toHaveBeenCalled();
  });

  it("only reads host variables the caller names, and explicit options still win", async () => {
    stubHostEnvironment(f, "development");
    vi.stubEnv("NEOTOMA_PORT", "4999");
    vi.stubEnv("NEOTOMA_LOGS_DIR", path.join(f.decoys[3], "logs"));
    const { resolveEmbeddedConfig } = await import("../../src/config_embedded.ts");

    const none = resolveEmbeddedConfig({ dataDir: f.explicitDataDir });
    expect(none.env.NEOTOMA_PORT).toBeUndefined();
    expect(none.env.NEOTOMA_LOGS_DIR).toBeUndefined();

    const opted = resolveEmbeddedConfig({
      dataDir: f.explicitDataDir,
      allowProcessEnv: ["NEOTOMA_PORT", "NEOTOMA_DATA_DIR"],
    });
    expect(opted.env.NEOTOMA_PORT).toBe("4999");
    expect(opted.env.NEOTOMA_DATA_DIR).toBe(f.explicitDataDir);
  });

  it("rejects invalid options with a structured error", async () => {
    const { resolveEmbeddedConfig, EmbeddedConfigError } =
      await import("../../src/config_embedded.ts");
    expect(() => resolveEmbeddedConfig({ dataDir: "relative/dir" })).toThrow(EmbeddedConfigError);
    expect(() =>
      resolveEmbeddedConfig({ dataDir: f.explicitDataDir, environment: "staging" as never })
    ).toThrow(/environment/);
  });

  it("refuses to embed after the standard configuration has already loaded", async () => {
    stubHostEnvironment(f, "development");
    await import("../../src/config.ts");
    const { createEmbeddedNeotoma } = await import("../../src/embedded.ts");
    await expect(createEmbeddedNeotoma({ dataDir: f.explicitDataDir })).rejects.toMatchObject({
      code: "config_already_loaded",
    });
  });
});

describe("standard (CLI and server) configuration is unchanged", () => {
  let f: Fixture;

  beforeEach(async () => {
    f = await makeFixture();
    vi.resetModules();
  });

  afterEach(async () => {
    const { clearEmbeddedConfig } = await import("../../src/config_embedded.ts");
    clearEmbeddedConfig();
    vi.unstubAllEnvs();
    await fs.rm(f.root, { recursive: true, force: true });
  });

  it("still loads the project env file with override and exposes it through the host environment", async () => {
    stubHostEnvironment(f, "development");
    const { config } = await import("../../src/config.ts");
    expect(config.embedded).toBe(false);
    expect(config.dataDir).toBe(f.decoys[1]);
    expect(process.env.NEOTOMA_DATA_DIR).toBe(f.decoys[1]);
  });

  it("still loads the production env file with override", async () => {
    stubHostEnvironment(f, "production");
    const { config } = await import("../../src/config.ts");
    expect(config.dataDir).toBe(f.decoys[0]);
    expect(config.sqlitePath).toBe(path.join(f.decoys[3], "conflicting.db"));
  });

  it("still hydrates the data directory from the user-level file when nothing else sets it", async () => {
    stubHostEnvironment(f, "development");
    await fs.rm(path.join(f.projectRoot, ".env"));
    vi.stubEnv("NEOTOMA_DATA_DIR", "");
    const { config } = await import("../../src/config.ts");
    expect(config.dataDir).toBe(f.decoys[2]);
  });
});
