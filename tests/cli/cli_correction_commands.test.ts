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

  beforeAll(async () => {
    testDir = join(tmpdir(), `neotoma-cli-correction-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const entityFile = join(testDir, "correction-entity.json");
    await writeFile(
      entityFile,
      JSON.stringify({
        entities: [
          {
            entity_type: "company",
            canonical_name: "Correction Test Company",
            properties: { name: "Correction Test Company" },
          },
        ],
      })
    );

    const { stdout } = await execAsync(`${CLI_PATH} store-structured --file-path "${entityFile}" --json`);
    const result = JSON.parse(stdout);
    testEntityId = result.entities?.[0]?.entity_id;
  });

  describe("corrections create", () => {
    it("creates a correction with --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "name" --corrected-value "Updated Company Name" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("correction_id");
      expect(result.entity_id).toBe(testEntityId);
    });

    it("supports common scalar field types", async () => {
      const commands = [
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "description" --corrected-value "New description" --json`,
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "employee_count" --corrected-value "500" --json`,
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "is_active" --corrected-value "true" --json`,
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "founded_date" --corrected-value "2020-01-15" --json`,
      ];

      for (const command of commands) {
        const { stdout } = await execAsync(command);
        const result = JSON.parse(stdout);
        expect(result).toHaveProperty("correction_id");
      }
    });

    it("rejects missing required parameters", async () => {
      await expect(
        execAsync(`${CLI_PATH} corrections create --entity-id "${testEntityId}" --json`)
      ).rejects.toThrow();
    });
  });

  describe("output formats", () => {
    it("outputs JSON with --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "test_field" --corrected-value "test_value" --json`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("correction_id");
    });

    it("outputs pretty format without --json", async () => {
      const { stdout } = await execAsync(
        `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "test_field2" --corrected-value "test_value2"`
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("correction_id");
    });
  });

  describe("exit codes", () => {
    it("returns exit code 0 on success", async () => {
      await expect(
        execAsync(
          `${CLI_PATH} corrections create --entity-id "${testEntityId}" --field-name "exit_test" --corrected-value "value" --json`
        )
      ).resolves.toBeDefined();
    });

    it("returns non-zero exit code on error", async () => {
      let exitCode = 0;
      try {
        await execAsync(`${CLI_PATH} corrections create --entity-id "${testEntityId}" --json`);
      } catch (error: any) {
        exitCode = error.code || 1;
      }

      expect(exitCode).toBeGreaterThan(0);
    });
  });
});
