/**
 * Regression tests for the CLI-test local-target guard
 * (`tests/helpers/cli_local_target.ts`).
 *
 * Background: CLI tests that store through `node dist/cli/index.js` inherit the
 * environment, and under `NODE_ENV=test` the CLI talks to whatever base URL it
 * resolves — an ambient `NEOTOMA_BASE_URL`, or a project env file the CLI loads
 * itself. Run with production settings, such a test created real entities in a
 * production instance. The guard pins every CLI invocation to the suite's own
 * loopback test server and refuses anything else before a process is spawned.
 *
 * `node:child_process` is mocked here so the refusal assertions can prove that
 * NOTHING was spawned (and therefore no network call could have been made).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promisify } from "node:util";

const spawned: Array<{ command: string; env: NodeJS.ProcessEnv | undefined }> = [];

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const exec = vi.fn();
  (exec as unknown as Record<symbol, unknown>)[promisify.custom] = (
    command: string,
    options?: { env?: NodeJS.ProcessEnv }
  ) => {
    spawned.push({ command, env: options?.env });
    return Promise.resolve({ stdout: "{}", stderr: "" });
  };
  return { ...actual, exec };
});

const {
  NonLocalCliTargetError,
  assertLocalBaseUrl,
  execAsync,
  isLocalBaseUrl,
  localCliEnv,
  localTestBaseUrl,
  withLocalBaseUrl,
} = await import("../helpers/cli_local_target.js");

const CLI = "node dist/cli/index.js";
// Obviously fake and non-routable (RFC 2606 `.invalid`): safe even if a guard regressed.
const FAKE_REMOTE = "https://example.invalid";

describe("CLI test local-target guard", () => {
  beforeEach(() => {
    spawned.length = 0;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("refusal of a non-local target", () => {
    it("aborts before spawning when the test's env names a non-local NEOTOMA_BASE_URL", async () => {
      await expect(
        execAsync(`${CLI} store --entities '[]' --json`, {
          env: { ...process.env, NEOTOMA_BASE_URL: FAKE_REMOTE },
        })
      ).rejects.toBeInstanceOf(NonLocalCliTargetError);
      expect(spawned).toEqual([]);
    });

    it("aborts before spawning when the command carries a non-local --base-url", async () => {
      await expect(
        execAsync(`${CLI} --base-url ${FAKE_REMOTE} store --entities '[]' --json`)
      ).rejects.toThrow(/non-local Neotoma target/);
      await expect(
        execAsync(`${CLI} store --entities '[]' --base-url=${FAKE_REMOTE} --json`)
      ).rejects.toBeInstanceOf(NonLocalCliTargetError);
      expect(spawned).toEqual([]);
    });

    it("names only the host in its message, never credentials or path", () => {
      expect(() =>
        assertLocalBaseUrl("https://user:secret-token@example.invalid/tenant/x", "NEOTOMA_BASE_URL")
      ).toThrow(/example\.invalid/);
      try {
        assertLocalBaseUrl(
          "https://user:secret-token@example.invalid/tenant/x",
          "NEOTOMA_BASE_URL"
        );
      } catch (err) {
        expect(String((err as Error).message)).not.toMatch(/secret-token|tenant/);
      }
    });

    it("refuses an unparseable base URL rather than treating it as local", () => {
      expect(isLocalBaseUrl("not a url")).toBe(false);
      expect(isLocalBaseUrl("")).toBe(false);
    });
  });

  describe("pinning to the local test server", () => {
    it("scrubs an ambient non-local NEOTOMA_BASE_URL and pins --base-url to loopback", async () => {
      vi.stubEnv("NEOTOMA_BASE_URL", FAKE_REMOTE);
      vi.stubEnv("NEOTOMA_BEARER_TOKEN", "fake-token-for-test");
      vi.stubEnv("NEOTOMA_ENV", "production");

      await execAsync(`${CLI} store --entities '[]' --json`);

      expect(spawned).toHaveLength(1);
      const { command, env } = spawned[0];
      expect(command).toContain(`${CLI} --base-url ${localTestBaseUrl()} store`);
      expect(isLocalBaseUrl(localTestBaseUrl())).toBe(true);
      expect(env?.NEOTOMA_BASE_URL).toBeUndefined();
      expect(env?.NEOTOMA_BEARER_TOKEN).toBeUndefined();
      expect(env?.NEOTOMA_ENV).toBe("development");
    });

    it("scrubs inherited ambient values when a test spreads process.env into its own env", async () => {
      vi.stubEnv("NEOTOMA_BASE_URL", FAKE_REMOTE);
      await execAsync(`${CLI} entities list --json`, {
        env: { ...process.env, NEOTOMA_USER_ID: "u" },
      });
      expect(spawned[0].env?.NEOTOMA_BASE_URL).toBeUndefined();
      expect(spawned[0].env?.NEOTOMA_USER_ID).toBe("u");
      expect(spawned[0].command).toContain("--base-url http://localhost:");
    });

    it("promotes a loopback NEOTOMA_BASE_URL set by the test to the flag", async () => {
      await execAsync(`${CLI} entities list --json`, {
        env: { ...process.env, NEOTOMA_BASE_URL: "http://127.0.0.1:1" },
      });
      expect(spawned[0].command).toContain(`${CLI} --base-url http://127.0.0.1:1 entities`);
    });

    it("keeps an explicit loopback --base-url and leaves non-CLI commands alone", async () => {
      await execAsync(`${CLI} --base-url http://localhost:4242 entities list`);
      expect(spawned[0].command).toBe(`${CLI} --base-url http://localhost:4242 entities list`);
      await execAsync("echo hello");
      expect(spawned[1].command).toBe("echo hello");
    });

    it("preserves exec options such as cwd and timeout", async () => {
      await execAsync(`${CLI} entities list`, { cwd: "/tmp", timeout: 1234 });
      expect(spawned).toHaveLength(1);
    });
  });

  describe("pure helpers", () => {
    it("withLocalBaseUrl inserts the flag directly after the CLI entry point", () => {
      expect(withLocalBaseUrl(`${CLI} store --json`, undefined, "http://localhost:19080")).toBe(
        `${CLI} --base-url http://localhost:19080 store --json`
      );
    });

    it("keeps a quoted absolute CLI path as one argument", () => {
      expect(
        withLocalBaseUrl('node "/abs/dist/cli/index.js" api start', undefined, "http://localhost:1")
      ).toBe('node "/abs/dist/cli/index.js" --base-url http://localhost:1 api start');
    });

    it("leaves help and version invocations untouched (no request is made)", () => {
      expect(withLocalBaseUrl(`${CLI} --help`, undefined, "http://localhost:1")).toBe(
        `${CLI} --help`
      );
      expect(withLocalBaseUrl(`${CLI} store --help`, undefined, "http://localhost:1")).toBe(
        `${CLI} store --help`
      );
    });

    it("localCliEnv keeps a deliberately built env untouched", () => {
      const env = localCliEnv({ PATH: "/usr/bin", NEOTOMA_ENV: "production" });
      expect(env).toEqual({ PATH: "/usr/bin", NEOTOMA_ENV: "production" });
    });

    it("isLocalBaseUrl agrees with the CLI's own isLocalhostBaseUrl", async () => {
      const { isLocalhostBaseUrl } = await import("../../src/cli/index.js");
      for (const url of [
        "http://localhost:3080",
        "http://127.0.0.1:1",
        "http://[::1]:3080",
        "http://0.0.0.0:3080",
        FAKE_REMOTE,
        "https://neotoma.example",
        "http://localhost.evil.invalid",
        "garbage",
      ]) {
        expect(isLocalBaseUrl(url), url).toBe(isLocalhostBaseUrl(url));
      }
    });
  });
});
