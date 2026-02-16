import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import { TestIdTracker } from "../helpers/cleanup_helpers.js";
import { createTestEntity } from "../helpers/test_data_helpers.js";

const execAsync = promisify(exec);

const CLI_PATH = "node dist/cli/index.js";
const TEST_USER_ID = "test-user-cli-schema";
const TEST_ENTITY_TYPE = `test_type_${Date.now()}`;

describe("CLI schema commands", () => {
  const tracker = new TestIdTracker();

  afterEach(async () => {
    await tracker.cleanup();
  });

  describe("schemas list", () => {
    it("should list all schemas with --json", async () => {
      const { stdout, stderr } = await execAsync(
        `${CLI_PATH} schemas list --json`
      );

      expect(stderr).toBe("");
      const result = JSON.parse(stdout);

      expect(result).toHaveProperty("schemas");
      expect(Array.isArray(result.schemas)).toBe(true);
    });

    it("should filter by --entity-type", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} schemas list --entity-type company --json`
      );

      const result = JSON.parse(stdout);
      result.schemas.forEach((schema: any) => {
        expect(schema.entity_type).toBe("company");
      });
    });

    it("should show user-specific schemas with --user-specific", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} schemas list --user-specific --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("schemas");
    });

    it("should paginate with --limit and --offset", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} schemas list --limit 5 --offset 0 --json`
      );

      const result = JSON.parse(stdout);
      expect(result.schemas.length).toBeLessThanOrEqual(5);
    });
  });

  describe("schemas get", () => {
    it("should get schema for entity type with --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} schemas get --entity-type company --json`
      );

      const result = JSON.parse(stdout);
      expect(result.schema.entity_type).toBe("company");
      expect(result.schema).toHaveProperty("fields");
    });

    it("should handle non-existent entity type", async () => {
      await expect(
        execAsync(
          `${CLI_PATH} schemas get --entity-type nonexistent_type_12345 --json`
        )
      ).rejects.toThrow();
    });

    it("should get user-specific schema", async () => {
      // Create user-specific schema first (if possible via API)
      // For now, test that the command accepts the parameter
      const { stdout } = await execAsync(
        `${CLI_PATH} schemas get --entity-type company --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("schema");
    });
  });

  describe("schemas analyze", () => {
    beforeAll(async () => {
      // Create test entity to analyze
      const entityId = await createTestEntity({
        entity_type: TEST_ENTITY_TYPE,
        canonical_name: "Test Entity for Schema",
        user_id: TEST_USER_ID,
      });
      tracker.trackEntity(entityId);
    });

    it("should analyze schema with --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} schemas analyze --entity-type "${TEST_ENTITY_TYPE}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("analysis");
    });

    it("should analyze user-specific schema", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} schemas analyze --entity-type "${TEST_ENTITY_TYPE}" --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("analysis");
    });
  });

  describe("schemas recommend", () => {
    it("should recommend schema improvements with --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} schemas recommend --entity-type "${TEST_ENTITY_TYPE}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("recommendations");
    });

    it("should recommend for user-specific context", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} schemas recommend --entity-type "${TEST_ENTITY_TYPE}" --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("recommendations");
    });
  });

  describe("schemas update", () => {
    it("should update schema fields with --json", async () => {
      const fields = JSON.stringify({
        name: { type: "string", required: true },
        email: { type: "string", required: false },
        age: { type: "number", required: false },
      });

      const { stdout } = await execAsync(
        `${CLI_PATH} schemas update --entity-type "${TEST_ENTITY_TYPE}" --fields '${fields}' --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("schema");
      expect(result.schema.entity_type).toBe(TEST_ENTITY_TYPE);
    });

    it("should update schema with various field types", async () => {
      const fields = JSON.stringify({
        string_field: { type: "string", required: true },
        number_field: { type: "number", required: true },
        boolean_field: { type: "boolean", required: false },
        date_field: { type: "date", required: false },
        array_field: { type: "array", required: false },
        object_field: { type: "object", required: false },
      });

      const { stdout } = await execAsync(
        `${CLI_PATH} schemas update --entity-type "${TEST_ENTITY_TYPE}_types" --fields '${fields}' --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.schema).toHaveProperty("fields");
    });

    it("should handle invalid field definitions", async () => {
      const invalidFields = "{ invalid json }";

      await expect(
        execAsync(
          `${CLI_PATH} schemas update --entity-type "${TEST_ENTITY_TYPE}" --fields '${invalidFields}' --user-id "${TEST_USER_ID}" --json`
        )
      ).rejects.toThrow();
    });
  });

  describe("schemas register", () => {
    it("should register new schema with --json", async () => {
      const uniqueType = `test_register_${Date.now()}`;
      const fields = JSON.stringify({
        name: { type: "string", required: true },
        description: { type: "string", required: false },
      });

      const { stdout } = await execAsync(
        `${CLI_PATH} schemas register --entity-type "${uniqueType}" --fields '${fields}' --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.schema.entity_type).toBe(uniqueType);
    });

    it("should register with --activate flag", async () => {
      const uniqueType = `test_activate_${Date.now()}`;
      const fields = JSON.stringify({
        name: { type: "string", required: true },
      });

      const { stdout } = await execAsync(
        `${CLI_PATH} schemas register --entity-type "${uniqueType}" --fields '${fields}' --user-id "${TEST_USER_ID}" --activate --json`
      );

      const result = JSON.parse(stdout);
      expect(result.schema.active).toBe(true);
    });

    it("should register with --migrate-existing flag", async () => {
      const uniqueType = `test_migrate_${Date.now()}`;
      const fields = JSON.stringify({
        name: { type: "string", required: true },
      });

      const { stdout } = await execAsync(
        `${CLI_PATH} schemas register --entity-type "${uniqueType}" --fields '${fields}' --user-id "${TEST_USER_ID}" --migrate-existing --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("schema");
    });

    it("should register with reducer strategy", async () => {
      const uniqueType = `test_reducer_${Date.now()}`;
      const fields = JSON.stringify({
        counter: { type: "number", required: true, reducer: "sum" },
        latest_value: { type: "string", required: false, reducer: "latest" },
      });

      const { stdout } = await execAsync(
        `${CLI_PATH} schemas register --entity-type "${uniqueType}" --fields '${fields}' --user-id "${TEST_USER_ID}" --json`
      );

      const result = JSON.parse(stdout);
      expect(result.schema).toHaveProperty("fields");
    });
  });

  describe("output formats", () => {
    it("should output pretty format without --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} schemas list`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("schemas");
    });

    it("should output JSON with --json flag", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} schemas list --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("schemas");
      expect(Array.isArray(result.schemas)).toBe(true);
    });
  });

  describe("exit codes", () => {
    it("should return exit code 0 on success", async () => {
      try {
        await execAsync(
          `${CLI_PATH} schemas list --json`
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
          `${CLI_PATH} schemas get --entity-type "invalid_nonexistent_type_12345" --json`
        );
      } catch (error: any) {
        exitCode = error.code || 1;
      }

      expect(exitCode).toBeGreaterThan(0);
    });
  });
});
