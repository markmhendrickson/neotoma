/**
 * CLI coverage for `neotoma array-item patch` (Waxwing ADR,
 * ent_4b41bb83a4faf4428a73bfc8). Cross-surface parity requirement: the CLI
 * must expose the same patch_array_item mechanism as MCP/HTTP, driven with
 * its natural CLI call shape (positional args + --item-json), not merely a
 * generic `request --operation` fallback.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const execAsync = promisify(exec);
const CLI_PATH = "node dist/cli/index.js";

describe("CLI array-item patch command", () => {
  let testEntityId: string;
  let testDir: string;
  const entityType = `cli_array_item_patch_${Date.now()}`;

  beforeAll(async () => {
    testDir = join(tmpdir(), `neotoma-cli-array-item-patch-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const schemaFields = JSON.stringify({
      title: { type: "string", required: false },
      tasks_claimed: {
        type: "array",
        required: false,
        reducer_config: { strategy: "merge_array_by_key", key_field: "claim_id" },
      },
    });
    await execAsync(
      `${CLI_PATH} schemas register --entity-type "${entityType}" --fields '${schemaFields}' --activate --json`
    );

    const entityFile = join(testDir, "array-item-patch-entity.json");
    await writeFile(
      entityFile,
      JSON.stringify({
        entities: [
          {
            entity_type: entityType,
            canonical_name: "Array Item Patch Test Workboard",
            properties: { title: "Array Item Patch Test Workboard", tasks_claimed: [] },
          },
        ],
      })
    );

    const { stdout } = await execAsync(`${CLI_PATH} store --file "${entityFile}" --json`);
    const result = JSON.parse(stdout);
    testEntityId = result.entities?.[0]?.entity_id;
    expect(testEntityId, "test entity should be created").toBeTruthy();
  });

  it("shows array-item in top-level help", async () => {
    const { stdout } = await execAsync(`${CLI_PATH} --help`);
    expect(stdout).toMatch(/array-item/);
  });

  it("patches a new item by key and returns item_version", async () => {
    const itemJson = JSON.stringify({ claim: "review PR #1", status: "in_review" });
    const { stdout } = await execAsync(
      `${CLI_PATH} array-item patch "${testEntityId}" "${entityType}" tasks_claimed claim_id pr-1 --item-json '${itemJson}' --json`
    );
    const result = JSON.parse(stdout);
    expect(result.success).toBe(true);
    expect(result.status).toBe("applied");
    expect(result.item).toMatchObject({ claim_id: "pr-1", status: "in_review" });
    expect(typeof result.item_version).toBe("string");
  });

  it("preserves a disjoint key when a second patch targets a different row", async () => {
    await execAsync(
      `${CLI_PATH} array-item patch "${testEntityId}" "${entityType}" tasks_claimed claim_id pr-2 --item-json '${JSON.stringify({ status: "queued" })}' --json`
    );

    const { stdout } = await execAsync(`${CLI_PATH} entities get "${testEntityId}" --json`);
    const entity = JSON.parse(stdout);
    const rows = entity.snapshot?.tasks_claimed as Array<Record<string, unknown>>;
    const ids = rows.map((r) => r.claim_id).sort();
    expect(ids).toContain("pr-1");
    expect(ids).toContain("pr-2");
  });

  it("reports a structured conflict and exits non-zero when expected_item_version is stale", async () => {
    const seedKey = "conflict-key";
    const { stdout: seedOut } = await execAsync(
      `${CLI_PATH} array-item patch "${testEntityId}" "${entityType}" tasks_claimed claim_id ${seedKey} --item-json '${JSON.stringify({ status: "queued" })}' --json`
    );
    const seedResult = JSON.parse(seedOut);
    const staleVersion = seedResult.item_version as string;

    // Advance the row so the version the caller holds is now stale.
    await execAsync(
      `${CLI_PATH} array-item patch "${testEntityId}" "${entityType}" tasks_claimed claim_id ${seedKey} --item-json '${JSON.stringify({ status: "in_review" })}' --json`
    );

    let exitCode = 0;
    let stdout = "";
    try {
      const result = await execAsync(
        `${CLI_PATH} array-item patch "${testEntityId}" "${entityType}" tasks_claimed claim_id ${seedKey} --item-json '${JSON.stringify({ status: "abandoned" })}' --expected-item-version "${staleVersion}" --json`
      );
      stdout = result.stdout;
    } catch (error) {
      const e = error as NodeJS.ErrnoException & { code?: number; stdout?: string };
      exitCode = typeof e.code === "number" ? e.code : 1;
      stdout = e.stdout ?? "";
    }

    expect(exitCode).toBeGreaterThan(0);
    const result = JSON.parse(stdout);
    expect(result.success).toBe(false);
    expect(result.status).toBe("conflict");
    expect(result.current_item).toMatchObject({ status: "in_review" });

    // Nothing was overwritten by the aborted attempt.
    const { stdout: afterJson } = await execAsync(
      `${CLI_PATH} entities get "${testEntityId}" --json`
    );
    const after = JSON.parse(afterJson);
    const rows = after.snapshot?.tasks_claimed as Array<Record<string, unknown>>;
    const row = rows.find((r) => r.claim_id === seedKey);
    expect(row).toMatchObject({ status: "in_review" });
  });

  it("fails without required positional arguments", async () => {
    let exitCode = 0;
    try {
      await execAsync(`${CLI_PATH} array-item patch "${testEntityId}" --json`);
    } catch (error) {
      const e = error as NodeJS.ErrnoException & { code?: number };
      exitCode = typeof e.code === "number" ? e.code : 1;
    }
    expect(exitCode).toBeGreaterThan(0);
  });

  it("rejects an object key before making the request", async () => {
    await expect(
      execAsync(
        `${CLI_PATH} array-item patch "${testEntityId}" "${entityType}" tasks_claimed claim_id '{"id":1}' --item-json '{}' --json`
      )
    ).rejects.toMatchObject({ code: 1 });
  });
});
