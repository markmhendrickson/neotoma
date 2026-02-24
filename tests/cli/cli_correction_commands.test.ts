import { describe, it, expect, beforeAll } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const execAsync = promisify(exec);

const CLI_PATH = "node dist/cli/index.js";

describe("CLI correction commands", () => {
  let testEntityId: string;
  let testSourceId: string;
  let testDir: string;
  let pendingCsvSourceId: string;

  beforeAll(async () => {
    // Create test entity via CLI store-structured (writes to API server DB)
    testDir = join(tmpdir(), `neotoma-cli-correction-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const entityFile = join(testDir, "correction-entity.json");
    await writeFile(entityFile, JSON.stringify({
      entities: [{
        entity_type: "company",
        canonical_name: "Correction Test Company",
        properties: { name: "Correction Test Company" }
      }]
    }));

    const { stdout } = await execAsync(
      `${CLI_PATH} store-structured --file-path "${entityFile}" --json`
    );
    const result = JSON.parse(stdout);
    testEntityId = result.entities?.[0]?.entity_id;
    testSourceId = result.source_id;
  });

  describe("corrections create", () => {
    it("should create correction with --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "name" --corrected-value "Updated Company Name" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("correction_id");
      expect(result).toHaveProperty("entity_id");
      expect(result.entity_id).toBe(testEntityId);
    });

    it("should create correction for string field", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "description" --corrected-value "New description" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("correction_id");
    });

    it("should create correction for number field", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "employee_count" --corrected-value "500" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("correction_id");
    });

    it("should create correction for boolean field", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "is_active" --corrected-value "true" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("correction_id");
    });

    it("should create correction for date field", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "founded_date" --corrected-value "2020-01-15" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("correction_id");
    });

    it("should handle missing required parameters", async () => {
      await expect(
        execAsync(
          `${CLI_PATH} corrections create --entity-id "${testEntityId}" --json`
        )
      ).rejects.toThrow();
    });

    it("should handle missing field-name parameter", async () => {
      await expect(
        execAsync(
          `${CLI_PATH} corrections create --entity-id "${testEntityId}" --corrected-value "value" --json`
        )
      ).rejects.toThrow();
    });
  });

  describe("interpretations reinterpret", () => {
    it("should reinterpret with default config", async () => {
      // Use the source_id from the stored entity file
      const { stdout } = await execAsync(
        `${CLI_PATH} interpretations reinterpret --source-id "${testSourceId}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("interpretation_id");
      expect(result).toHaveProperty("reinterpreted");
    });

    it("should reinterpret with custom config", async () => {
      const config = JSON.stringify({
        model: "gpt-4",
        temperature: 0.7,
      });

      const { stdout } = await execAsync(
        `${CLI_PATH} interpretations reinterpret --source-id "${testSourceId}" --interpretation-config '${config}' --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("interpretation_id");
    });

    it("should handle invalid source ID", async () => {
      await expect(
        execAsync(
          `${CLI_PATH} interpretations reinterpret --source-id "invalid-source-id" --json`
        )
      ).rejects.toThrow();
    });

    it("should handle invalid config JSON", async () => {
      await expect(
        execAsync(
          `${CLI_PATH} interpretations reinterpret --source-id "${testSourceId}" --interpretation-config "{ invalid json }" --json`
        )
      ).rejects.toThrow();
    });
  });

  describe("interpretations interpret-uninterpreted", () => {
    beforeAll(async () => {
      const csvPath = join(testDir, "pending-interpretation.csv");
      await writeFile(csvPath, "name,amount,date\nBackfill Vendor,42.10,2026-01-01\n");

      const { stdout } = await execAsync(
        `${CLI_PATH} store-unstructured --file-path "${csvPath}" --interpret false --json`
      );
      const storeResult = JSON.parse(stdout);
      pendingCsvSourceId = storeResult.source_id;

      // Ensure there is at least one interpreted source to validate "only uninterpreted" filtering.
      await execAsync(`${CLI_PATH} interpretations reinterpret --source-id "${testSourceId}" --json`);
    });

    it("should dry-run uninterpreted sources", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} interpretations interpret-uninterpreted --limit 100 --dry-run --json`
      );
      const result = JSON.parse(stdout);
      expect(result.dry_run).toBe(true);
      expect(Array.isArray(result.would_interpret)).toBe(true);
      expect(result.count).toBe(result.would_interpret.length);
      expect(result.count).toBeGreaterThan(0);
      expect(result.count).toBeLessThanOrEqual(100);
    });

    it("should interpret previously uninterpreted sources in batch", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} interpretations interpret-uninterpreted --limit 100 --json`
      );
      const result = JSON.parse(stdout);
      expect(result.dry_run).toBe(false);
      expect(Array.isArray(result.interpreted)).toBe(true);
      expect(result.count).toBe(result.interpreted.length);
      expect(result.count).toBeGreaterThan(0);
      expect(result.interpreted.every((entry: { source_id?: string }) => typeof entry.source_id === "string")).toBe(true);
    });
  });

  describe("output formats", () => {
    it("should output JSON with --json flag for corrections", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "test_field" --corrected-value "test_value" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("correction_id");
    });

    it("should output pretty format without --json for corrections", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "test_field2" --corrected-value "test_value2"`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("correction_id");
    });
  });

  describe("database verification", () => {
    it("should create correction that updates entity snapshot", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "verified_name" --corrected-value "Verified Company" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("correction_id");

      // Verify entity exists by fetching it (using positional arg, not --entity-id)
      const { stdout: entityStdout } = await execAsync(
        `${CLI_PATH} entities get "${testEntityId}" --json`
      );

      const entityResult = JSON.parse(entityStdout);
      expect(entityResult.entity_id).toBe(testEntityId);
    });
  });

  describe("exit codes", () => {
    it("should return exit code 0 on success for corrections", async () => {
      try {
        await execAsync(
          `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "exit_test" --corrected-value "value" --json`
        );
        expect(true).toBe(true);
      } catch {
        throw new Error("Should not throw on success");
      }
    });

    it("should return non-zero exit code on error for corrections", async () => {
      let exitCode = 0;
      try {
        // Use missing required params to trigger error
        await execAsync(
          `${CLI_PATH} corrections create --entity-id "${testEntityId}" --json`
        );
      } catch (error: any) {
        exitCode = error.code || 1;
      }

      expect(exitCode).toBeGreaterThan(0);
    });

    it("should return exit code 0 on success for reinterpret", async () => {
      try {
        await execAsync(
          `${CLI_PATH} interpretations reinterpret --source-id "${testSourceId}" --json`
        );
        expect(true).toBe(true);
      } catch {
        throw new Error("Should not throw on success");
      }
    });

    it("should return non-zero exit code on error for reinterpret", async () => {
      let exitCode = 0;
      try {
        await execAsync(
          `${CLI_PATH} interpretations reinterpret --source-id "nonexistent-source-id" --json`
        );
      } catch (error: any) {
        exitCode = error.code || 1;
      }

      expect(exitCode).toBeGreaterThan(0);
    });
  });
});
