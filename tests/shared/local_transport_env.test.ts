import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ENV_KEYS = [
  "NEOTOMA_ENV",
  "NEOTOMA_SESSION_ENV",
  "NEOTOMA_CLI_PREFERRED_ENV",
  "HOME",
  "USERPROFILE",
] as const;
type EnvKey = (typeof ENV_KEYS)[number];

const savedEnv: Partial<Record<EnvKey, string | undefined>> = {};

let tempHome: string | null = null;

function clearEnvKeys(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

/** Write ~/.config/neotoma/config.json under the temp HOME with the given preferred_env (or no file). */
function writeConfigPreferredEnv(value: "prod" | "dev" | null): string {
  if (!tempHome) throw new Error("tempHome not initialized");
  const configDir = join(tempHome, ".config", "neotoma");
  mkdirSync(configDir, { recursive: true });
  const configPath = join(configDir, "config.json");
  if (value === null) {
    writeFileSync(configPath, JSON.stringify({}));
  } else {
    writeFileSync(configPath, JSON.stringify({ preferred_env: value }));
  }
  return configPath;
}

describe("resolveLocalTransportEnv", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
    }
    clearEnvKeys();
    tempHome = mkdtempSync(join(tmpdir(), "neotoma-local-transport-test-"));
    process.env.HOME = tempHome;
    vi.resetModules();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    if (tempHome && existsSync(tempHome)) {
      rmSync(tempHome, { recursive: true, force: true });
    }
    tempHome = null;
  });

  it("returns 'production' when NEOTOMA_ENV=production overrides port inference", async () => {
    process.env.NEOTOMA_ENV = "production";
    const { resolveLocalTransportEnv } = await import("../../src/shared/local_transport.ts");
    expect(resolveLocalTransportEnv("http://localhost:3080")).toBe("production");
  });

  it("returns 'development' when NEOTOMA_ENV=development overrides port inference", async () => {
    process.env.NEOTOMA_ENV = "development";
    const { resolveLocalTransportEnv } = await import("../../src/shared/local_transport.ts");
    expect(resolveLocalTransportEnv("http://localhost:3180")).toBe("development");
  });

  it("maps NEOTOMA_SESSION_ENV=prod to 'production'", async () => {
    process.env.NEOTOMA_SESSION_ENV = "prod";
    const { resolveLocalTransportEnv } = await import("../../src/shared/local_transport.ts");
    expect(resolveLocalTransportEnv("http://localhost:3080")).toBe("production");
  });

  it("maps NEOTOMA_SESSION_ENV=dev to 'development'", async () => {
    process.env.NEOTOMA_SESSION_ENV = "dev";
    const { resolveLocalTransportEnv } = await import("../../src/shared/local_transport.ts");
    expect(resolveLocalTransportEnv("http://localhost:3180")).toBe("development");
  });

  it("maps NEOTOMA_CLI_PREFERRED_ENV=prod to 'production'", async () => {
    process.env.NEOTOMA_CLI_PREFERRED_ENV = "prod";
    const { resolveLocalTransportEnv } = await import("../../src/shared/local_transport.ts");
    expect(resolveLocalTransportEnv("http://localhost:3080")).toBe("production");
  });

  it("maps NEOTOMA_CLI_PREFERRED_ENV=dev to 'development'", async () => {
    process.env.NEOTOMA_CLI_PREFERRED_ENV = "dev";
    const { resolveLocalTransportEnv } = await import("../../src/shared/local_transport.ts");
    expect(resolveLocalTransportEnv("http://localhost:3180")).toBe("development");
  });

  it("reads preferred_env=prod from CLI config file when no env vars set", async () => {
    writeConfigPreferredEnv("prod");
    const { resolveLocalTransportEnv } = await import("../../src/shared/local_transport.ts");
    expect(resolveLocalTransportEnv("http://localhost:3080")).toBe("production");
  });

  it("reads preferred_env=dev from CLI config file when no env vars set", async () => {
    writeConfigPreferredEnv("dev");
    const { resolveLocalTransportEnv } = await import("../../src/shared/local_transport.ts");
    expect(resolveLocalTransportEnv("http://localhost:3180")).toBe("development");
  });

  it("infers 'production' from port 3180 when no env signal is present", async () => {
    const { resolveLocalTransportEnv } = await import("../../src/shared/local_transport.ts");
    expect(resolveLocalTransportEnv("http://localhost:3180")).toBe("production");
  });

  it("defaults to 'development' for port 3080 when no env signal is present", async () => {
    const { resolveLocalTransportEnv } = await import("../../src/shared/local_transport.ts");
    expect(resolveLocalTransportEnv("http://localhost:3080")).toBe("development");
  });

  it("defaults to 'development' when baseUrl is undefined", async () => {
    const { resolveLocalTransportEnv } = await import("../../src/shared/local_transport.ts");
    expect(resolveLocalTransportEnv(undefined)).toBe("development");
  });

  it("defaults to 'development' when baseUrl is malformed", async () => {
    const { resolveLocalTransportEnv } = await import("../../src/shared/local_transport.ts");
    expect(resolveLocalTransportEnv("not-a-url")).toBe("development");
  });

  it("prioritizes NEOTOMA_ENV over NEOTOMA_SESSION_ENV, CLI_PREFERRED_ENV, config, and port", async () => {
    process.env.NEOTOMA_ENV = "development";
    process.env.NEOTOMA_SESSION_ENV = "prod";
    process.env.NEOTOMA_CLI_PREFERRED_ENV = "prod";
    writeConfigPreferredEnv("prod");
    const { resolveLocalTransportEnv } = await import("../../src/shared/local_transport.ts");
    expect(resolveLocalTransportEnv("http://localhost:3180")).toBe("development");
  });

  it("prioritizes NEOTOMA_SESSION_ENV over NEOTOMA_CLI_PREFERRED_ENV, config, and port", async () => {
    process.env.NEOTOMA_SESSION_ENV = "dev";
    process.env.NEOTOMA_CLI_PREFERRED_ENV = "prod";
    writeConfigPreferredEnv("prod");
    const { resolveLocalTransportEnv } = await import("../../src/shared/local_transport.ts");
    expect(resolveLocalTransportEnv("http://localhost:3180")).toBe("development");
  });

  it("prioritizes NEOTOMA_CLI_PREFERRED_ENV over config file and port inference", async () => {
    process.env.NEOTOMA_CLI_PREFERRED_ENV = "dev";
    writeConfigPreferredEnv("prod");
    const { resolveLocalTransportEnv } = await import("../../src/shared/local_transport.ts");
    expect(resolveLocalTransportEnv("http://localhost:3180")).toBe("development");
  });

  it("prioritizes config file preferred_env over port inference", async () => {
    writeConfigPreferredEnv("prod");
    const { resolveLocalTransportEnv } = await import("../../src/shared/local_transport.ts");
    expect(resolveLocalTransportEnv("http://localhost:3080")).toBe("production");
  });

  it("ignores invalid preferred_env values in config file and falls through to port inference", async () => {
    if (!tempHome) throw new Error("tempHome not initialized");
    const configDir = join(tempHome, ".config", "neotoma");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "config.json"), JSON.stringify({ preferred_env: "bogus" }));
    const { resolveLocalTransportEnv } = await import("../../src/shared/local_transport.ts");
    expect(resolveLocalTransportEnv("http://localhost:3180")).toBe("production");
  });

  it("ignores malformed config file and falls through to port inference", async () => {
    if (!tempHome) throw new Error("tempHome not initialized");
    const configDir = join(tempHome, ".config", "neotoma");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "config.json"), "{not valid json");
    const { resolveLocalTransportEnv } = await import("../../src/shared/local_transport.ts");
    expect(resolveLocalTransportEnv("http://localhost:3180")).toBe("production");
  });
});
