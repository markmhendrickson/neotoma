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

const spawned: Array<{ command: string; env: NodeJS.ProcessEnv | undefined; args?: string[] }> = [];

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
  const execFile = vi.fn();
  (execFile as unknown as Record<symbol, unknown>)[promisify.custom] = (
    file: string,
    args: string[],
    options?: { env?: NodeJS.ProcessEnv }
  ) => {
    spawned.push({ command: [file, ...args].join(" "), env: options?.env, args });
    return Promise.resolve({ stdout: "{}", stderr: "" });
  };
  const execSync = vi.fn((command: string, options?: { env?: NodeJS.ProcessEnv }) => {
    spawned.push({ command, env: options?.env });
    return "{}";
  });
  const spawnSync = vi.fn((file: string, args: string[], options?: { env?: NodeJS.ProcessEnv }) => {
    spawned.push({ command: [file, ...args].join(" "), env: options?.env, args });
    return { stdout: "{}", stderr: "", status: 0 };
  });
  return { ...actual, exec, execFile, execSync, spawnSync };
});

// vitest.setup.ts already loaded the helper with the real child_process; reload it so the
// mock above is the one it promisifies.
vi.resetModules();

const {
  AmbiguousCliInvocationError,
  NonLocalCliTargetError,
  assertLocalBaseUrl,
  SCRUB_WARNING,
  execAsync,
  execFileLocal,
  execSyncLocal,
  isLocalBaseUrl,
  scrubNonLocalBaseUrl,
  spawnSyncLocal,
  withLocalBaseUrlArgs,
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
      expect(command).toContain(`${CLI} --base-url '${localTestBaseUrl()}' store`);
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
      expect(spawned[0].command).toContain("--base-url 'http://localhost:");
    });

    it("promotes a loopback NEOTOMA_BASE_URL set by the test to the flag", async () => {
      await execAsync(`${CLI} entities list --json`, {
        env: { ...process.env, NEOTOMA_BASE_URL: "http://127.0.0.1:1" },
      });
      expect(spawned[0].command).toContain(`${CLI} --base-url 'http://127.0.0.1:1' entities`);
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

  describe("hardening", () => {
    it("quotes the injected origin and drops userinfo, path and query from it", () => {
      const out = withLocalBaseUrl(
        `${CLI} store`,
        "http://user:pw@localhost:1/tenant?x=1",
        "http://localhost:2"
      );
      expect(out).toBe(`${CLI} --base-url 'http://localhost:1' store`);
      expect(out).not.toMatch(/user|pw|tenant/);
    });

    it("checks every --base-url occurrence, not just the first", async () => {
      await expect(
        execAsync(`${CLI} --base-url http://localhost:1 store --base-url ${FAKE_REMOTE}`)
      ).rejects.toBeInstanceOf(NonLocalCliTargetError);
      expect(spawned).toEqual([]);
    });

    it("treats --help as no-network only as a real argument, not inside a quoted payload", () => {
      const pinned = withLocalBaseUrl(
        `${CLI} store --entities '[{"title":"--help"}]'`,
        undefined,
        "http://localhost:1"
      );
      expect(pinned).toContain("--base-url 'http://localhost:1'");
      const dq = withLocalBaseUrl(
        `${CLI} store --entities "[\\"-h\\"]"`,
        undefined,
        "http://localhost:1"
      );
      expect(dq).toContain("--base-url");
      expect(withLocalBaseUrl(`${CLI} store --version`, undefined, "http://localhost:1")).toBe(
        `${CLI} store --version`
      );
    });
  });

  describe("sync and execFile variants", () => {
    it("execSyncLocal pins the base URL, scrubs ambient env, and refuses non-local", () => {
      vi.stubEnv("NEOTOMA_BASE_URL", FAKE_REMOTE);
      execSyncLocal(`${CLI} stats --json`);
      expect(spawned[0].command).toContain("--base-url 'http://localhost:");
      expect(spawned[0].env?.NEOTOMA_BASE_URL).toBeUndefined();
      spawned.length = 0;
      expect(() => execSyncLocal(`${CLI} --base-url ${FAKE_REMOTE} stats`)).toThrow(
        NonLocalCliTargetError
      );
      expect(spawned).toEqual([]);
    });

    it("spawnSyncLocal pins an argument vector and refuses non-local", () => {
      spawnSyncLocal("node", ["/abs/dist/cli/index.js", "schemas", "list"]);
      expect(spawned[0].args?.slice(0, 3)).toEqual([
        "/abs/dist/cli/index.js",
        "--base-url",
        expect.stringMatching(/^http:\/\/localhost:\d+$/),
      ]);
      spawned.length = 0;
      expect(() =>
        spawnSyncLocal("node", ["/abs/dist/cli/index.js", "--base-url", FAKE_REMOTE, "stats"])
      ).toThrow(NonLocalCliTargetError);
      expect(() =>
        spawnSyncLocal("node", ["/abs/dist/cli/index.js", `--base-url=${FAKE_REMOTE}`])
      ).toThrow(NonLocalCliTargetError);
      expect(spawned).toEqual([]);
    });

    it("withLocalBaseUrlArgs leaves help argument vectors and non-CLI vectors alone", () => {
      expect(
        withLocalBaseUrlArgs(["/x/dist/cli/index.js", "--help"], undefined, "http://localhost:1")
      ).toEqual(["/x/dist/cli/index.js", "--help"]);
      expect(withLocalBaseUrlArgs(["-e", "1"], undefined, "http://localhost:1")).toEqual([
        "-e",
        "1",
      ]);
    });

    it("execFileLocal pins and refuses non-local", async () => {
      await execFileLocal(process.execPath, ["/abs/dist/cli/index.js", "stats"]);
      expect(spawned[0].args).toContain("--base-url");
      spawned.length = 0;
      await expect(
        execFileLocal(process.execPath, [
          "/abs/dist/cli/index.js",
          "--base-url",
          FAKE_REMOTE,
          "stats",
        ])
      ).rejects.toBeInstanceOf(NonLocalCliTargetError);
      expect(spawned).toEqual([]);
    });
  });

  describe("every CLI entry point and command shape", () => {
    it("pins dist/cli/bootstrap.js and src/cli/bootstrap.ts command strings", () => {
      for (const entry of ["dist/cli/bootstrap.js", "src/cli/bootstrap.ts"]) {
        const out = withLocalBaseUrl(
          `node --import tsx "/abs/${entry}" backup create`,
          undefined,
          "http://localhost:1"
        );
        expect(out).toBe(
          `node --import tsx "/abs/${entry}" --base-url 'http://localhost:1' backup create`
        );
      }
    });

    it("pins bootstrap argument vectors, including tsx", () => {
      for (const argv of [
        ["--import", "tsx", "src/cli/bootstrap.ts", "backup", "create"],
        ["/abs/dist/cli/bootstrap.js", "backup", "create"],
      ]) {
        const out = withLocalBaseUrlArgs(argv, undefined, "http://localhost:1");
        expect(out).toContain("--base-url");
        expect(out[out.indexOf("--base-url") + 1]).toBe("http://localhost:1");
        expect(() =>
          withLocalBaseUrlArgs(
            [...argv, "--base-url", FAKE_REMOTE],
            undefined,
            "http://localhost:1"
          )
        ).toThrow(NonLocalCliTargetError);
      }
    });

    it("recognises a Windows-style path and still refuses a non-local target", () => {
      const win = String.raw`node dist\cli\index.js --base-url ${FAKE_REMOTE} store`;
      expect(() => withLocalBaseUrl(win, undefined, "http://localhost:1")).toThrow(
        NonLocalCliTargetError
      );
      expect(
        withLocalBaseUrl(String.raw`node dist\cli\index.js store`, undefined, "http://localhost:1")
      ).toContain("--base-url 'http://localhost:1'");
      expect(
        withLocalBaseUrlArgs(
          [String.raw`C:\repo\dist\cli\bootstrap.js`, "stats"],
          undefined,
          "http://localhost:1"
        )
      ).toContain("--base-url");
    });

    it("refuses a string (or vector) that starts the CLI more than once, before spawning", async () => {
      await expect(
        execAsync(`${CLI} store --json && ${CLI} entities list --json`)
      ).rejects.toBeInstanceOf(AmbiguousCliInvocationError);
      expect(() => execSyncLocal(`${CLI} stats; node dist/cli/bootstrap.js stats`)).toThrow(
        AmbiguousCliInvocationError
      );
      expect(() =>
        withLocalBaseUrlArgs(
          ["dist/cli/index.js", "stats", "dist/cli/bootstrap.js"],
          undefined,
          "http://localhost:1"
        )
      ).toThrow(AmbiguousCliInvocationError);
      expect(spawned).toEqual([]);
    });

    it("ignores a --base-url inside a quoted payload when deciding if the command is pinned", () => {
      const pinned = withLocalBaseUrl(
        `${CLI} store --entities '[{"note":"--base-url ${FAKE_REMOTE}"}]'`,
        undefined,
        "http://localhost:1"
      );
      expect(pinned).toContain(`${CLI} --base-url 'http://localhost:1' store`);
      // ...but a real flag after a quoted payload that mentions one is still checked.
      expect(() =>
        withLocalBaseUrl(
          `${CLI} store --entities '[{"note":"--base-url http://localhost:9"}]' --base-url ${FAKE_REMOTE}`,
          undefined,
          "http://localhost:1"
        )
      ).toThrow(NonLocalCliTargetError);
      // A quoted VALUE of a real flag is still read.
      expect(() =>
        withLocalBaseUrl(
          `${CLI} store --base-url "${FAKE_REMOTE}"`,
          undefined,
          "http://localhost:1"
        )
      ).toThrow(NonLocalCliTargetError);
    });

    it("the refusal message lists the same hosts as isLocalBaseUrl and gives the remote-check hint", () => {
      for (const local of ["localhost", "127.0.0.1", "::1", "0.0.0.0"]) {
        expect(isLocalBaseUrl(`http://${local === "::1" ? "[::1]" : local}:1`)).toBe(true);
      }
      try {
        assertLocalBaseUrl(FAKE_REMOTE, "NEOTOMA_BASE_URL");
        throw new Error("expected refusal");
      } catch (err) {
        const msg = String((err as Error).message);
        for (const host of ["localhost", "127.0.0.1", "::1", "0.0.0.0"])
          expect(msg).toContain(host);
        expect(msg).toMatch(
          /for a deliberate remote check, run the CLI directly outside the test suite/i
        );
      }
    });
  });

  describe("setup-file scrub (scrubNonLocalBaseUrl)", () => {
    it("deletes a fake remote URL and its token, and reports it", () => {
      const env: NodeJS.ProcessEnv = {
        NEOTOMA_BASE_URL: FAKE_REMOTE,
        NEOTOMA_BEARER_TOKEN: "fake-token-for-test",
      };
      expect(scrubNonLocalBaseUrl(env)).toBe(true);
      expect(env.NEOTOMA_BASE_URL).toBeUndefined();
      expect(env.NEOTOMA_BEARER_TOKEN).toBeUndefined();
    });

    it("keeps everything under RUN_REMOTE_TESTS=1 (in-process opt-out only)", () => {
      const env: NodeJS.ProcessEnv = { RUN_REMOTE_TESTS: "1", NEOTOMA_BASE_URL: FAKE_REMOTE };
      expect(scrubNonLocalBaseUrl(env)).toBe(false);
      expect(env.NEOTOMA_BASE_URL).toBe(FAKE_REMOTE);
    });

    it("treats an unparseable URL as non-local and leaves loopback or empty alone", () => {
      const bad: NodeJS.ProcessEnv = { NEOTOMA_BASE_URL: "not a url" };
      expect(scrubNonLocalBaseUrl(bad)).toBe(true);
      expect(bad.NEOTOMA_BASE_URL).toBeUndefined();
      const local: NodeJS.ProcessEnv = { NEOTOMA_BASE_URL: "http://127.0.0.1:3080" };
      expect(scrubNonLocalBaseUrl(local)).toBe(false);
      expect(local.NEOTOMA_BASE_URL).toBe("http://127.0.0.1:3080");
      expect(scrubNonLocalBaseUrl({})).toBe(false);
    });

    it("the warning names RUN_REMOTE_TESTS=1 and carries no URL", () => {
      expect(SCRUB_WARNING).toMatch(/RUN_REMOTE_TESTS=1/);
      expect(SCRUB_WARNING).not.toMatch(/https?:\/\//);
    });

    it("the refusal message names the .env source and the no-override rule, host only", () => {
      try {
        assertLocalBaseUrl("https://u:tok@example.invalid/t/p", "NEOTOMA_BASE_URL");
        throw new Error("expected refusal");
      } catch (err) {
        const msg = String((err as Error).message);
        expect(msg).toMatch(/always run against the local test server/);
        expect(msg).toMatch(/\.env/);
        expect(msg).toMatch(/example\.invalid/);
        expect(msg).not.toMatch(/tok|\/t\/p|u:/);
      }
    });
  });

  describe("pure helpers", () => {
    it("withLocalBaseUrl inserts the flag directly after the CLI entry point", () => {
      expect(withLocalBaseUrl(`${CLI} store --json`, undefined, "http://localhost:19080")).toBe(
        `${CLI} --base-url 'http://localhost:19080' store --json`
      );
    });

    it("keeps a quoted absolute CLI path as one argument", () => {
      expect(
        withLocalBaseUrl('node "/abs/dist/cli/index.js" api start', undefined, "http://localhost:1")
      ).toBe("node \"/abs/dist/cli/index.js\" --base-url 'http://localhost:1' api start");
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
