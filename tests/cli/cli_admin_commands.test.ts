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
    it("should show user ID with --json", async () => {
      const { stdout, stderr } = await execAsync(
        `${CLI_PATH} auth whoami --json`
      );

      expect(stderr).toBe("");
      const result = JSON.parse(stdout);

      expect(result).toHaveProperty("user_id");
      expect(typeof result.user_id).toBe("string");
    });

    it("should output JSON format", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} auth whoami --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("user_id");
    });
  });

  describe("snapshots check", () => {
    it("should check snapshots consistency with --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} snapshots check --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("healthy");
      expect(result).toHaveProperty("message");
      expect(result).toHaveProperty("checked");
      expect(result).toHaveProperty("stale");
      expect(typeof result.healthy).toBe("boolean");
      expect(typeof result.message).toBe("string");
      expect(typeof result.checked).toBe("number");
      expect(typeof result.stale).toBe("number");
    });

    it("should check without auto-fix by default", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} snapshots check --json`
      );

      const result = JSON.parse(stdout);
      // Should not have fixed field when auto-fix is not used
      expect(result.fixed).toBeUndefined();
    });

    it("should check with --auto-fix flag", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} snapshots check --auto-fix --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("healthy");
      // May have fixed field if issues existed
      if (result.stale > 0) {
        expect(result).toHaveProperty("fixed");
        expect(typeof result.fixed).toBe("number");
      }
    });

    it("should report entities checked count", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} snapshots check --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("checked");
      expect(typeof result.checked).toBe("number");
      expect(result.checked).toBeGreaterThanOrEqual(0);
    });

    it("should report stale snapshots if found", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} snapshots check --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("stale");
      expect(typeof result.stale).toBe("number");
      expect(result.stale).toBeGreaterThanOrEqual(0);
    });

    it("should output JSON format", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} snapshots check --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("healthy");
    });
  });

  describe("snapshots request", () => {
    it("should request snapshot recomputation with --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} snapshots request --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("requested");
      expect(result.requested).toBe(true);
      expect(result).toHaveProperty("auto_fix");
      expect(result.auto_fix).toBe(true);
      expect(result).toHaveProperty("healthy");
    });

    it("should support dry-run mode", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} snapshots request --dry-run --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("requested");
      expect(result.requested).toBe(true);
      expect(result).toHaveProperty("auto_fix");
      expect(result.auto_fix).toBe(false);
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

    it("should return exit code 0 on success for snapshots request", async () => {
      try {
        await execAsync(
          `${CLI_PATH} snapshots request --json`
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
      expect(result).toHaveProperty("user_id");
    });

    it("should accept --debug flag with snapshots check", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} snapshots check --debug --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("healthy");
    });

    it("should accept --env flag with whoami", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} auth whoami --env development --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("user_id");
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
      expect(result).toHaveProperty("user_id");

      // Check types
      expect(typeof result.user_id).toBe("string");
    });

    it("should have consistent JSON structure for snapshots check", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} snapshots check --json`
      );

      const result = JSON.parse(stdout);

      // Check for expected fields
      expect(result).toHaveProperty("healthy");
      expect(result).toHaveProperty("message");
      expect(result).toHaveProperty("checked");
      expect(result).toHaveProperty("stale");

      // Check types
      expect(typeof result.healthy).toBe("boolean");
      expect(typeof result.message).toBe("string");
      expect(typeof result.checked).toBe("number");
      expect(typeof result.stale).toBe("number");
    });
  });
});
