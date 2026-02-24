import { describe, it, expect } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";

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
