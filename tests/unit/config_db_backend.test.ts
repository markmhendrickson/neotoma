/**
 * Unit tests for NEOTOMA_DB_BACKEND validation (concurrent-backend plan,
 * PR #1944 QA follow-up).
 *
 * src/config.ts validates NEOTOMA_DB_BACKEND at module load time (a top-level
 * throw, not inside an exported function), so these tests exercise it via
 * fresh dynamic imports under different env values rather than calling a
 * function directly.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

async function importFreshConfig() {
  vi.resetModules();
  return import("../../src/config.ts");
}

async function makeProjectRoot(prefix: string): Promise<{ homeDir: string; projectRoot: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const homeDir = path.join(root, "home");
  const projectRoot = path.join(root, "project");
  await fs.mkdir(homeDir, { recursive: true });
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, "package.json"),
    JSON.stringify({ name: "neotoma", version: "0.0.0-test" }, null, 2)
  );
  return { homeDir, projectRoot };
}

async function stubBaseEnv(prefix: string) {
  const { homeDir, projectRoot } = await makeProjectRoot(prefix);
  vi.stubEnv("HOME", homeDir);
  vi.stubEnv("USERPROFILE", homeDir);
  vi.stubEnv("NEOTOMA_ENV", "development");
  vi.stubEnv("NEOTOMA_PROJECT_ROOT", projectRoot);
  vi.stubEnv("NEOTOMA_DATA_DIR", path.join(projectRoot, "data"));
}

describe("NEOTOMA_DB_BACKEND validation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("defaults to sqlite when unset", async () => {
    await stubBaseEnv("neotoma-db-backend-default-");
    vi.stubEnv("NEOTOMA_DB_BACKEND", "");

    const { config } = await importFreshConfig();
    expect(config.dbBackend).toBe("sqlite");
  });

  it.each(["sqlite", "SQLITE", "libsql", "LibSQL"])(
    "accepts %s case-insensitively",
    async (value) => {
      await stubBaseEnv(`neotoma-db-backend-case-${value}-`);
      vi.stubEnv("NEOTOMA_DB_BACKEND", value);

      const { config } = await importFreshConfig();
      expect(config.dbBackend).toBe(value.toLowerCase());
    }
  );

  it("throws a clear error for an invalid backend value", async () => {
    await stubBaseEnv("neotoma-db-backend-invalid-");
    vi.stubEnv("NEOTOMA_DB_BACKEND", "postgres");

    await expect(importFreshConfig()).rejects.toThrow(
      /Invalid NEOTOMA_DB_BACKEND "postgres": expected "sqlite" or "libsql"/
    );
  });
});
