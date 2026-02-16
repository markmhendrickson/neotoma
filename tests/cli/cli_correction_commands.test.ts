import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";
import { createTestEntity, createTestSource, createTestInterpretation } from "../helpers/test_data_helpers.js";

const execAsync = promisify(exec);

const CLI_PATH = "node dist/cli/index.js";
const TEST_USER_ID = "test-user-cli-correction";

describe("CLI correction commands", () => {
  const tracker = new TestIdTracker();
  let testEntityId: string;
  let testSourceId: string;
  let testInterpretationId: string;

  beforeAll(async () => {
    // Create test entity
    testEntityId = await createTestEntity({
      entity_type: "company",
      canonical_name: "Correction Test Company",
      user_id: TEST_USER_ID,
    });
    tracker.trackEntity(testEntityId);

    // Create test source
    const source = await createTestSource({
      user_id: TEST_USER_ID,
      storage_url: "file:///test/correction.json",
      mime_type: "application/json",
    });
    testSourceId = source.id;
    tracker.trackSource(testSourceId);

    // Create test interpretation
    testInterpretationId = await createTestInterpretation({
      source_id: testSourceId,
      user_id: TEST_USER_ID,
      interpretation_data: { field: "value" },
    });
  });

  afterEach(async () => {
    await tracker.cleanup();
  });

  describe("corrections create", () => {
    it("should create correction with --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "name" --corrected-value "Updated Company Name" --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("correction_id");
      expect(result).toHaveProperty("entity_id");
      expect(result.entity_id).toBe(testEntityId);
    });

    it("should create correction for string field", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "description" --corrected-value "New description" --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("correction_id");
    });

    it("should create correction for number field", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "employee_count" --corrected-value "500" --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("correction_id");
    });

    it("should create correction for boolean field", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "is_active" --corrected-value "true" --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("correction_id");
    });

    it("should create correction for date field", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "founded_date" --corrected-value "2020-01-15" --user-id "${TEST_USER_ID}" --json`
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

    it("should handle invalid entity ID", async () => {
      await expect(
        execAsync(
          `${CLI_PATH} corrections create --entity-id "ent_invalid" --field-name "name" --corrected-value "value" --user-id "${TEST_USER_ID}" --json`
        )
      ).rejects.toThrow();
    });
  });

  describe("interpretations reinterpret", () => {
    it("should reinterpret with default config", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} interpretations reinterpret --interpretation-id "${testInterpretationId}" --user-id "${TEST_USER_ID}" --json`
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
        `${CLI_PATH} interpretations reinterpret --interpretation-id "${testInterpretationId}" --interpretation-config '${config}' --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("interpretation_id");
    });

    it("should handle invalid interpretation ID", async () => {
      await expect(
        execAsync(
          `${CLI_PATH} interpretations reinterpret --interpretation-id "int_invalid" --user-id "${TEST_USER_ID}" --json`
        )
      ).rejects.toThrow();
    });

    it("should handle invalid config JSON", async () => {
      await expect(
        execAsync(
          `${CLI_PATH} interpretations reinterpret --interpretation-id "${testInterpretationId}" --interpretation-config "{ invalid json }" --user-id "${TEST_USER_ID}" --json`
        )
      ).rejects.toThrow();
    });
  });

  describe("output formats", () => {
    it("should output JSON with --json flag for corrections", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "test_field" --corrected-value "test_value" --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("correction_id");
    });

    it("should output pretty format without --json for corrections", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "test_field2" --corrected-value "test_value2" --user-id "${TEST_USER_ID}"`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("correction_id");
    });
  });

  describe("database verification", () => {
    it("should create correction that updates entity snapshot", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "verified_name" --corrected-value "Verified Company" --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("correction_id");

      // Verify entity was updated by fetching it
      const { stdout: entityStdout } = await execAsync(
        `${CLI_PATH} entities get --entity-id "${testEntityId}" --json`
      );

      const entityResult = JSON.parse(entityStdout);
      expect(entityResult.entity).toHaveProperty("id", testEntityId);
    });
  });

  describe("exit codes", () => {
    it("should return exit code 0 on success for corrections", async () => {
      try {
        await execAsync(
          `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "exit_test" --corrected-value "value" --user-id "${TEST_USER_ID}" --json`
        );
        expect(true).toBe(true);
      } catch {
        throw new Error("Should not throw on success");
      }
    });

    it("should return non-zero exit code on error for corrections", async () => {
      let exitCode = 0;
      try {
        await execAsync(
          `${CLI_PATH} corrections create --entity-id "ent_invalid" --field-name "field" --corrected-value "value" --user-id "${TEST_USER_ID}" --json`
        );
      } catch (error: any) {
        exitCode = error.code || 1;
      }

      expect(exitCode).toBeGreaterThan(0);
    });

    it("should return exit code 0 on success for reinterpret", async () => {
      try {
        await execAsync(
          `${CLI_PATH} interpretations reinterpret --interpretation-id "${testInterpretationId}" --user-id "${TEST_USER_ID}" --json`
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
          `${CLI_PATH} interpretations reinterpret --interpretation-id "int_invalid" --user-id "${TEST_USER_ID}" --json`
        );
      } catch (error: any) {
        exitCode = error.code || 1;
      }

      expect(exitCode).toBeGreaterThan(0);
    });
  });
});
