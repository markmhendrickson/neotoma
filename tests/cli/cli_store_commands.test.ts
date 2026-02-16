import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";
import { verifySourceExists } from "../helpers/database_verifiers.js";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const execAsync = promisify(exec);

const CLI_PATH = "node dist/cli/index.js";
const TEST_USER_ID = "test-user-cli-store";

describe("CLI store commands", () => {
  const tracker = new TestIdTracker();
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `neotoma-cli-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await tracker.cleanup();
  });

  describe("store command", () => {
    it("should store file with --file-path and --json output", async () => {
      const testFile = join(testDir, "test-invoice.json");
      await writeFile(
        testFile,
        JSON.stringify({
          invoice_number: "INV-001",
          amount: 1500,
          vendor: "Test Vendor",
        })
      );

      const { stdout, stderr } = await execAsync(
        `${CLI_PATH} store --file-path "${testFile}" --user-id "${TEST_USER_ID}" --json`
      );

      expect(stderr).toBe("");
      const result = JSON.parse(stdout);

      expect(result).toHaveProperty("source_id");
      expect(result).toHaveProperty("entities_created");
      expect(result).toHaveProperty("observations_created");

      tracker.trackSource(result.source_id);

      // Verify database state
      const sourceExists = await verifySourceExists(result.source_id);
      expect(sourceExists).toBe(true);
    });

    it("should store file with --interpret false", async () => {
      const testFile = join(testDir, "test-no-interpret.txt");
      await writeFile(testFile, "Test content without interpretation");

      const { stdout } = await execAsync(
        `${CLI_PATH} store --file-path "${testFile}" --user-id "${TEST_USER_ID}" --interpret false --json`
      );

      const result = JSON.parse(stdout);
      tracker.trackSource(result.source_id);

      expect(result.interpretation_run_id).toBeUndefined();
    });

    it("should store file with --interpret true", async () => {
      const testFile = join(testDir, "test-interpret.txt");
      await writeFile(testFile, "Invoice from Acme Corp for $500");

      const { stdout } = await execAsync(
        `${CLI_PATH} store --file-path "${testFile}" --user-id "${TEST_USER_ID}" --interpret true --json`
      );

      const result = JSON.parse(stdout);
      tracker.trackSource(result.source_id);

      expect(result).toHaveProperty("interpretation_run_id");
    });

    it("should store file with --source-priority", async () => {
      const testFile = join(testDir, "test-priority.txt");
      await writeFile(testFile, "Test content");

      const { stdout } = await execAsync(
        `${CLI_PATH} store --file-path "${testFile}" --user-id "${TEST_USER_ID}" --source-priority high --json`
      );

      const result = JSON.parse(stdout);
      tracker.trackSource(result.source_id);

      expect(result).toHaveProperty("source_id");
    });

    it("should store file with --idempotency-key", async () => {
      const testFile = join(testDir, "test-idempotency.txt");
      await writeFile(testFile, "Test content");
      const idempotencyKey = `test-key-${Date.now()}`;

      const { stdout: stdout1 } = await execAsync(
        `${CLI_PATH} store --file-path "${testFile}" --user-id "${TEST_USER_ID}" --idempotency-key "${idempotencyKey}" --json`
      );

      const result1 = JSON.parse(stdout1);
      tracker.trackSource(result1.source_id);

      // Second call with same key should return same result
      const { stdout: stdout2 } = await execAsync(
        `${CLI_PATH} store --file-path "${testFile}" --user-id "${TEST_USER_ID}" --idempotency-key "${idempotencyKey}" --json`
      );

      const result2 = JSON.parse(stdout2);
      expect(result2.source_id).toBe(result1.source_id);
    });

    it("should handle missing file gracefully", async () => {
      await expect(
        execAsync(
          `${CLI_PATH} store --file-path "/nonexistent/file.txt" --user-id "${TEST_USER_ID}" --json`
        )
      ).rejects.toThrow();
    });

    it("should output pretty format without --json", async () => {
      const testFile = join(testDir, "test-pretty.txt");
      await writeFile(testFile, "Test content");

      const { stdout } = await execAsync(
        `${CLI_PATH} store --file-path "${testFile}" --user-id "${TEST_USER_ID}"`
      );

      const result = JSON.parse(stdout);
      tracker.trackSource(result.source_id);

      expect(result).toHaveProperty("source_id");
    });
  });

  describe("store-structured command", () => {
    it("should store structured data with --json", async () => {
      const testFile = join(testDir, "structured.json");
      await writeFile(
        testFile,
        JSON.stringify({
          entity_type: "transaction",
          amount: 100,
          description: "Test transaction",
        })
      );

      const { stdout } = await execAsync(
        `${CLI_PATH} store-structured --file-path "${testFile}" --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      tracker.trackSource(result.source_id);

      expect(result).toHaveProperty("source_id");
      expect(result).toHaveProperty("entities_created");
    });

    it("should store structured data with --entity-type", async () => {
      const testFile = join(testDir, "structured-typed.json");
      await writeFile(
        testFile,
        JSON.stringify({
          name: "Test Company",
          industry: "Technology",
        })
      );

      const { stdout } = await execAsync(
        `${CLI_PATH} store-structured --file-path "${testFile}" --user-id "${TEST_USER_ID}" --entity-type company --json`
      );

      const result = JSON.parse(stdout);
      tracker.trackSource(result.source_id);

      expect(result).toHaveProperty("source_id");
    });

    it("should handle invalid JSON gracefully", async () => {
      const testFile = join(testDir, "invalid.json");
      await writeFile(testFile, "{ invalid json }");

      await expect(
        execAsync(
          `${CLI_PATH} store-structured --file-path "${testFile}" --user-id "${TEST_USER_ID}" --json`
        )
      ).rejects.toThrow();
    });
  });

  describe("store-unstructured command", () => {
    it("should store unstructured text with --json", async () => {
      const testFile = join(testDir, "unstructured.txt");
      await writeFile(testFile, "This is unstructured text content");

      const { stdout } = await execAsync(
        `${CLI_PATH} store-unstructured --file-path "${testFile}" --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      tracker.trackSource(result.source_id);

      expect(result).toHaveProperty("source_id");
    });

    it("should store unstructured text with --interpret", async () => {
      const testFile = join(testDir, "unstructured-interpret.txt");
      await writeFile(testFile, "Meeting notes from Jan 15 with Bob Smith");

      const { stdout } = await execAsync(
        `${CLI_PATH} store-unstructured --file-path "${testFile}" --user-id "${TEST_USER_ID}" --interpret true --json`
      );

      const result = JSON.parse(stdout);
      tracker.trackSource(result.source_id);

      expect(result).toHaveProperty("interpretation_run_id");
    });

    it("should handle empty file", async () => {
      const testFile = join(testDir, "empty.txt");
      await writeFile(testFile, "");

      const { stdout } = await execAsync(
        `${CLI_PATH} store-unstructured --file-path "${testFile}" --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      tracker.trackSource(result.source_id);

      expect(result).toHaveProperty("source_id");
    });
  });

  describe("file-content parameter", () => {
    it("should store via --file-content instead of --file-path", async () => {
      const content = JSON.stringify({ test: "data" });

      const { stdout } = await execAsync(
        `${CLI_PATH} store-structured --file-content '${content}' --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      tracker.trackSource(result.source_id);

      expect(result).toHaveProperty("source_id");
    });
  });

  describe("exit codes", () => {
    it("should return exit code 0 on success", async () => {
      const testFile = join(testDir, "exit-success.txt");
      await writeFile(testFile, "Test");

      try {
        await execAsync(
          `${CLI_PATH} store --file-path "${testFile}" --user-id "${TEST_USER_ID}" --json`
        );
        // If no error, exit code was 0
        expect(true).toBe(true);
      } catch (error: any) {
        const result = JSON.parse(error.stdout);
        tracker.trackSource(result.source_id);
        throw error;
      }
    });

    it("should return non-zero exit code on error", async () => {
      let exitCode = 0;
      try {
        await execAsync(
          `${CLI_PATH} store --file-path "/nonexistent.txt" --user-id "${TEST_USER_ID}" --json`
        );
      } catch (error: any) {
        exitCode = error.code || 1;
      }

      expect(exitCode).toBeGreaterThan(0);
    });
  });
});
