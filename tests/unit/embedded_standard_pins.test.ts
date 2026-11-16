import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pins for behaviour that must stay exactly as before outside embedded mode, and for the
 * environment the sandbox seeder child gets inside it.
 */

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-embedded-pins-"));
  vi.resetModules();
});

afterEach(async () => {
  const { clearEmbeddedConfig } = await import("../../src/config_embedded.ts");
  clearEmbeddedConfig();
  vi.unstubAllEnvs();
  vi.doUnmock("node:fs");
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe("standard mode: bundle state path", () => {
  it("resolves the home directory through the operating system, not HOME or USERPROFILE", async () => {
    const decoy = path.join(root, "decoy-home");
    // An empty HOME makes the operating-system lookup fall back to the user database;
    // USERPROFILE must not be consulted at all.
    vi.stubEnv("HOME", "");
    vi.stubEnv("USERPROFILE", decoy);
    vi.stubEnv("NEOTOMA_BUNDLE_STATE_PATH", "");
    const { bundleStatePath } = await import("../../src/services/bundles/state_store.ts");
    const resolved = bundleStatePath();
    expect(resolved).toBe(path.join(os.homedir(), ".config", "neotoma", "bundle_state.json"));
    expect(resolved.startsWith(decoy)).toBe(false);
  });
});

describe("standard mode: mirror config with no home variable", () => {
  it("reads and writes no user config file when HOME and USERPROFILE are unset", async () => {
    const calls: string[] = [];
    vi.doMock("node:fs", async (orig) => {
      const real = await orig<typeof import("node:fs")>();
      const guard = (name: string, passthrough: boolean) =>
        ((...args: unknown[]) => {
          const target = String(args[0]);
          if (target.endsWith("config.json") || target.endsWith(path.join(".config", "neotoma"))) {
            calls.push(`${name}:${target}`);
            if (name === "readFileSync") {
              throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
            }
            return undefined; // never touch a real home directory from this test
          }
          return passthrough
            ? (real as unknown as Record<string, (...a: unknown[]) => unknown>)[name](...args)
            : undefined;
        }) as never;
      return {
        ...real,
        default: real,
        readFileSync: guard("readFileSync", true),
        writeFileSync: guard("writeFileSync", true),
        mkdirSync: guard("mkdirSync", true),
      };
    });
    vi.stubEnv("HOME", "");
    vi.stubEnv("USERPROFILE", "");
    delete process.env.HOME;
    delete process.env.USERPROFILE;
    const mirror = await import("../../src/services/canonical_mirror.ts");
    const cfg = mirror.getMirrorConfig();
    expect(cfg.enabled).toBe(false);
    mirror.setMirrorConfig({ enabled: false });
    expect(calls).toEqual([]);
  });
});

describe("embedded mode: sandbox seeder child environment", () => {
  async function embed(extra: Record<string, unknown> = {}) {
    const { resolveEmbeddedConfig, setEmbeddedConfig } =
      await import("../../src/config_embedded.ts");
    setEmbeddedConfig(resolveEmbeddedConfig({ dataDir: path.join(root, "data"), ...extra }));
  }

  it("passes the explicit map plus a minimal fixed PATH, and no other host variable", async () => {
    vi.stubEnv("PATH", "/host/only/bin");
    vi.stubEnv("HOST_ONLY_SETTING", "host-marker");
    await embed({ env: { EXPLICIT_SETTING: "x" } });
    const { buildSeedChildEnv, EMBEDDED_SEED_PATH } =
      await import("../../src/services/sandbox/seeder.ts");
    const env = buildSeedChildEnv("synthetic-bearer");
    expect(env.PATH).toBe(EMBEDDED_SEED_PATH);
    expect(env.PATH).not.toContain("/host/only/bin");
    expect(env.EXPLICIT_SETTING).toBe("x");
    expect(env.HOST_ONLY_SETTING).toBeUndefined();
    expect(env.NEOTOMA_SANDBOX_BEARER).toBe("synthetic-bearer");
  });

  it("uses a PATH named in env or allowProcessEnv instead of the fixed one", async () => {
    vi.stubEnv("PATH", "/named/host/bin");
    await embed({ allowProcessEnv: ["PATH"] });
    const { buildSeedChildEnv } = await import("../../src/services/sandbox/seeder.ts");
    expect(buildSeedChildEnv().PATH).toBe("/named/host/bin");
  });

  it("standard mode passes the process environment unchanged", async () => {
    vi.stubEnv("PATH", "/host/only/bin");
    const { buildSeedChildEnv } = await import("../../src/services/sandbox/seeder.ts");
    const env = buildSeedChildEnv();
    expect(env.PATH).toBe("/host/only/bin");
    expect(env.NEOTOMA_SANDBOX_BEARER).toBe(process.env.NEOTOMA_SANDBOX_BEARER);
  });
});
