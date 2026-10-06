/**
 * Regression test: `neotoma store --plan` (and its `--dry-run` alias) must be
 * genuinely side-effect-free.
 *
 * Before the fix, `commit: false` (sent when `--plan`/`--dry-run` is passed)
 * only gated which fields the /store response exposed (`source_id: commit ?
 * storageResult.sourceId : null`). The underlying write — `storeRawContent()`,
 * which inserts a `sources` row and (outside the test-storage skip) uploads
 * the raw bytes to `<data_dir>/sources[_prod]/<user_id>/<content_hash>` — ran
 * unconditionally, before `commit` was ever consulted. A caller previewing a
 * store therefore left behind a persisted source row and raw file despite the
 * response claiming `commit: false` / `entities_created: 0`.
 *
 * This covers both payload shapes the CLI's `store` command accepts, since
 * each takes a separate code path to the same defect:
 *   - structured (`--entities`): src/actions.ts storeStructuredForApi ->
 *     storeRawContent, called unconditionally before the `commit` gate.
 *   - unstructured (`--file-path`): src/actions.ts handleStorePost ->
 *     storeUnstructuredFromRequest -> storeUnstructuredForApi ->
 *     storeRawContent, with NO `commit` check anywhere in that call chain.
 *
 * `ingest` (entities + source file, the combined shape) is the second CLI
 * command carrying the same `--plan`/`--dry-run` -> `commit: false` mapping, and
 * #2493 requires its own regression test; it is covered by the "CLI end-to-end:
 * ingest" block below, with a commit-mode control.
 *
 * Two kinds of assertion:
 *  1. CLI end-to-end (`execAsync` against the real dist/cli), checking a
 *     `sources` row COUNT DELTA (not an absolute count, since the shared
 *     vitest DB accumulates rows from other suites) and the response's
 *     `source_id`/`commit` fields.
 *  2. Direct in-process calls to storeStructuredForApi / storeUnstructuredForApi
 *     (the same functions the HTTP layer calls) with
 *     `NEOTOMA_TEST_REAL_STORAGE=1` set for the duration of the call, so the
 *     upload path in storeRawContent actually runs instead of being skipped
 *     under NODE_ENV=test (see src/services/raw_storage.ts). This has to run
 *     in-process rather than via the CLI subprocess: storeRawContent reads
 *     process.env.NEOTOMA_TEST_REAL_STORAGE live inside the SERVER process,
 *     which vitest.global_setup.ts starts once, before any test file (and
 *     therefore before any env var a CLI-subprocess test could set) runs. A
 *     first version of this test set the env var only on the CLI child
 *     process and it passed unconditionally regardless of the fix — a
 *     vacuous check caught by re-running with NEOTOMA_TEST_REAL_STORAGE=1 set
 *     for the whole vitest invocation, which turned it red pre-fix as
 *     expected. Calling the functions directly closes that gap without
 *     restructuring the shared test server.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync, readdirSync } from "fs";
import { db } from "../../src/db.js";
import { resolveLocalSourceFilePath } from "../../src/services/raw_storage.js";
import { storeStructuredForApi, storeUnstructuredForApi } from "../../src/actions.js";
import { cleanupAllTestData } from "../helpers/cleanup_helpers.js";

const execAsync = promisify(exec);

const CLI_PATH = "node dist/cli/index.js";
const TEST_USER_ID = "test-user-cli-store-plan-mode";

async function countSourcesForUser(userId: string): Promise<number> {
  const { count, error } = await db
    .from("sources")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new Error(`Failed to count sources: ${JSON.stringify(error)}`);
  return count ?? 0;
}

async function countRowsForUser(table: string, userId: string): Promise<number> {
  const { count, error } = await db
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new Error(`Failed to count ${table}: ${JSON.stringify(error)}`);
  return count ?? 0;
}

/** Per-user raw-storage directory (`<rawStorageDir>/<user_id>/`) a real upload would use. */
function perUserStorageDir(userId: string): string {
  return join(resolveLocalSourceFilePath(`${userId}/placeholder`) as string, "..");
}

function countStoredFiles(userId: string): number {
  const dir = perUserStorageDir(userId);
  return existsSync(dir) ? readdirSync(dir).length : 0;
}

