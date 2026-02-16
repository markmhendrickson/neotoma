import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";
import { createTestSource } from "../helpers/test_data_helpers.js";

const execAsync = promisify(exec);

const CLI_PATH = "node dist/cli/index.js";
const TEST_USER_ID = "test-user-cli-source";

describe("CLI source commands", () => {
  const tracker = new TestIdTracker();
  let testSourceId: string;

  beforeAll(async () => {
    // Create test source
    const source = await createTestSource({
      user_id: TEST_USER_ID,
      storage_url: "file:///test/source.json",
      mime_type: "application/json",
    });
    testSourceId = source.id;
    tracker.trackSource(testSourceId);
  });

  afterEach(async () => {
    await tracker.cleanup();
  });

  describe("sources list", () => {
    it("should list all sources with --json", async () => {
      const { stdout, stderr } = await execAsync(
        `${CLI_PATH} sources list --json`
      );

      expect(stderr).toBe("");
      const result = JSON.parse(stdout);

      expect(result).toHaveProperty("sources");
      expect(Array.isArray(result.sources)).toBe(true);
    });

    it("should filter by --user-id", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} sources list --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.sources.some((s: any) => s.user_id === TEST_USER_ID)).toBe(true);
    });

    it("should paginate with --limit", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} sources list --limit 5 --json`
      );

      const result = JSON.parse(stdout);
      expect(result.sources.length).toBeLessThanOrEqual(5);
    });

    it("should paginate with --offset", async () => {
      const { stdout: page1 } = await execAsync(
        `${CLI_PATH} sources list --limit 2 --offset 0 --json`
      );

      const { stdout: page2 } = await execAsync(
        `${CLI_PATH} sources list --limit 2 --offset 2 --json`
      );

      const result1 = JSON.parse(page1);
      const result2 = JSON.parse(page2);

      if (result1.sources.length > 0 && result2.sources.length > 0) {
        expect(result1.sources[0].id).not.toBe(result2.sources[0].id);
      }
    });

    it("should combine user filtering with pagination", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} sources list --user-id "${TEST_USER_ID}" --limit 10 --json`
      );

      const result = JSON.parse(stdout);
      expect(result.sources.length).toBeLessThanOrEqual(10);
    });

    it("should output pretty format without --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} sources list`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("sources");
    });
  });

  describe("sources get", () => {
    it("should get source by ID with --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} sources get --source-id "${testSourceId}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.source.id).toBe(testSourceId);
      expect(result.source.user_id).toBe(TEST_USER_ID);
    });

    it("should include file URL in response", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} sources get --source-id "${testSourceId}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.source).toHaveProperty("file_path");
    });

    it("should handle invalid source ID", async () => {
      await expect(
        execAsync(
          `${CLI_PATH} sources get --source-id "src_invalid" --json`
        )
      ).rejects.toThrow();
    });

    it("should output pretty format without --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} sources get --source-id "${testSourceId}"`
      );

      const result = JSON.parse(stdout);
      expect(result.source.id).toBe(testSourceId);
    });
  });

  describe("file URL retrieval", () => {
    it("should include file metadata in source response", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} sources get --source-id "${testSourceId}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.source).toHaveProperty("file_path");
      expect(result.source).toHaveProperty("file_type");
    });

    it("should show file path in list response", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} sources list --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      const testSource = result.sources.find((s: any) => s.id === testSourceId);

      if (testSource) {
        expect(testSource).toHaveProperty("file_path");
      }
    });
  });

  describe("error handling", () => {
    it("should handle empty results gracefully", async () => {
      const fakeUserId = "fake-user-12345";

      const { stdout } = await execAsync(
        `${CLI_PATH} sources list --user-id "${fakeUserId}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.sources.length).toBe(0);
    });

    it("should handle missing required parameters", async () => {
      await expect(
        execAsync(
          `${CLI_PATH} sources get --json`
        )
      ).rejects.toThrow();
    });
  });

  describe("exit codes", () => {
    it("should return exit code 0 on success", async () => {
      try {
        await execAsync(
          `${CLI_PATH} sources list --json`
        );
        expect(true).toBe(true);
      } catch {
        throw new Error("Should not throw on success");
      }
    });

    it("should return non-zero exit code on error", async () => {
      let exitCode = 0;
      try {
        await execAsync(
          `${CLI_PATH} sources get --source-id "src_invalid" --json`
        );
      } catch (error: any) {
        exitCode = error.code || 1;
      }

      expect(exitCode).toBeGreaterThan(0);
    });
  });
});
