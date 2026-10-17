/**
 * Regression tests for ateles#578 / ateles#566.
 *
 * `NEOTOMA_BEARER_TOKEN` lives in `~/.config/neotoma/.env`, but historically only
 * the MCP stdio wrapper read that file (grepping the token out and exporting it).
 * The CLI resolved credentials from `process.env` alone, so every process that
 * was not descended from that wrapper — an interactive shell, a daemon, a cron
 * job, a dispatched swarm agent — reached Neotoma with no credential at all and
 * got `401 Missing Bearer token`.
 *
 * These tests pin the fix and its precedence rule: the file is loaded, and the
 * real process environment still wins over it.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const FILE_TOKEN = "token-from-user-env-file";
const ENV_TOKEN = "token-from-process-env";

async function importFreshUserEnv() {
  vi.resetModules();
  return import("../../src/cli/user_env.ts");
}

/** Build a throwaway HOME containing ~/.config/neotoma/.env with the given body. */
async function makeHomeWithUserEnv(body: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-user-env-"));
  const homeDir = path.join(root, "home");
  await fs.mkdir(path.join(homeDir, ".config", "neotoma"), { recursive: true });
  await fs.writeFile(path.join(homeDir, ".config", "neotoma", ".env"), body);
  return homeDir;
}

describe("CLI user env file credential loading (ateles#578)", () => {
  beforeEach(() => {
    // NEOTOMA_ENV_FILE would otherwise redirect the loader away from the fake HOME.
    vi.stubEnv("NEOTOMA_ENV_FILE", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("authenticates a process with no NEOTOMA_BEARER_TOKEN in its environment", async () => {
    const homeDir = await makeHomeWithUserEnv(
      `NEOTOMA_BEARER_TOKEN=${FILE_TOKEN}\nNEOTOMA_BASE_URL=https://neotoma.example.com\n`
    );
    vi.stubEnv("HOME", homeDir);
    vi.stubEnv("USERPROFILE", homeDir);
    // The failure condition from the issue: nothing in the environment.
    vi.stubEnv("NEOTOMA_BEARER_TOKEN", "");
    vi.stubEnv("NEOTOMA_BASE_URL", "");

    const { loadUserEnvFile } = await importFreshUserEnv();
    const result = loadUserEnvFile();

    expect(process.env.NEOTOMA_BEARER_TOKEN).toBe(FILE_TOKEN);
    expect(process.env.NEOTOMA_BASE_URL).toBe("https://neotoma.example.com");
    expect(result.applied).toContain("NEOTOMA_BEARER_TOKEN");
  });

  it("lets an explicitly-set env var take precedence over the file", async () => {
    const homeDir = await makeHomeWithUserEnv(`NEOTOMA_BEARER_TOKEN=${FILE_TOKEN}\n`);
    vi.stubEnv("HOME", homeDir);
    vi.stubEnv("USERPROFILE", homeDir);
    vi.stubEnv("NEOTOMA_BEARER_TOKEN", ENV_TOKEN);

    const { loadUserEnvFile } = await importFreshUserEnv();
    const result = loadUserEnvFile();

    expect(process.env.NEOTOMA_BEARER_TOKEN).toBe(ENV_TOKEN);
    // The file value must not have been applied at all.
    expect(result.applied).not.toContain("NEOTOMA_BEARER_TOKEN");
  });

  it("never returns or exposes a secret value, only the key names applied", async () => {
    const homeDir = await makeHomeWithUserEnv(`NEOTOMA_BEARER_TOKEN=${FILE_TOKEN}\n`);
    vi.stubEnv("HOME", homeDir);
    vi.stubEnv("USERPROFILE", homeDir);
    vi.stubEnv("NEOTOMA_BEARER_TOKEN", "");

    const { loadUserEnvFile } = await importFreshUserEnv();
    const result = loadUserEnvFile();

    // #579 is a live issue about Neotoma logging credentials. The loader's return
    // value is the thing most likely to reach a log line, so it must be inert.
    expect(JSON.stringify(result)).not.toContain(FILE_TOKEN);
  });

  it("honors NEOTOMA_ENV_FILE as an override of the default path", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-user-env-override-"));
    const customPath = path.join(root, "custom.env");
    await fs.writeFile(customPath, `NEOTOMA_BEARER_TOKEN=${FILE_TOKEN}\n`);
    // A HOME whose default file exists but holds a DIFFERENT value, so a pass
    // cannot be explained by the default path being read.
    const homeDir = await makeHomeWithUserEnv("NEOTOMA_BEARER_TOKEN=default-path-token\n");

    vi.stubEnv("HOME", homeDir);
    vi.stubEnv("USERPROFILE", homeDir);
    vi.stubEnv("NEOTOMA_ENV_FILE", customPath);
    vi.stubEnv("NEOTOMA_BEARER_TOKEN", "");

    const { loadUserEnvFile } = await importFreshUserEnv();
    loadUserEnvFile();

    expect(process.env.NEOTOMA_BEARER_TOKEN).toBe(FILE_TOKEN);
  });

  it("does not hydrate NEOTOMA_ENV from the file (dev/prod DB selection stays explicit)", async () => {
    // Real machines carry a stale `NEOTOMA_ENV=development` beside a production
    // NEOTOMA_BASE_URL. Hydrating it would silently select a development SQLite
    // file. See the "secondary finding" in ateles#578.
    const homeDir = await makeHomeWithUserEnv(
      `NEOTOMA_ENV=development\nNEOTOMA_BEARER_TOKEN=${FILE_TOKEN}\n`
    );
    vi.stubEnv("HOME", homeDir);
    vi.stubEnv("USERPROFILE", homeDir);
    vi.stubEnv("NEOTOMA_BEARER_TOKEN", "");
    vi.stubEnv("NEOTOMA_ENV", "");

    const { loadUserEnvFile } = await importFreshUserEnv();
    const result = loadUserEnvFile();

    expect(process.env.NEOTOMA_ENV).toBe("");
    expect(result.applied).not.toContain("NEOTOMA_ENV");
  });

  it("is a no-op when the user env file is absent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-user-env-absent-"));
    vi.stubEnv("HOME", root);
    vi.stubEnv("USERPROFILE", root);
    vi.stubEnv("NEOTOMA_BEARER_TOKEN", "");

    const { loadUserEnvFile } = await importFreshUserEnv();
    const result = loadUserEnvFile();

    expect(result.applied).toEqual([]);
    expect(result.path).toBeNull();
  });

  it("parses quoted and `export`-prefixed lines the wrapper script also accepts", async () => {
    const homeDir = await makeHomeWithUserEnv(
      `# comment\n\nexport NEOTOMA_BEARER_TOKEN="${FILE_TOKEN}"\n`
    );
    vi.stubEnv("HOME", homeDir);
    vi.stubEnv("USERPROFILE", homeDir);
    vi.stubEnv("NEOTOMA_BEARER_TOKEN", "");

    const { loadUserEnvFile } = await importFreshUserEnv();
    loadUserEnvFile();

    expect(process.env.NEOTOMA_BEARER_TOKEN).toBe(FILE_TOKEN);
  });
});
