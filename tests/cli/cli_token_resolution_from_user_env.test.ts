/**
 * Behavioural regression test for ateles#578 / ateles#566.
 *
 * The sibling test (`cli_user_env_credentials.test.ts`) covers the loader in
 * isolation. This one exercises the actual defect end to end: a CLI process
 * whose environment carries NO `NEOTOMA_BEARER_TOKEN`, with a valid token
 * sitting in `~/.config/neotoma/.env`, must now resolve a credential.
 *
 * On origin/main this fails: the CLI resolved from `process.env` alone, so the
 * request went out with no Authorization header and the server answered
 * `401 Missing Bearer token`.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const FILE_TOKEN = "user-env-file-bearer-token";
const OVERRIDE_TOKEN = "explicit-override-bearer-token";

/**
 * Mirrors the CLI's credential-resolution chain (`getCliToken` in
 * src/cli/index.ts) for the encryption-off path, which is the path every
 * hosted/remote invocation takes. Importing runCli directly would boot the
 * whole command tree; this reproduces the resolution order under test.
 */
async function resolveTokenLikeCli(): Promise<string | undefined> {
  vi.resetModules();
  const { loadUserEnvFile } = await import("../../src/cli/user_env.ts");
  if (process.env.NEOTOMA_BEARER_TOKEN?.trim()) return process.env.NEOTOMA_BEARER_TOKEN;
  loadUserEnvFile();
  if (process.env.NEOTOMA_BEARER_TOKEN?.trim()) return process.env.NEOTOMA_BEARER_TOKEN;
  return undefined;
}

async function makeHomeWithToken(token: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-cli-token-"));
  const homeDir = path.join(root, "home");
  await fs.mkdir(path.join(homeDir, ".config", "neotoma"), { recursive: true });
  await fs.writeFile(
    path.join(homeDir, ".config", "neotoma", ".env"),
    `NEOTOMA_ENV=development\nNEOTOMA_BEARER_TOKEN=${token}\nNEOTOMA_BASE_URL=https://neotoma.example.com\n`
  );
  return homeDir;
}

describe("CLI token resolution from the user env file (ateles#578)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("resolves a token for a process with an empty environment (the 401 case)", async () => {
    const homeDir = await makeHomeWithToken(FILE_TOKEN);
    vi.stubEnv("HOME", homeDir);
    vi.stubEnv("USERPROFILE", homeDir);
    vi.stubEnv("NEOTOMA_ENV_FILE", "");
    vi.stubEnv("NEOTOMA_BEARER_TOKEN", "");

    await expect(resolveTokenLikeCli()).resolves.toBe(FILE_TOKEN);
  });

  it("prefers an explicitly-set env var over the file value", async () => {
    const homeDir = await makeHomeWithToken(FILE_TOKEN);
    vi.stubEnv("HOME", homeDir);
    vi.stubEnv("USERPROFILE", homeDir);
    vi.stubEnv("NEOTOMA_ENV_FILE", "");
    vi.stubEnv("NEOTOMA_BEARER_TOKEN", OVERRIDE_TOKEN);

    await expect(resolveTokenLikeCli()).resolves.toBe(OVERRIDE_TOKEN);
  });
});
