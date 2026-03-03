import { describe, it, expect } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  detectNeotomaServers,
  findMcpConfigPaths,
  neotomaServerEntries,
  offerInstall,
  parseInstallEnvironmentChoice,
} from "../../src/cli/mcp_config_scan.ts";

const execAsync = promisify(exec);
const CLI_PATH = "node dist/cli/index.js";

describe("CLI MCP and instruction commands", () => {
  describe("mcp config", () => {
    it("should return configuration guidance with --json", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} mcp config --json`);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("cursor_config_path");
      expect(result).toHaveProperty("example_config");
      expect(result).toHaveProperty("steps");
      expect(Array.isArray(result.steps)).toBe(true);
    });
  });

  describe("mcp check", () => {
    it("should return scan results with --json", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} mcp check --json`);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("configs");
      expect(result).toHaveProperty("missingAny");
      expect(Array.isArray(result.configs)).toBe(true);
    });
  });

  describe("mcp check env choice parsing", () => {
    it("maps option 3 to both", () => {
      expect(parseInstallEnvironmentChoice("3")).toBe("both");
      expect(parseInstallEnvironmentChoice("both")).toBe("both");
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
  });

  describe("mcp server detection for dist entrypoint configs", () => {
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

  describe("cli-instructions config", () => {
    it("should return instruction path guidance with --json", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} cli-instructions config --json`);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("message");
      expect(result).toHaveProperty("project_applied_paths");
      expect(result).toHaveProperty("instruction_source");
      expect(result).toHaveProperty("run_check");
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
