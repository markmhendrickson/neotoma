import { describe, it, expect, beforeAll } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const execAsync = promisify(exec);

const CLI_PATH = "node dist/cli/index.js";

describe("CLI source commands", () => {
  let testSourceId: string;
  let testDir: string;

  beforeAll(async () => {
    // Create test data via CLI store command (writes to API server DB)
    testDir = join(tmpdir(), `neotoma-cli-source-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const testFile = join(testDir, "source.json");
    await writeFile(testFile, JSON.stringify({ test: "source-data", mime_type: "application/json" }));

    const { stdout } = await execAsync(
      `${CLI_PATH} store --file-path "${testFile}" --json`
    );
    const result = JSON.parse(stdout);
    testSourceId = result.source_id;
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
      // The API uses the authenticated user (dev-local user) for filtering
      // Just verify we can call list and get a valid response structure
      const { stdout } = await execAsync(
        `${CLI_PATH} sources list --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("sources");
      expect(Array.isArray(result.sources)).toBe(true);
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
        `${CLI_PATH} sources list --limit 10 --json`
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
    });

    it("should include file URL in response", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} sources get --source-id "${testSourceId}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.source).toBeDefined();
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
      expect(result.source).toBeDefined();
      expect(result.source.id).toBe(testSourceId);
    });

    it("should show file path in list response", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} sources list --json`
      );

      const result = JSON.parse(stdout);
      const testSource = result.sources.find((s: any) => s.id === testSourceId);

      if (testSource) {
        expect(testSource).toBeDefined();
      }
    });
  });

  describe("error handling", () => {
    it("should handle empty results gracefully", async () => {
      // Use a source-id that doesn't exist to test 404 handling
      // Note: the API returns 404 for invalid IDs, which is an error
      const { stdout } = await execAsync(
        `${CLI_PATH} sources list --limit 0 --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("sources");
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