async function cleanupAllForUser(userId: string): Promise<void> {
  const { data: entityRows } = await db.from("entities").select("id").eq("user_id", userId);
  const { data: sourceRows } = await db.from("sources").select("id").eq("user_id", userId);
  await cleanupAllTestData({
    entityIds: (entityRows ?? []).map((r: { id: string }) => r.id),
    sourceIds: (sourceRows ?? []).map((r: { id: string }) => r.id),
  });
  await rm(perUserStorageDir(userId), { recursive: true, force: true });
}

async function cleanupSourcesForUser(userId: string): Promise<void> {
  const { data: leftoverSources } = await db.from("sources").select("id").eq("user_id", userId);
  const leftoverIds = (leftoverSources ?? []).map((s: { id: string }) => s.id);
  if (leftoverIds.length > 0) {
    await db.from("observations").delete().in("source_id", leftoverIds);
    await db.from("sources").delete().in("id", leftoverIds);
  }
}

describe("store --plan / --dry-run perform no source writes (structured + unstructured)", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `neotoma-cli-plan-mode-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Best-effort: delete anything this suite might have left behind (either
    // because the fix is not yet applied, or because of an assertion failure
    // mid-test) so runs stay isolated from each other.
    await cleanupSourcesForUser(TEST_USER_ID);
  });

  describe("CLI end-to-end: structured payload (--entities)", () => {
    it("--plan leaves the sources table untouched and nulls source_id", async () => {
      const before = await countSourcesForUser(TEST_USER_ID);

      const entitiesJson = JSON.stringify([
        {
          entity_type: "plan_mode_test_note",
          title: `Plan mode structured probe ${randomUUID()}`,
        },
      ]).replace(/"/g, '\\"');

      const { stdout } = await execAsync(
        `${CLI_PATH} store --entities "${entitiesJson}" --user-id "${TEST_USER_ID}" --plan --json`
      );
      const result = JSON.parse(stdout);
      expect(result.commit).toBe(false);
      expect(result.source_id).toBeNull();

      const after = await countSourcesForUser(TEST_USER_ID);
      expect(after - before).toBe(0);
    });

    it("--dry-run (alias) leaves the sources table untouched", async () => {
      const before = await countSourcesForUser(TEST_USER_ID);

      const entitiesJson = JSON.stringify([
        {
          entity_type: "plan_mode_test_note",
          title: `Dry-run structured probe ${randomUUID()}`,
        },
      ]).replace(/"/g, '\\"');

      const { stdout } = await execAsync(
        `${CLI_PATH} store --entities "${entitiesJson}" --user-id "${TEST_USER_ID}" --dry-run --json`
      );
      const result = JSON.parse(stdout);
      expect(result.commit).toBe(false);

      const after = await countSourcesForUser(TEST_USER_ID);
      expect(after - before).toBe(0);
    });
  });

  describe("CLI end-to-end: unstructured payload (--file-path)", () => {
    it("--plan leaves the sources table untouched and nulls source_id", async () => {
      const before = await countSourcesForUser(TEST_USER_ID);

      const testFile = join(testDir, `plan-mode-unstructured-${randomUUID()}.txt`);
      await writeFile(testFile, `Plan mode unstructured probe ${randomUUID()}`);

      const { stdout } = await execAsync(
        `${CLI_PATH} store --file-path "${testFile}" --user-id "${TEST_USER_ID}" --plan --json`
      );
      const result = JSON.parse(stdout);
      expect(result.commit).toBe(false);
      expect(result.source_id).toBeNull();
      expect(result.entities_created).toBe(0);
      expect(result.observations_created).toBe(0);

      const after = await countSourcesForUser(TEST_USER_ID);
      expect(after - before).toBe(0);
    });

    it("--dry-run (alias) leaves the sources table untouched", async () => {
      const before = await countSourcesForUser(TEST_USER_ID);

      const testFile = join(testDir, `dry-run-unstructured-${randomUUID()}.txt`);
      await writeFile(testFile, `Dry-run unstructured probe ${randomUUID()}`);

      const { stdout } = await execAsync(
        `${CLI_PATH} store --file-path "${testFile}" --user-id "${TEST_USER_ID}" --dry-run --json`
      );
      const result = JSON.parse(stdout);
      expect(result.commit).toBe(false);
      expect(result.source_id).toBeNull();

      const after = await countSourcesForUser(TEST_USER_ID);
      expect(after - before).toBe(0);
    });
  });

  describe("CLI end-to-end: ingest (entities + source file, the combined shape)", () => {
    // A unique user per test keeps the sources/observations/entities deltas
    // hermetic: nothing else writing to the shared vitest DB can move them.
    let ingestUserId: string;

    beforeEach(() => {
      ingestUserId = `test-user-cli-ingest-plan-${randomUUID()}`;
    });

    afterEach(async () => {
      await cleanupAllForUser(ingestUserId);
    });

    async function writeIngestInputs(): Promise<{ entitiesPath: string; sourcePath: string }> {
      const entitiesPath = join(testDir, `ingest-entities-${randomUUID()}.json`);
      const sourcePath = join(testDir, `ingest-source-${randomUUID()}.txt`);
      await writeFile(
        entitiesPath,
        JSON.stringify([
          {
            entity_type: "plan_mode_test_note",
            title: `Ingest plan probe ${randomUUID()}`,
          },
        ])
      );
      await writeFile(sourcePath, `ingest provenance bytes ${randomUUID()}`);
      return { entitiesPath, sourcePath };
    }

    it.each(["--plan", "--dry-run"])(
      "ingest %s writes no source, observation or entity, and reports source_id null on both legs",
      async (flag) => {
        const { entitiesPath, sourcePath } = await writeIngestInputs();
        const before = {
          sources: await countRowsForUser("sources", ingestUserId),
          observations: await countRowsForUser("observations", ingestUserId),
          entities: await countRowsForUser("entities", ingestUserId),
        };

        const { stdout } = await execAsync(
          `${CLI_PATH} ingest --entities "${entitiesPath}" --source-file "${sourcePath}" ${flag} --json --user-id "${ingestUserId}"`
        );
        const result = JSON.parse(stdout) as {
          ingest_report?: { mode?: string };
          structured?: { commit?: boolean; source_id?: unknown };
          unstructured?: { commit?: boolean; source_id?: unknown };
        };
        expect(result.ingest_report?.mode).toBe("plan");
        expect(result.structured?.commit).toBe(false);
        expect(result.structured?.source_id).toBeNull();
        expect(result.unstructured?.commit).toBe(false);
        expect(result.unstructured?.source_id).toBeNull();

        expect(await countRowsForUser("sources", ingestUserId)).toBe(before.sources);
        expect(await countRowsForUser("observations", ingestUserId)).toBe(before.observations);
        expect(await countRowsForUser("entities", ingestUserId)).toBe(before.entities);
      }
    );

    it("ingest without --plan (control) writes a source, an observation and an entity", async () => {
      const { entitiesPath, sourcePath } = await writeIngestInputs();
      const before = {
        sources: await countRowsForUser("sources", ingestUserId),
        observations: await countRowsForUser("observations", ingestUserId),
        entities: await countRowsForUser("entities", ingestUserId),
      };

      const { stdout } = await execAsync(
        `${CLI_PATH} ingest --entities "${entitiesPath}" --source-file "${sourcePath}" --json --user-id "${ingestUserId}"`
      );
      const result = JSON.parse(stdout) as {
        ingest_report?: { mode?: string };
        unstructured?: { source_id?: unknown };
      };
      expect(result.ingest_report?.mode).toBe("commit");
      expect(typeof result.unstructured?.source_id).toBe("string");

      expect(await countRowsForUser("sources", ingestUserId)).toBeGreaterThan(before.sources);
      expect(await countRowsForUser("observations", ingestUserId)).toBeGreaterThan(
        before.observations
      );
      expect(await countRowsForUser("entities", ingestUserId)).toBeGreaterThan(before.entities);
    });
  });

  describe("direct call: no raw-storage file written under plan mode (commit: false)", () => {
    const originalRealStorageFlag = process.env.NEOTOMA_TEST_REAL_STORAGE;
    // Unique per test, so the per-user storage directory these calls would use
    // cannot hold a leftover from an earlier (or pre-fix) run: the "no file
    // written" assertion fails only if THIS call wrote one.
    let directUserId: string;

    beforeEach(async () => {
      directUserId = `test-user-direct-store-plan-mode-${randomUUID()}`;
      await rm(perUserStorageDir(directUserId), { recursive: true, force: true });
    });

    afterEach(async () => {
      if (originalRealStorageFlag === undefined) {
        delete process.env.NEOTOMA_TEST_REAL_STORAGE;
      } else {
        process.env.NEOTOMA_TEST_REAL_STORAGE = originalRealStorageFlag;
      }
      await cleanupAllForUser(directUserId);
    });

    it("structured payload: storeStructuredForApi(commit: false) writes no file to local storage", async () => {
      process.env.NEOTOMA_TEST_REAL_STORAGE = "1";
      const filesBefore = countStoredFiles(directUserId);

      const idempotencyKey = `plan-mode-direct-structured-${randomUUID()}`;
      await storeStructuredForApi({
        userId: directUserId,
        entities: [
          {
            entity_type: "plan_mode_test_note",
            title: `Direct plan mode probe ${randomUUID()}`,
          },
        ],
        sourcePriority: 100,
        idempotencyKey,
        commit: false,
      });

      expect(await countSourcesForUser(directUserId)).toBe(0);
      expect(countStoredFiles(directUserId) - filesBefore).toBe(0);
      expect(existsSync(perUserStorageDir(directUserId))).toBe(false);
    });

    it("structured payload: storeStructuredForApi(commit: true) control writes a source row and a file", async () => {
      process.env.NEOTOMA_TEST_REAL_STORAGE = "1";
      const filesBefore = countStoredFiles(directUserId);

      const result = (await storeStructuredForApi({
        userId: directUserId,
        entities: [
          {
            entity_type: "plan_mode_test_note",
            title: `Direct commit control probe ${randomUUID()}`,
          },
        ],
        sourcePriority: 100,
        idempotencyKey: `commit-direct-structured-${randomUUID()}`,
        commit: true,
      })) as { source_id?: unknown };

      expect(typeof result.source_id).toBe("string");
      expect(await countSourcesForUser(directUserId)).toBe(1);
      expect(countStoredFiles(directUserId) - filesBefore).toBe(1);
    });

    it("unstructured payload: storeUnstructuredForApi(commit: false) writes no file to local storage", async () => {
      process.env.NEOTOMA_TEST_REAL_STORAGE = "1";
      const filesBefore = countStoredFiles(directUserId);

      const content = `Direct unstructured plan mode probe ${randomUUID()}`;
      const idempotencyKey = `plan-mode-direct-unstructured-${randomUUID()}`;

      const result = await storeUnstructuredForApi({
        userId: directUserId,
        fileBuffer: Buffer.from(content, "utf-8"),
        mimeType: "text/plain",
        originalFilename: "plan-mode-direct-probe.txt",
        idempotencyKey,
        commit: false,
      });

      expect((result as { commit?: boolean }).commit).toBe(false);
      expect((result as { source_id: unknown }).source_id).toBeNull();

      expect(await countSourcesForUser(directUserId)).toBe(0);
      expect(countStoredFiles(directUserId) - filesBefore).toBe(0);
    });

    it("unstructured payload: storeUnstructuredForApi(commit: true) control writes a source row and a file", async () => {
      process.env.NEOTOMA_TEST_REAL_STORAGE = "1";
      const filesBefore = countStoredFiles(directUserId);

      const result = (await storeUnstructuredForApi({
        userId: directUserId,
        fileBuffer: Buffer.from(`Direct unstructured commit control ${randomUUID()}`, "utf-8"),
        mimeType: "text/plain",
        originalFilename: "commit-direct-probe.txt",
        idempotencyKey: `commit-direct-unstructured-${randomUUID()}`,
      })) as { source_id?: unknown };

      expect(typeof result.source_id).toBe("string");
      expect(await countSourcesForUser(directUserId)).toBe(1);
      expect(countStoredFiles(directUserId) - filesBefore).toBe(1);
    });
  });
});
