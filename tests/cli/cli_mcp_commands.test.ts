import { afterEach, describe, it, expect, vi } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  detectNeotomaServers,
  findMcpConfigPaths,
  inferHookHarnessesFromMcpConfigs,
  ensureAAuthKeysForSignedTransport,
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

      expect(privateJwk).toContain("\"kid\"");
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
      expect(result.message.toLowerCase()).toContain("already configured in user-level mcp configs");
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
          JSON.stringify({ mcpServers: { "neotoma-dev": entriesB["neotoma-dev"], neotoma: entriesB.neotoma } }, null, 2)
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
        expect(claudeConfig?.issues?.map((issue) => issue.type)).toContain("invalid_claude_server_id");
      } finally {
        await fs.rm(tmpRoot, { recursive: true, force: true });
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
        expect(
          serialized.includes("run_neotoma_mcp") || serialized.includes("dist/index.js")
        ).toBe(true);
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
      expect(entries["neotoma-dev"].env?.MCP_PROXY_DOWNSTREAM_URL).toBe("http://127.0.0.1:3180/mcp");
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
        await fs.writeFile(path.join(projectRoot, "package.json"), JSON.stringify({ name: "neotoma" }));
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
