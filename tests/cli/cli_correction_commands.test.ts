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
  let testDir: string;
  // Unique per run so the registered schema and stored entity are isolated from
  // other suites and from prior runs sharing the same local SQLite file.
  const correctionType = `cli_correction_co_${Date.now()}`;

  beforeAll(async () => {
    testDir = join(tmpdir(), `neotoma-cli-correction-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Register an active schema for the entity type under correction. Since
    // #1565, /correct rejects corrections against entity types with no
    // registered schema (ERR_NO_SCHEMA_FOR_ENTITY_TYPE), so the happy-path
    // cases below must resolve against a real schema. The schema declares the
    // fields the corrections exercise; undeclared fields (test_field, exit_test)
    // are still accepted on the append path as unknown fields.
    const schemaFields = JSON.stringify({
      name: { type: "string", required: false },
      description: { type: "string", required: false },
      employee_count: { type: "number", required: false },
      is_active: { type: "boolean", required: false },
      founded_date: { type: "string", required: false },
    });
    await execAsync(
      `${CLI_PATH} schemas register --entity-type "${correctionType}" --fields '${schemaFields}' --activate --json`
    );

    const entityFile = join(testDir, "correction-entity.json");
    await writeFile(
      entityFile,
      JSON.stringify({
        entities: [
          {
            entity_type: correctionType,
            canonical_name: "Correction Test Company",
            properties: { name: "Correction Test Company" },
          },
        ],
      })
    );

    const { stdout } = await execAsync(`${CLI_PATH} store --file "${entityFile}" --json`);
    const result = JSON.parse(stdout);
    testEntityId = result.entities?.[0]?.entity_id;
  });

  describe("corrections create", () => {
    it("creates a correction with --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --entity-type "${correctionType}" --field-name "name" --corrected-value "Updated Company Name" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("correction_id");
      expect(result.entity_id).toBe(testEntityId);
    });

    it("supports common scalar field types", async () => {
      const commands = [
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --entity-type "${correctionType}" --field-name "description" --corrected-value "New description" --json`,
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --entity-type "${correctionType}" --field-name "employee_count" --corrected-value "500" --json`,
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --entity-type "${correctionType}" --field-name "is_active" --corrected-value "true" --json`,
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --entity-type "${correctionType}" --field-name "founded_date" --corrected-value "2020-01-15" --json`,
      ];

      for (const command of commands) {
        const { stdout } = await execAsync(command);
        const result = JSON.parse(stdout);
        expect(result).toHaveProperty("correction_id");
      }
    });

    it("rejects missing required parameters", async () => {
      await expect(
        execAsync(
          `${CLI_PATH} corrections create --entity-id "${testEntityId}" --entity-type "${correctionType}" --json`
        )
      ).rejects.toThrow();
    });

    it("rejects corrections against an entity type with no registered schema", async () => {
      // Since #1565, /correct surfaces ERR_NO_SCHEMA_FOR_ENTITY_TYPE when the
      // correction target's entity type has no resolvable schema. A type that
      // was never registered must therefore be rejected rather than silently
      // accepted as the old "unknown field" append path.
      const schemalessType = `cli_correction_unregistered_${Date.now()}`;
      await expect(
        execAsync(
          `${CLI_PATH} corrections create --entity-id "${testEntityId}" --entity-type "${schemalessType}" --field-name "name" --corrected-value "X" --json`
        )
      ).rejects.toThrow();
    });
  });

  describe("output formats", () => {
    it("outputs JSON with --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --entity-type "${correctionType}" --field-name "test_field" --corrected-value "test_value" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("correction_id");
    });

    it("outputs pretty format without --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --entity-type "${correctionType}" --field-name "test_field2" --corrected-value "test_value2"`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("correction_id");
    });
  });

  describe("exit codes", () => {
    it("returns exit code 0 on success", async () => {
      await expect(
        execAsync(
          `${CLI_PATH} corrections create --entity-id "${testEntityId}" --entity-type "${correctionType}" --field-name "exit_test" --corrected-value "value" --json`
        )
      ).resolves.toBeDefined();
    });

    it("returns non-zero exit code on error", async () => {
      let exitCode = 0;
      try {
        await execAsync(
          `${CLI_PATH} corrections create --entity-id "${testEntityId}" --entity-type "${correctionType}" --json`
        );
      } catch (error: any) {
        exitCode = error.code || 1;
      }

      expect(exitCode).toBeGreaterThan(0);
    });
  });
});
