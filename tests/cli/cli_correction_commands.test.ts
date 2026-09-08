import { describe, it, expect, beforeAll } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const execAsync = promisify(exec);
const CLI_PATH = "node dist/cli/index.js";

function cliBaseUrlFlag(): string {
  // Prefer the Vitest globalSetup HTTP server; ignore ambient NEOTOMA_BASE_URL
  // (often production) so --reason is exercised against this branch's OpenAPI.
  const port = process.env.NEOTOMA_SESSION_DEV_PORT;
  if (port && /^\d+$/.test(port)) {
    return `--base-url http://127.0.0.1:${port}`;
  }
  return "";
}

function cli(cmd: string): string {
  const base = cliBaseUrlFlag();
  return base ? `${CLI_PATH} ${base} ${cmd}` : `${CLI_PATH} ${cmd}`;
}

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
      cli(`schemas register --entity-type "${correctionType}" --fields '${schemaFields}' --activate --json`)
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

    const { stdout } = await execAsync(cli(`store --file "${entityFile}" --json`));
    const result = JSON.parse(stdout);
    testEntityId = result.entities?.[0]?.entity_id;
  });

  describe("corrections create", () => {
    it("creates a correction with --json", async () => {
      const { stdout } = await execAsync(
        cli(
          `corrections create --entity-id "${testEntityId}" --entity-type "${correctionType}" --field-name "name" --corrected-value "Updated Company Name" --json`
        )
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("correction_id");
      expect(result.entity_id).toBe(testEntityId);
    });

    it("persists --reason onto the observation row (effect)", async () => {
      const { db } = await import("../../src/db.js");
      const reasonText = "cli operator verified against invoice";
      const idem = `cli-reason-effect-${Date.now()}`;
      const { stdout } = await execAsync(
        cli(
          `corrections create --entity-id "${testEntityId}" --entity-type "${correctionType}" --field-name "name" --corrected-value "Reasoned Name" --reason "${reasonText}" --idempotency-key "${idem}" --json`
        )
      );
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("correction_id");

      const { data: rows, error } = await db
        .from("observations")
        .select("reason, idempotency_key")
        .eq("entity_id", testEntityId)
        .eq("idempotency_key", idem);
      expect(error).toBeNull();
      expect(rows?.length).toBeGreaterThan(0);
      expect(rows?.[0]?.reason).toBe(reasonText);
    });

    it("supports common scalar field types", async () => {
      const commands = [
        cli(
          `corrections create --entity-id "${testEntityId}" --entity-type "${correctionType}" --field-name "description" --corrected-value "New description" --json`
        ),
        cli(
          `corrections create --entity-id "${testEntityId}" --entity-type "${correctionType}" --field-name "employee_count" --corrected-value "500" --json`
        ),
        cli(
          `corrections create --entity-id "${testEntityId}" --entity-type "${correctionType}" --field-name "is_active" --corrected-value "true" --json`
        ),
        cli(
          `corrections create --entity-id "${testEntityId}" --entity-type "${correctionType}" --field-name "founded_date" --corrected-value "2020-01-15" --json`
        ),
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
          cli(
            `corrections create --entity-id "${testEntityId}" --entity-type "${correctionType}" --json`
          )
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
          cli(
            `corrections create --entity-id "${testEntityId}" --entity-type "${schemalessType}" --field-name "name" --corrected-value "X" --json`
          )
        )
      ).rejects.toThrow();
    });
  });

  describe("output formats", () => {
    it("outputs JSON with --json", async () => {
      const { stdout } = await execAsync(
        cli(
          `corrections create --entity-id "${testEntityId}" --entity-type "${correctionType}" --field-name "test_field" --corrected-value "test_value" --json`
        )
      );

      const result = JSON.parse(stdout);
      expect(result).toHaveProperty("correction_id");
    });

    it("outputs pretty format without --json", async () => {
      const { stdout } = await execAsync(
        cli(
          `corrections create --entity-id "${testEntityId}" --entity-type "${correctionType}" --field-name "test_field2" --corrected-value "test_value2"`
        )
      );

      expect(stdout).toBeTruthy();
      expect(stdout.length).toBeGreaterThan(0);
    });
  });

  describe("exit codes", () => {
    it("returns exit code 0 on success", async () => {
      await expect(
        execAsync(
          cli(
            `corrections create --entity-id "${testEntityId}" --entity-type "${correctionType}" --field-name "exit_test" --corrected-value "value" --json`
          )
        )
      ).resolves.toBeDefined();
    });

    it("returns non-zero exit code on error", async () => {
      await expect(
        execAsync(
          cli(
            `corrections create --entity-id "${testEntityId}" --entity-type "${correctionType}" --json`
          )
        )
      ).rejects.toThrow();
    });
  });
});
