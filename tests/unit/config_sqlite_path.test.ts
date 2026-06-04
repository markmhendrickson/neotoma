/**
 * Unit tests for NEOTOMA_SQLITE_PATH override (issue #1504).
 *
 * The CLI help text advertises NEOTOMA_SQLITE_PATH as a supported override, but
 * src/config.ts hard-derived sqlitePath and ignored the env var. These tests
 * pin the honored-override behavior and the env-derived default fallback.
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

describe("config sqlitePath resolution", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("honors NEOTOMA_SQLITE_PATH when set", async () => {
    const { homeDir, projectRoot } = await makeProjectRoot("neotoma-sqlite-override-");
    const customDb = path.join(os.tmpdir(), `neotoma-custom-${Date.now()}.db`);

    vi.stubEnv("HOME", homeDir);
    vi.stubEnv("USERPROFILE", homeDir);
    vi.stubEnv("NEOTOMA_ENV", "development");
    vi.stubEnv("NEOTOMA_PROJECT_ROOT", projectRoot);
    vi.stubEnv("NEOTOMA_DATA_DIR", path.join(projectRoot, "data"));
    vi.stubEnv("NEOTOMA_SQLITE_PATH", customDb);

    const { config } = await importFreshConfig();
    expect(config.sqlitePath).toBe(customDb);
  });

  it("falls back to the env-derived default when NEOTOMA_SQLITE_PATH is unset", async () => {
    const { homeDir, projectRoot } = await makeProjectRoot("neotoma-sqlite-default-dev-");
    const dataDir = path.join(projectRoot, "data");

    vi.stubEnv("HOME", homeDir);
    vi.stubEnv("USERPROFILE", homeDir);
    vi.stubEnv("NEOTOMA_ENV", "development");
    vi.stubEnv("NEOTOMA_PROJECT_ROOT", projectRoot);
    vi.stubEnv("NEOTOMA_DATA_DIR", dataDir);
    vi.stubEnv("NEOTOMA_SQLITE_PATH", "");

    const { config } = await importFreshConfig();
    expect(config.sqlitePath).toBe(path.join(dataDir, "neotoma.db"));
  });

  it("uses the production db name in the default when in production", async () => {
    const { homeDir, projectRoot } = await makeProjectRoot("neotoma-sqlite-default-prod-");
    const dataDir = path.join(projectRoot, "data");

    vi.stubEnv("HOME", homeDir);
    vi.stubEnv("USERPROFILE", homeDir);
    vi.stubEnv("NEOTOMA_ENV", "production");
    vi.stubEnv("NEOTOMA_PROJECT_ROOT", projectRoot);
    vi.stubEnv("NEOTOMA_DATA_DIR", dataDir);
    vi.stubEnv("NEOTOMA_SQLITE_PATH", "");

    const { config } = await importFreshConfig();
    expect(config.sqlitePath).toBe(path.join(dataDir, "neotoma.prod.db"));
  });
});
