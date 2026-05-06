/**
 * Behavioral coverage for `neotoma edit <id>`.
 *
 * The interactive path (opening $EDITOR) is covered by the underlying
 * `applyBatchCorrection` unit tests; here we validate:
 *   - the command is registered and accepts <id>
 *   - `--editor` override is wired through
 *   - a no-op edit (editor exits without changing the buffer) produces
 *     `status: "no_changes"` without hitting the API
 */
import { describe, it, expect, beforeAll } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const execAsync = promisify(exec);
const CLI_PATH = "node dist/cli/index.js";

describe("CLI edit command", () => {
  let testEntityId: string;
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `neotoma-cli-edit-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const entityFile = join(testDir, "edit-entity.json");
    await writeFile(
      entityFile,
      JSON.stringify({
        entities: [
          {
            entity_type: "company",
            canonical_name: "Edit Test Company",
            properties: { name: "Edit Test Company" },
          },
        ],
      })
    );

    const { stdout } = await execAsync(
      `${CLI_PATH} store --file "${entityFile}" --json`
    );
    const result = JSON.parse(stdout);
    testEntityId = result.entities?.[0]?.entity_id;
    expect(testEntityId, "test entity should be created").toBeTruthy();
  });

  it("shows edit in top-level help", async () => {
    const { stdout } = await execAsync(`${CLI_PATH} --help`);
    expect(stdout).toMatch(/\bedit\b/);
  });

  it("returns no_changes when the editor exits without modifying the buffer", async () => {
    // `true` exits 0 without touching the file, so the buffer is unchanged
    // and `edit` should short-circuit to no_changes without contacting the
    // batch_correct endpoint.
    const { stdout } = await execAsync(
      `${CLI_PATH} edit "${testEntityId}" --editor true --json`
    );
    const result = JSON.parse(stdout);
    expect(result).toMatchObject({
      success: true,
      status: "no_changes",
      entity_id: testEntityId,
    });
  });

  it("fails without an entity id argument", async () => {
    let exitCode = 0;
    try {
      await execAsync(`${CLI_PATH} edit --editor true --json`);
    } catch (error) {
      const e = error as NodeJS.ErrnoException & { code?: number };
      exitCode = typeof e.code === "number" ? e.code : 1;
    }
    expect(exitCode).toBeGreaterThan(0);
  });
});
