import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

async function importFreshConfig() {
  vi.resetModules();
  return import("../../src/config.ts");
}

describe("runtime config data dir resolution", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("loads NEOTOMA_DATA_DIR from ~/.config/neotoma/.env when process env is unset", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-config-user-env-"));
    const homeDir = path.join(root, "home");
    const projectRoot = path.join(root, "project");
    const configuredDataDir = path.join(root, "prod-data");
    await fs.mkdir(path.join(homeDir, ".config", "neotoma"), { recursive: true });
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, "package.json"),
      JSON.stringify({ name: "neotoma", version: "0.0.0-test" }, null, 2)
    );
    await fs.writeFile(
      path.join(homeDir, ".config", "neotoma", ".env"),
      `NEOTOMA_DATA_DIR=${configuredDataDir}\n`
    );

    vi.stubEnv("HOME", homeDir);
    vi.stubEnv("USERPROFILE", homeDir);
    vi.stubEnv("NEOTOMA_ENV", "production");
    vi.stubEnv("NEOTOMA_PROJECT_ROOT", projectRoot);
    vi.stubEnv("NEOTOMA_DATA_DIR", "");

    const { config } = await importFreshConfig();
    expect(config.dataDir).toBe(configuredDataDir);
  });

  it("falls back to projectRoot/data when user env is absent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-config-default-data-"));
    const homeDir = path.join(root, "home");
    const projectRoot = path.join(root, "project");
    await fs.mkdir(homeDir, { recursive: true });
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, "package.json"),
      JSON.stringify({ name: "neotoma", version: "0.0.0-test" }, null, 2)
    );

    vi.stubEnv("HOME", homeDir);
    vi.stubEnv("USERPROFILE", homeDir);
    vi.stubEnv("NEOTOMA_ENV", "production");
    vi.stubEnv("NEOTOMA_PROJECT_ROOT", projectRoot);
    vi.stubEnv("NEOTOMA_DATA_DIR", "");

    const { config } = await importFreshConfig();
    expect(config.dataDir).toBe(path.join(projectRoot, "data"));
  });
});
