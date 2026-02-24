import { describe, it, expect } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const CLI_PATH = "node dist/cli/index.js";

describe("CLI stats commands", () => {
  describe("stats", () => {
    it("should return dashboard stats with --json", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} stats --json`);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("total_entities");
      expect(result).toHaveProperty("sources_count");
      expect(result).toHaveProperty("total_events");
    });

    it("should output parseable response without --json", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} stats`);
      expect(stdout).toMatch(/Summary|Entities by type|Total entities/i);
    });
  });

  describe("stats entities", () => {
    it("should return entity counts by type with --json", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} stats entities --json`);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("total_entities");
      expect(result).toHaveProperty("entities_by_type");
      expect(typeof result.total_entities).toBe("number");
      expect(typeof result.entities_by_type).toBe("object");
    });

    it("should output parseable response without --json", async () => {
      const { stdout } = await execAsync(`${CLI_PATH} stats entities`);
      expect(stdout).toMatch(/Entities by type|Total/i);
    });
  });

  describe("error handling and exit codes", () => {
    it("should return non-zero exit code for unreachable base URL", async () => {
      let exitCode = 0;
      try {
        await execAsync(`${CLI_PATH} --base-url http://127.0.0.1:1 stats --json`);
      } catch (error: any) {
        exitCode = error.code || 1;
      }
      expect(exitCode).toBeGreaterThan(0);
    });
  });
});
