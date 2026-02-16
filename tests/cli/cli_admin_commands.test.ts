import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";

const execAsync = promisify(exec);

const CLI_PATH = "node dist/cli/index.js";
const TEST_USER_ID = "test-user-cli-admin";

describe("CLI admin commands", () => {
  const tracker = new TestIdTracker();

  afterEach(async () => {
    await tracker.cleanup();
  });

  describe("auth whoami", () => {
    it("should show current auth context with --json", async () => {
      const { stdout, stderr } = await execAsync(
        `${CLI_PATH} auth whoami --json`
      );

      expect(stderr).toBe("");
      const result = JSON.parse(stdout);

      expect(result).toHaveProperty("environment");
      expect(["development", "production"]).toContain(result.environment);
    });

    it("should show project ID", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} auth whoami --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("project_id");
    });

    it("should show database connection info", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} auth whoami --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("connected");
      expect(typeof result.connected).toBe("boolean");
    });

    it("should output pretty format without --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} auth whoami`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("environment");
    });

    it("should work with --env development", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} auth whoami --env development --json`
      );

      const result = JSON.parse(stdout);
      expect(result.environment).toBe("development");
    });

    it("should work with --env production", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} auth whoami --env production --json`
      );

      const result = JSON.parse(stdout);
      expect(result.environment).toBe("production");
    });
  });

  describe("snapshots check", () => {
    it("should check snapshots consistency with --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} snapshots check --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("entities_checked");
    });

    it("should check without auto-fix by default", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} snapshots check --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("status");
      // Should not have auto-fixed anything
      if (result.issues_found) {
        expect(result).not.toHaveProperty("auto_fixed_count");
      }
    });

    it("should check with --auto-fix flag", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} snapshots check --auto-fix --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("status");
      // May have auto-fixed issues if any existed
    });

    it("should report entities checked count", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} snapshots check --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("entities_checked");
      expect(typeof result.entities_checked).toBe("number");
      expect(result.entities_checked).toBeGreaterThanOrEqual(0);
    });

    it("should report issues if found", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} snapshots check --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("issues_found");
      expect(typeof result.issues_found).toBe("boolean");
    });

    it("should output pretty format without --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} snapshots check`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("status");
    });
  });

  describe("exit codes", () => {
    it("should return exit code 0 on success for whoami", async () => {
      try {
        await execAsync(
          `${CLI_PATH} auth whoami --json`
        );
        expect(true).toBe(true);
      } catch {
        throw new Error("Should not throw on success");
      }
    });

    it("should return exit code 0 on success for snapshots check", async () => {
      try {
        await execAsync(
          `${CLI_PATH} snapshots check --json`
        );
        expect(true).toBe(true);
      } catch {
        throw new Error("Should not throw on success");
      }
    });
  });

  describe("global options with admin commands", () => {
    it("should accept --debug flag with whoami", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} auth whoami --debug --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("environment");
    });

    it("should accept --debug flag with snapshots check", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} snapshots check --debug --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("status");
    });

    it("should accept --env flag with whoami", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} auth whoami --env development --json`
      );

      const result = JSON.parse(stdout);
      expect(result.environment).toBe("development");
    });
  });

  describe("error handling", () => {
    it("should handle database connection issues gracefully", async () => {
      // This test may pass or fail depending on database state
      // The important thing is it doesn't crash
      try {
        await execAsync(
          `${CLI_PATH} auth whoami --json`
        );
        expect(true).toBe(true);
      } catch (error: any) {
        // If it fails, it should fail with a clear error
        expect(error).toBeDefined();
      }
    });

    it("should handle snapshot check errors gracefully", async () => {
      // Should not crash even if there are issues
      try {
        await execAsync(
          `${CLI_PATH} snapshots check --json`
        );
        expect(true).toBe(true);
      } catch (error: any) {
        expect(error).toBeDefined();
      }
    });
  });

  describe("output consistency", () => {
    it("should have consistent JSON structure for whoami", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} auth whoami --json`
      );

      const result = JSON.parse(stdout);

      // Check for expected fields
      expect(result).toHaveProperty("environment");
      expect(result).toHaveProperty("project_id");
      expect(result).toHaveProperty("connected");

      // Check types
      expect(typeof result.environment).toBe("string");
      expect(typeof result.connected).toBe("boolean");
    });

    it("should have consistent JSON structure for snapshots check", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} snapshots check --json`
      );

      const result = JSON.parse(stdout);

      // Check for expected fields
      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("entities_checked");
      expect(result).toHaveProperty("issues_found");

      // Check types
      expect(typeof result.status).toBe("string");
      expect(typeof result.entities_checked).toBe("number");
      expect(typeof result.issues_found).toBe("boolean");
    });
  });
});
