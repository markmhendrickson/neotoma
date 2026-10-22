import { afterEach, describe, it, expect, vi } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  backupMcpConfigEntry,
  detectNeotomaServers,
  findMcpConfigPaths,
  inferHookHarnessesFromMcpConfigs,
  ensureAAuthKeysForSignedTransport,
  isDeliberateNonDevMcpEntry,
  isMcpHookHarness,
  type McpHookHarness,
  neotomaServerEntriesForTransport,
  neotomaServerEntries,
  offerInstall,
  parseInstallEnvironmentChoice,
  parseMcpTransportChoice,
  scanForMcpConfigs,
} from "../../src/cli/mcp_config_scan.ts";

const execAsync = promisify(exec);
const CLI_PATH = "node dist/cli/index.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("CLI MCP and instruction commands", () => {
  describe("mcp guide", () => {
    it("should return configuration guidance with --json", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} mcp guide --json`);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("cursor_config_path");
      expect(result).toHaveProperty("example_config");
      expect(result).toHaveProperty("steps");
      expect(Array.isArray(result.steps)).toBe(true);
    });
  });

  describe("mcp config", () => {
    it("should return scan results with --json", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} mcp config --json`);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("configs");
      expect(result).toHaveProperty("missingAny");
      expect(Array.isArray(result.configs)).toBe(true);
    });
  });

  describe("mcp check", () => {
    it("remains a deprecated alias for config with --json", async () => {
      const { stdout, stderr } = await execAsync(`${CLI_PATH} mcp check --json`);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("configs");
      expect(stderr).toMatch(/Deprecated: use `neotoma mcp config`/);
    });
  });

  describe("mcp check env choice parsing", () => {
    it("maps option 3 to both", () => {
      expect(parseInstallEnvironmentChoice("3")).toBe("both");
      expect(parseInstallEnvironmentChoice("both")).toBe("both");
    });
  });

  describe("mcp transport choice parsing", () => {
    it("defaults to transport preset b", () => {
      expect(parseMcpTransportChoice("")).toBe("b");
      expect(parseMcpTransportChoice("1")).toBe("a");
      expect(parseMcpTransportChoice("a")).toBe("a");
    });

    it("maps transport aliases to A-D modes", () => {
      expect(parseMcpTransportChoice("dev-shim")).toBe("b");
      expect(parseMcpTransportChoice("direct")).toBe("c");
      expect(parseMcpTransportChoice("prod-parity")).toBe("d");
    });
  });

  describe("signed transport key setup", () => {
    it("generates AAuth keys for signed transports when missing", async () => {
      const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-aauth-home-"));
      vi.stubEnv("HOME", tmpHome);

      await ensureAAuthKeysForSignedTransport("a", true);
      const privateJwk = await fs.readFile(
        path.join(tmpHome, ".neotoma", "aauth", "private.jwk"),
        "utf-8"
      );

      expect(privateJwk).toContain('"kid"');
      await expect(ensureAAuthKeysForSignedTransport("a", true)).resolves.toBeUndefined();
    });
  });

  describe("mcp install scope handling", () => {
    it("does not report user scope as already configured from project-only paths", async () => {
      const projectOnlyConfig = [
        {
          path: "/tmp/example-project/.cursor/mcp.json",
          hasDev: false,
          hasProd: true,
        },
      ];
      const result = await offerInstall(projectOnlyConfig, process.cwd(), {
        silent: true,
        autoInstallScope: "user",
        autoInstallEnv: "prod",
      });
      expect(result.installed).toBe(false);
      expect(result.message.toLowerCase()).not.toContain("already configured");
    });

    it("reports already-configured with explicit user scope context", async () => {
      const userConfig = [
        {
          path: `${process.env.HOME ?? "/tmp"}/.cursor/mcp.json`,
          hasDev: false,
          hasProd: true,
        },
      ];
      const result = await offerInstall(userConfig, process.cwd(), {
        silent: false,
        autoInstallScope: "user",
        autoInstallEnv: "prod",
      });
      expect(result.installed).toBe(false);
      expect(result.message.toLowerCase()).toContain(
        "already configured in user-level mcp configs"
      );
    });

    it("rewrites existing Cursor user mcp.json when rewriteExistingNeotoma and transport are set", async () => {
      const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-mcp-rewrite-home-"));
      const cursorConfigPath = path.join(tmpHome, ".cursor", "mcp.json");
      const originalHome = process.env.HOME;
      try {
        process.env.HOME = tmpHome;
        await fs.mkdir(path.dirname(cursorConfigPath), { recursive: true });
        const entriesB = neotomaServerEntriesForTransport(process.cwd(), undefined, "b");
        await fs.writeFile(
          cursorConfigPath,
          JSON.stringify(
            { mcpServers: { "neotoma-dev": entriesB["neotoma-dev"], neotoma: entriesB.neotoma } },
            null,
            2
          )
        );

        const result = await offerInstall(
          [{ path: cursorConfigPath, hasDev: true, hasProd: true }],
          process.cwd(),
          {
            silent: true,
            rewriteExistingNeotoma: true,
            autoInstallScope: "user",
            autoInstallEnv: "both",
            mcpTransport: "d",
            skipProjectSync: true,
          }
        );

        expect(result.installed).toBe(true);
        const parsed = JSON.parse(await fs.readFile(cursorConfigPath, "utf-8")) as {
          mcpServers?: Record<string, { env?: Record<string, string> }>;
        };
        expect(parsed.mcpServers?.["neotoma-dev"]?.env?.MCP_PROXY_DOWNSTREAM_URL).toBe(
          "http://127.0.0.1:3180/mcp"
        );
        expect(parsed.mcpServers?.neotoma?.env?.MCP_PROXY_DOWNSTREAM_URL).toBe(
          "http://127.0.0.1:3180/mcp"
        );
      } finally {
        if (originalHome === undefined) {
          delete process.env.HOME;
        } else {
          process.env.HOME = originalHome;
        }
        await fs.rm(tmpHome, { recursive: true, force: true });
      }
    });

    it("uses Claude Desktop compliant server ids when adding missing servers", async () => {
      const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-mcp-claude-install-"));
      const claudeConfigPath = path.join(tmpRoot, "Claude", "claude_desktop_config.json");
      try {
        await fs.mkdir(path.dirname(claudeConfigPath), { recursive: true });
        await fs.writeFile(claudeConfigPath, JSON.stringify({ mcpServers: {} }, null, 2));

        const result = await offerInstall(
          [{ path: claudeConfigPath, hasDev: false, hasProd: false }],
          process.cwd(),
          {
            silent: false,
            autoInstallScope: "both",
            autoInstallEnv: "both",
            skipProjectSync: true,
          }
        );

        expect(result.installed).toBe(true);
        const parsed = JSON.parse(await fs.readFile(claudeConfigPath, "utf-8")) as {
          mcpServers?: Record<string, unknown>;
        };
        expect(parsed.mcpServers?.mcpsrv_neotoma_dev).toBeDefined();
        expect(parsed.mcpServers?.mcpsrv_neotoma).toBeDefined();
        expect(parsed.mcpServers?.["neotoma-dev"]).toBeUndefined();
        expect(parsed.mcpServers?.neotoma).toBeUndefined();
      } finally {
        await fs.rm(tmpRoot, { recursive: true, force: true });
      }
    });

    it("reports legacy Claude Desktop Neotoma ids as repairable issues", async () => {
      const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-mcp-claude-scan-"));
      const claudeConfigPath = path.join(tmpRoot, "claude_desktop_config.json");
      try {
        await fs.writeFile(
          claudeConfigPath,
          JSON.stringify(
            {
              mcpServers: {
                "neotoma-dev": { url: "http://localhost:3080/mcp" },
                neotoma: { url: "http://localhost:3180/mcp" },
              },
            },
            null,
            2
          )
        );

        const { configs } = await scanForMcpConfigs(tmpRoot, {
          neotomaRepoRoot: tmpRoot,
        });
        const realClaudeConfigPath = await fs.realpath(claudeConfigPath);
        const claudeConfig = configs.find((config) => config.path === realClaudeConfigPath);
        expect(claudeConfig?.hasDev).toBe(true);
        expect(claudeConfig?.hasProd).toBe(true);
        expect(claudeConfig?.issues?.map((issue) => issue.type)).toContain(
          "invalid_claude_server_id"
        );
      } finally {
        await fs.rm(tmpRoot, { recursive: true, force: true });
      }
    });
  });

  describe("deliberate non-dev entry detection (isDeliberateNonDevMcpEntry)", () => {
    it("flags a hosted wrapper command outside any neotoma checkout", () => {
      expect(
        isDeliberateNonDevMcpEntry({ command: "/x/run_neotoma_mcp_hosted.sh", args: ["--aauth"] })
      ).toBe(true);
    });

    it("flags an entry carrying --aauth in args even with a neotoma-looking command", () => {
      expect(
        isDeliberateNonDevMcpEntry({
          command: "/some/checkout/scripts/run_neotoma_mcp_stdio_dev_shim.sh",
          args: ["--aauth"],
        })
      ).toBe(true);
    });

    it("flags an entry with an AAuth-related env key regardless of casing", () => {
      expect(
        isDeliberateNonDevMcpEntry({
          command: "/x/run_neotoma_mcp_hosted.sh",
          env: { NEOTOMA_Aauth_Key_Id: "kid" },
        })
      ).toBe(true);
    });

    it("does not flag a plain Neotoma dev-shim entry", () => {
      expect(
        isDeliberateNonDevMcpEntry({
          command: "/some/checkout/scripts/run_neotoma_mcp_stdio_dev_shim.sh",
          env: { NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE: "dev" },
        })
      ).toBe(false);
    });

    it("does not flag a node dist/index.js launcher entry", () => {
      expect(
        isDeliberateNonDevMcpEntry({
          command: "node",
          args: ["/some/checkout/dist/index.js"],
        })
      ).toBe(false);
    });

    // Regression coverage for neotoma#2516 round-2 review (security lens): the
    // first cut of this classifier only inspected `command`/`args`/`env` and
    // unconditionally returned false for any entry with no `command` — so a
    // hosted URL-transport entry (a `url` or `serverUrl` key, with or without
    // auth `headers`) was still silently clobbered. Same incident as the
    // command-transport case, different transport shape.

    it("flags a url-transport entry pointing at a non-Neotoma host", () => {
      expect(isDeliberateNonDevMcpEntry({ url: "https://hosted.example.com/mcp" })).toBe(true);
    });

    it("flags a serverUrl-transport entry pointing at a non-Neotoma host", () => {
      expect(isDeliberateNonDevMcpEntry({ serverUrl: "https://hosted.example.com/mcp" })).toBe(
        true
      );
    });

    it("flags a url entry carrying its own auth headers even if the URL looks local", () => {
      expect(
        isDeliberateNonDevMcpEntry({
          url: "http://127.0.0.1:3180/mcp",
          headers: { Authorization: "Bearer super-secret-token" },
        })
      ).toBe(true);
    });

    it("flags a headers-only signal regardless of which URL field carries it", () => {
      expect(
        isDeliberateNonDevMcpEntry({
          serverUrl: "https://neotoma.fly.dev/mcp",
          headers: { "X-Api-Key": "k" },
        })
      ).toBe(true);
    });

    it("does not flag a plain local loopback dev URL (mirrors detectNeotomaServers)", () => {
      expect(isDeliberateNonDevMcpEntry({ url: "http://127.0.0.1:3080/mcp" })).toBe(false);
      expect(isDeliberateNonDevMcpEntry({ url: "http://localhost:3180/mcp" })).toBe(false);
    });

    it("does not flag the hosted Fly production URL with no headers (mirrors detectNeotomaServers)", () => {
      expect(isDeliberateNonDevMcpEntry({ url: "https://neotoma.fly.dev/mcp" })).toBe(false);
    });
  });

  describe("offerInstall refuses to silently clobber a deliberate non-dev entry", () => {
    // Regression coverage for the incident this guards against: a user-level
    // ~/.cursor/mcp.json `neotoma` entry configured by hand for AAuth signing
    // (hosted wrapper command + --aauth + AAuth env keys) was repeatedly
    // overwritten with an unsigned worktree dev shim, dropping AAuth signing,
    // across three separate worktrees. Each case below asserts the entry
    // survives unless a live interactive "yes" specifically authorizes the
    // replacement — assumeYes/non-TTY defaults must never count as consent.

    async function writeDeliberateAAuthConfig(configPath: string): Promise<{
      command: string;
      args: string[];
      env: Record<string, string>;
    }> {
      const deliberateEntry = {
        command: "/x/run_neotoma_mcp_hosted.sh",
        args: ["--aauth"],
        env: {
          NEOTOMA_AAUTH_KEY_ID: "fake-kid",
          NEOTOMA_AAUTH_PRIVATE_KEY_PATH: "/x/private.jwk",
        },
      };
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(
        configPath,
        JSON.stringify({ mcpServers: { neotoma: deliberateEntry } }, null, 2)
      );
      return deliberateEntry;
    }

    it("does not overwrite a deliberate AAuth entry when assumeYes is set (non-interactive)", async () => {
      // HOME must actually point at tmpHome: offerInstall's user-scope filtering
      // (isKnownUserLevelConfig) and its "create new config" fallback both resolve
      // the target path from os.homedir(), which reads process.env.HOME on every
      // call. Without this override, a prior version of this test passed
      // vacuously — it asserted against a file offerInstall never touched, while
      // the code under test wrote (or would have written) the REAL
      // ~/.cursor/mcp.json instead. That gap is exactly how a test can look like
      // coverage for a fix while never exercising the bug.
      const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-mcp-aauth-guard-"));
      const cursorConfigPath = path.join(tmpHome, ".cursor", "mcp.json");
      const originalHome = process.env.HOME;
      try {
        process.env.HOME = tmpHome;
        const deliberateEntry = await writeDeliberateAAuthConfig(cursorConfigPath);

        const result = await offerInstall(
          [{ path: cursorConfigPath, hasDev: false, hasProd: false }],
          /* repoRoot */ process.cwd(),
          {
            silent: false,
            // This is exactly the incident's mechanism: assumeYes (or a non-TTY
            // default) must never be read as consent to replace a deliberate entry.
            assumeYes: true,
            autoInstallScope: "user",
            autoInstallEnv: "prod",
            skipProjectSync: true,
          }
        );

        // The install may still report success (e.g. it can add a missing
        // neotoma-dev slot), but the existing deliberate `neotoma` entry itself
        // must be byte-for-byte unchanged.
        void result;
        const parsed = JSON.parse(await fs.readFile(cursorConfigPath, "utf-8")) as {
          mcpServers?: Record<string, unknown>;
        };
        expect(parsed.mcpServers?.neotoma).toEqual(deliberateEntry);
      } finally {
        if (originalHome === undefined) {
          delete process.env.HOME;
        } else {
          process.env.HOME = originalHome;
        }
        await fs.rm(tmpHome, { recursive: true, force: true });
      }
    });

    it("does not overwrite a deliberate AAuth entry under rewriteExistingNeotoma + assumeYes", async () => {
      const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-mcp-aauth-guard-rewrite-"));
      const cursorConfigPath = path.join(tmpHome, ".cursor", "mcp.json");
      const originalHome = process.env.HOME;
      try {
        process.env.HOME = tmpHome;
        const deliberateEntry = await writeDeliberateAAuthConfig(cursorConfigPath);

        await offerInstall(
          [{ path: cursorConfigPath, hasDev: false, hasProd: true }],
          process.cwd(),
          {
            silent: false,
            assumeYes: true,
            rewriteExistingNeotoma: true,
            autoInstallScope: "user",
            autoInstallEnv: "both",
            mcpTransport: "b",
            skipProjectSync: true,
          }
        );

        const parsed = JSON.parse(await fs.readFile(cursorConfigPath, "utf-8")) as {
          mcpServers?: Record<string, unknown>;
        };
        expect(parsed.mcpServers?.neotoma).toEqual(deliberateEntry);
      } finally {
        if (originalHome === undefined) {
          delete process.env.HOME;
        } else {
          process.env.HOME = originalHome;
        }
        await fs.rm(tmpHome, { recursive: true, force: true });
      }
    });

    it("does not leave a backup file when a replacement was refused (no confirmation given)", async () => {
      // A backup must only ever accompany an ACTUAL, confirmed overwrite —
      // never appear on its own when nothing was replaced. Complements the
      // positive check below (backupMcpConfigEntry writes real content when
      // called) by proving offerInstall doesn't call it on the refused path.
      const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-mcp-aauth-guard-backup-"));
      const cursorConfigPath = path.join(tmpHome, ".cursor", "mcp.json");
      const originalHome = process.env.HOME;
      try {
        process.env.HOME = tmpHome;
        await writeDeliberateAAuthConfig(cursorConfigPath);

        await offerInstall(
          [{ path: cursorConfigPath, hasDev: false, hasProd: false }],
          process.cwd(),
          {
            silent: false,
            assumeYes: true,
            autoInstallScope: "user",
            autoInstallEnv: "prod",
            skipProjectSync: true,
          }
        );

        const siblingFiles = await fs.readdir(path.dirname(cursorConfigPath));
        const backupFiles = siblingFiles.filter((f) => f.includes(".bak.json"));
        expect(backupFiles).toEqual([]);
      } finally {
        if (originalHome === undefined) {
          delete process.env.HOME;
        } else {
          process.env.HOME = originalHome;
        }
        await fs.rm(tmpHome, { recursive: true, force: true });
      }
    });

    it("backupMcpConfigEntry writes the existing entry's content to a sibling file", async () => {
      // Direct, non-vacuous test of the backup mechanism itself (offerInstall
      // can only be driven to the confirmed-overwrite branch by a live TTY
      // answering "y", which a unit test cannot simulate — so this tests the
      // helper offerInstall calls on that branch directly, exactly as the task
      // requires: "the existing entry must be backed up first").
      const tmpHome = await fs.mkdtemp(
        path.join(os.tmpdir(), "neotoma-mcp-aauth-guard-backup-direct-")
      );
      const cursorConfigPath = path.join(tmpHome, ".cursor", "mcp.json");
      try {
        const deliberateEntry = await writeDeliberateAAuthConfig(cursorConfigPath);

        const backupPath = await backupMcpConfigEntry(cursorConfigPath, "neotoma", deliberateEntry);

        expect(path.dirname(backupPath)).toBe(path.dirname(cursorConfigPath));
        expect(path.basename(backupPath)).toMatch(/\.bak\.json$/);
        const backedUp = JSON.parse(await fs.readFile(backupPath, "utf-8")) as {
          neotoma?: unknown;
        };
        expect(backedUp.neotoma).toEqual(deliberateEntry);
      } finally {
        await fs.rm(tmpHome, { recursive: true, force: true });
      }
    });

    it("still installs into a genuinely missing slot alongside an untouched deliberate entry", async () => {
      // The guard must not become a blanket refusal: adding neotoma-dev when it
      // does not exist yet must still work even though `neotoma` is deliberate.
      // autoInstallScope: "user" filters by isKnownUserLevelConfig, which compares
      // against os.homedir() — so HOME must actually point at tmpHome for the
      // config to be recognized as the canonical user-level Cursor path.
      const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-mcp-aauth-guard-addslot-"));
      const cursorConfigPath = path.join(tmpHome, ".cursor", "mcp.json");
      const originalHome = process.env.HOME;
      try {
        process.env.HOME = tmpHome;
        const deliberateEntry = await writeDeliberateAAuthConfig(cursorConfigPath);

        const result = await offerInstall(
          [{ path: cursorConfigPath, hasDev: false, hasProd: false }],
          process.cwd(),
          {
            silent: false,
            assumeYes: true,
            autoInstallScope: "user",
            autoInstallEnv: "both",
            skipProjectSync: true,
          }
        );

        expect(result.installed).toBe(true);
        const parsed = JSON.parse(await fs.readFile(cursorConfigPath, "utf-8")) as {
          mcpServers?: Record<string, unknown>;
        };
        // Existing deliberate entry untouched...
        expect(parsed.mcpServers?.neotoma).toEqual(deliberateEntry);
        // ...but the missing dev slot was still filled in.
        expect(parsed.mcpServers?.["neotoma-dev"]).toBeDefined();
      } finally {
        if (originalHome === undefined) {
          delete process.env.HOME;
        } else {
          process.env.HOME = originalHome;
        }
        await fs.rm(tmpHome, { recursive: true, force: true });
      }
    });

    // Regression coverage for neotoma#2516 round-2 review: the same clobber,
    // reproduced end-to-end through offerInstall for a URL-transport entry
    // instead of a command-transport one. Before the fix, isDeliberateNonDevMcpEntry
    // returned false for any entry with no `command` field, so this entry was
    // reported as "missing" (detectNeotomaServers only recognizes loopback/Fly
    // URLs as configured) and offerInstall replaced it unconditionally.

    async function writeDeliberateUrlConfig(configPath: string): Promise<{
      url: string;
      headers: Record<string, string>;
    }> {
      const deliberateEntry = {
        url: "https://hosted.example.com/mcp",
        headers: { Authorization: "Bearer fake-hosted-token" },
      };
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(
        configPath,
        JSON.stringify({ mcpServers: { neotoma: deliberateEntry } }, null, 2)
      );
      return deliberateEntry;
    }

    it("does not overwrite a deliberate url-transport entry when assumeYes is set (non-interactive)", async () => {
      const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-mcp-url-guard-"));
      const cursorConfigPath = path.join(tmpHome, ".cursor", "mcp.json");
      const originalHome = process.env.HOME;
      try {
        process.env.HOME = tmpHome;
        const deliberateEntry = await writeDeliberateUrlConfig(cursorConfigPath);

        await offerInstall(
          [{ path: cursorConfigPath, hasDev: false, hasProd: false }],
          process.cwd(),
          {
            silent: false,
            assumeYes: true,
            autoInstallScope: "user",
            autoInstallEnv: "prod",
            skipProjectSync: true,
          }
        );

        const parsed = JSON.parse(await fs.readFile(cursorConfigPath, "utf-8")) as {
          mcpServers?: Record<string, unknown>;
        };
        expect(parsed.mcpServers?.neotoma).toEqual(deliberateEntry);
      } finally {
        if (originalHome === undefined) {
          delete process.env.HOME;
        } else {
          process.env.HOME = originalHome;
        }
        await fs.rm(tmpHome, { recursive: true, force: true });
      }
    });

    it("does not overwrite a deliberate serverUrl-only entry (no headers) when assumeYes is set", async () => {
      // Covers the url field variant with no headers at all — the URL alone,
      // pointing at a non-Neotoma host, must be enough to qualify as deliberate.
      const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-mcp-serverurl-guard-"));
      const cursorConfigPath = path.join(tmpHome, ".cursor", "mcp.json");
      const originalHome = process.env.HOME;
      try {
        process.env.HOME = tmpHome;
        const deliberateEntry = { serverUrl: "https://hosted.example.com/mcp" };
        await fs.mkdir(path.dirname(cursorConfigPath), { recursive: true });
        await fs.writeFile(
          cursorConfigPath,
          JSON.stringify({ mcpServers: { neotoma: deliberateEntry } }, null, 2)
        );

        await offerInstall(
          [{ path: cursorConfigPath, hasDev: false, hasProd: false }],
          process.cwd(),
          {
            silent: false,
            assumeYes: true,
            autoInstallScope: "user",
            autoInstallEnv: "prod",
            skipProjectSync: true,
          }
        );

        const parsed = JSON.parse(await fs.readFile(cursorConfigPath, "utf-8")) as {
          mcpServers?: Record<string, unknown>;
        };
        expect(parsed.mcpServers?.neotoma).toEqual(deliberateEntry);
      } finally {
        if (originalHome === undefined) {
          delete process.env.HOME;
        } else {
          process.env.HOME = originalHome;
        }
        await fs.rm(tmpHome, { recursive: true, force: true });
      }
    });
  });

  describe("global install (no source checkout) claude-code project .mcp.json", () => {
    it("writes a project-root .mcp.json pointing at the installed CLI when repoRoot is null", async () => {
      // Simulates a global npm install: findRepoRoot(cwd) returns null (no neotoma
      // package.json above the user's project). Previously offerInstall bailed with
      // "source root not found" and wrote nothing. It must now fall back to the
      // installed CLI root and create <project>/.mcp.json for Claude Code.
      const tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-global-install-cc-"));
      try {
        // Give the scratch dir a project marker so getProjectRoot resolves to it.
        await fs.writeFile(
          path.join(tmpProject, "package.json"),
          JSON.stringify({ name: "some-user-app", version: "1.0.0" }, null, 2)
        );

        const result = await offerInstall([], /* repoRoot */ null, {
          silent: false,
          cwd: tmpProject,
          autoInstallScope: "project",
          autoInstallEnv: "both",
          harness: "claude-code",
          skipProjectSync: true,
        });

        expect(result.installed).toBe(true);
        const mcpJsonPath = path.join(tmpProject, ".mcp.json");
        expect(result.updatedPaths).toContain(mcpJsonPath);
        const parsed = JSON.parse(await fs.readFile(mcpJsonPath, "utf-8")) as {
          mcpServers?: Record<string, { command?: string; args?: string[] }>;
        };
        // Both dev and prod neotoma servers should be present and launchable
        // (either script shims or a node dist/index.js entrypoint from the install root).
        expect(parsed.mcpServers?.["neotoma-dev"]).toBeDefined();
        expect(parsed.mcpServers?.neotoma).toBeDefined();
        const prod = parsed.mcpServers?.neotoma;
        const serialized = JSON.stringify(prod);
        // The launcher must be a real Neotoma stdio entrypoint from the install root
        // (a run_neotoma_mcp_*.sh shim, or a node dist/index.js for a built package),
        // never a stale/empty path — this is the whole point of the global-install fix.
        expect(serialized.includes("run_neotoma_mcp") || serialized.includes("dist/index.js")).toBe(
          true
        );
      } finally {
        await fs.rm(tmpProject, { recursive: true, force: true });
      }
    });

    it("does not bail with 'source root not found' for a resolvable install", async () => {
      const tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-global-install-msg-"));
      try {
        await fs.writeFile(
          path.join(tmpProject, "package.json"),
          JSON.stringify({ name: "some-user-app", version: "1.0.0" }, null, 2)
        );
        const result = await offerInstall([], /* repoRoot */ null, {
          silent: true,
          cwd: tmpProject,
          autoInstallScope: "project",
          autoInstallEnv: "both",
          harness: "claude-code",
          skipProjectSync: true,
        });
        expect(result.message.toLowerCase()).not.toContain("source root not found");
      } finally {
        await fs.rm(tmpProject, { recursive: true, force: true });
      }
    });

    it("falls back to .cursor/mcp.json for an unsupported harness value", async () => {
      // A caller that bypasses toHookHarness's narrowing (e.g. a future harness id, or an
      // untyped/externally-sourced string) must not be treated as "claude-code" by offerInstall.
      // isMcpHookHarness rejects it and the project-level default (.cursor/mcp.json) is used —
      // this documents and locks in that runtime fallback behavior.
      const tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-unsupported-harness-"));
      try {
        await fs.writeFile(
          path.join(tmpProject, "package.json"),
          JSON.stringify({ name: "some-user-app", version: "1.0.0" }, null, 2)
        );

        const result = await offerInstall([], /* repoRoot */ null, {
          silent: false,
          cwd: tmpProject,
          autoInstallScope: "project",
          autoInstallEnv: "both",
          // Cast: "vscode" is not a valid McpHookHarness. This exercises the runtime guard
          // that protects offerInstall from an untyped caller passing an unsupported value.
          harness: "vscode" as unknown as McpHookHarness,
          skipProjectSync: true,
        });

        expect(result.installed).toBe(true);
        const cursorMcpPath = path.join(tmpProject, ".cursor", "mcp.json");
        const rootMcpPath = path.join(tmpProject, ".mcp.json");
        expect(result.updatedPaths).toContain(cursorMcpPath);
        expect(result.updatedPaths).not.toContain(rootMcpPath);
        await expect(fs.access(rootMcpPath)).rejects.toThrow();
        const parsed = JSON.parse(await fs.readFile(cursorMcpPath, "utf-8")) as {
          mcpServers?: Record<string, unknown>;
        };
        expect(parsed.mcpServers?.["neotoma-dev"]).toBeDefined();
        expect(parsed.mcpServers?.neotoma).toBeDefined();
      } finally {
        await fs.rm(tmpProject, { recursive: true, force: true });
      }
    });
  });

  describe("isMcpHookHarness", () => {
    it("accepts only the supported McpHookHarness values", () => {
      expect(isMcpHookHarness("claude-code")).toBe(true);
      expect(isMcpHookHarness("cursor")).toBe(true);
      expect(isMcpHookHarness("codex")).toBe(true);
    });

    it("rejects unsupported or malformed values", () => {
      expect(isMcpHookHarness("vscode")).toBe(false);
      expect(isMcpHookHarness("")).toBe(false);
      expect(isMcpHookHarness(undefined)).toBe(false);
      expect(isMcpHookHarness(null)).toBe(false);
      expect(isMcpHookHarness(123)).toBe(false);
    });
  });

  describe("mcp hook harness inference", () => {
    it("infers hook-capable harnesses only from configured Neotoma MCP paths", () => {
      const result = inferHookHarnessesFromMcpConfigs([
        {
          path: "/tmp/project/.cursor/mcp.json",
          hasDev: true,
          hasProd: false,
        },
        {
          path: `${process.env.HOME ?? "/tmp"}/.codex/config.toml`,
          hasDev: false,
          hasProd: true,
        },
        {
          path: `${process.env.HOME ?? "/tmp"}/Library/Application Support/Claude/claude_desktop_config.json`,
          hasDev: false,
          hasProd: false,
        },
        {
          path: "/tmp/project/.mcp.json",
          hasDev: true,
          hasProd: true,
        },
      ]);

      expect(result).toEqual(["cursor", "codex"]);
    });
  });

  describe("mcp server script path resolution", () => {
    it("prefers installed CLI script root over stale repo root path", () => {
      const staleRoot = path.join(os.tmpdir(), "neotoma-stale-root");
      const entries = neotomaServerEntries(staleRoot);
      const expectedRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

      expect("command" in entries.neotoma).toBe(true);
      if (!("command" in entries.neotoma)) return;

      expect(entries.neotoma.command).toBe(
        path.join(expectedRoot, "scripts", "run_neotoma_mcp_stdio_prod.sh")
      );
      expect(entries.neotoma.command.startsWith(staleRoot)).toBe(false);
    });

    it("builds signed dev-shim entries for transport A", () => {
      const entries = neotomaServerEntriesForTransport(process.cwd(), undefined, "a");
      expect("command" in entries["neotoma-dev"]).toBe(true);
      if (!("command" in entries["neotoma-dev"])) return;
      expect(entries["neotoma-dev"].command).toContain("run_neotoma_mcp_signed_stdio_dev_shim.sh");
      expect(entries["neotoma-dev"].env?.NEOTOMA_MCP_USE_LOCAL_PORT_FILE).toBe("1");
      expect(entries["neotoma-dev"].env?.NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE).toBe("dev");
      expect("command" in entries.neotoma).toBe(true);
      if (!("command" in entries.neotoma)) return;
      expect(entries.neotoma.env?.NEOTOMA_MCP_USE_LOCAL_PORT_FILE).toBe("1");
      expect(entries.neotoma.env?.MCP_PROXY_DOWNSTREAM_URL).toBe("http://127.0.0.1:3180/mcp");
      expect(entries.neotoma.env?.NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE).toBe("prod");
    });

    it("builds prod data-plane override entries for transport D", () => {
      const entries = neotomaServerEntriesForTransport(process.cwd(), undefined, "d");
      expect("command" in entries["neotoma-dev"]).toBe(true);
      if (!("command" in entries["neotoma-dev"])) return;
      expect(entries["neotoma-dev"].env?.NEOTOMA_MCP_USE_LOCAL_PORT_FILE).toBe("1");
      expect(entries["neotoma-dev"].env?.MCP_PROXY_DOWNSTREAM_URL).toBe(
        "http://127.0.0.1:3180/mcp"
      );
      expect(entries.neotoma.env?.NEOTOMA_MCP_USE_LOCAL_PORT_FILE).toBe("1");
      expect(entries.neotoma.env?.MCP_PROXY_DOWNSTREAM_URL).toBe("http://127.0.0.1:3180/mcp");
    });
  });

  describe("mcp server detection for dist entrypoint configs", () => {
    it("recognizes the stable dev shim wrapper as a dev server", () => {
      const config = {
        "neotoma-dev": {
          command: "/opt/neotoma/scripts/run_neotoma_mcp_stdio_dev_shim.sh",
        },
      };
      const result = detectNeotomaServers(config);
      expect(result.hasDev).toBe(true);
      expect(result.hasProd).toBe(false);
    });

    it("recognizes the signed dev shim wrapper as a dev server", () => {
      const config = {
        "neotoma-dev": {
          command: "/opt/neotoma/scripts/run_neotoma_mcp_signed_stdio_dev_shim.sh",
        },
      };
      const result = detectNeotomaServers(config);
      expect(result.hasDev).toBe(true);
      expect(result.hasProd).toBe(false);
    });

    it("recognizes prod server when NEOTOMA_ENV is production", () => {
      const config = {
        neotoma: {
          command: process.execPath,
          args: ["/opt/neotoma/dist/index.js"],
          env: { NEOTOMA_ENV: "production" },
        },
      };
      const result = detectNeotomaServers(config);
      expect(result.hasProd).toBe(true);
      expect(result.hasDev).toBe(false);
    });
  });

  describe("mcp scan precedence", () => {
    it("prefers project-level config paths before user-level paths", async () => {
      const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "neotoma-mcp-precedence-"));
      const projectRoot = path.join(tmpRoot, "repo");
      const userHome = path.join(tmpRoot, "home");
      const projectCursorConfig = path.join(projectRoot, ".cursor", "mcp.json");
      const userCursorConfig = path.join(userHome, ".cursor", "mcp.json");

      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;

      try {
        await fs.mkdir(path.dirname(projectCursorConfig), { recursive: true });
        await fs.mkdir(path.dirname(userCursorConfig), { recursive: true });
        await fs.writeFile(
          path.join(projectRoot, "package.json"),
          JSON.stringify({ name: "neotoma" })
        );
        await fs.writeFile(projectCursorConfig, JSON.stringify({ mcpServers: {} }));
        await fs.writeFile(userCursorConfig, JSON.stringify({ mcpServers: {} }));

        process.env.HOME = userHome;
        process.env.USERPROFILE = userHome;

        const paths = await findMcpConfigPaths(projectRoot, {
          includeUserLevel: true,
          userLevelFirst: false,
          maxDepth: 0,
        });
        const projectCursorConfigReal = await fs.realpath(projectCursorConfig);
        const userCursorConfigReal = await fs.realpath(userCursorConfig);
        const projectIndex = paths.indexOf(projectCursorConfigReal);
        const userIndex = paths.indexOf(userCursorConfigReal);

        expect(projectIndex).toBeGreaterThanOrEqual(0);
        expect(userIndex).toBeGreaterThanOrEqual(0);
        expect(projectIndex).toBeLessThan(userIndex);
      } finally {
        if (originalHome === undefined) {
          delete process.env.HOME;
        } else {
          process.env.HOME = originalHome;
        }
        if (originalUserProfile === undefined) {
          delete process.env.USERPROFILE;
        } else {
          process.env.USERPROFILE = originalUserProfile;
        }
        await fs.rm(tmpRoot, { recursive: true, force: true });
      }
    });
  });

  describe("cli guide", () => {
    it("should return instruction path guidance with --json", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} cli guide --json`);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("message");
      expect(result).toHaveProperty("project_applied_paths");
      expect(result).toHaveProperty("instruction_source");
      expect(result).toHaveProperty("canonical_behavioral_instructions");
      expect(result.canonical_behavioral_instructions).toContain("neotoma instructions print");
      expect(result).toHaveProperty("run_config");
    });
  });

  describe("instructions print", () => {
    it("prints MCP fenced body as plain text", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} instructions print`);
      expect(stdout).toMatch(/\[TURN LIFECYCLE\]/);
      expect(stdout).toContain("**`store`**");
    });

    it("supports --json", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} --json instructions print`);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("body");
      expect(result.body).toMatch(/\[TURN LIFECYCLE\]/);
      expect(result).toHaveProperty("path");
    });
  });

  describe("cli-instructions check", () => {
    it("should return check results with --json", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} cli-instructions check --json --yes`);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("applied");
      expect(result).toHaveProperty("missing_in_applied");
      expect(result).toHaveProperty("project");
      expect(Array.isArray(result.project)).toBe(true);
    });
  });
});
