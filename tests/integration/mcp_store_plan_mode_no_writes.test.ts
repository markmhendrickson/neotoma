/**
 * Regression test: the MCP `store` tool's by-reference and inline-unstructured
 * legs must be genuinely side-effect-free under `commit: false`.
 *
 * `tests/cli/cli_store_plan_mode_no_writes.test.ts` (#2471) fixed and locked
 * down the REST/CLI path (src/actions.ts storeStructuredForApi /
 * storeUnstructuredForApi). The MCP `store` tool handler (src/server.ts
 * `NeotomaServer.store`) is a SEPARATE implementation — it does not call
 * either of those functions — so it stayed unfixed: PM review of PR #2471
 * round 2 (issue #2493 acceptance criteria) found `commit` was accepted as a
 * parameter but never consulted by the by-reference storage path
 * (`source_storage: "reference"`) or the final inline-unstructured fallback
 * path (`file_content`/`file_path` with no `entities`), so both persisted a
 * `sources` row (and, for by-reference, uploaded/derived an asset entity)
 * even when the caller asked for a dry run.
 *
 * This drives the MCP `store` tool itself (NeotomaServer.store, the same
 * dispatch surface `tools/call` routes into — see
 * tests/helpers/transport_parity_matrix.ts `callMcp`) with its natural call
 * shape, and asserts the EFFECT (a `sources` row count delta of zero), not
 * merely that `commit: false` was accepted — per task_policy
 * fixed_means_behavior_verified_not_contract_accepted (ent_db0b7855d47012084477fb00)
 * and cross_surface_contract_parity_tested_all_surfaces (ent_2ad0677fe23c0c1878ae43e8).
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { writeFile, mkdir, rm } from "fs/promises";
import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { config } from "../../src/config.js";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";
import { cleanupAllTestData } from "../helpers/cleanup_helpers.js";
import { createMinimalTestParquet, createTestParquetFile } from "../helpers/create_test_parquet.js";

const TEST_USER_ID = LOCAL_DEV_USER_ID;

function makeMcpServer(): NeotomaServer {
  const server = new NeotomaServer();
  (server as unknown as { authenticatedUserId: string }).authenticatedUserId = TEST_USER_ID;
  return server;
}

async function callStore(server: NeotomaServer, args: unknown): Promise<Record<string, unknown>> {
  const result = (await (
    server as unknown as {
      store: (a: unknown) => Promise<{ content: Array<{ type: string; text: string }> }>;
    }
  ).store(args)) as { content: Array<{ type: string; text: string }> };
  return JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
}

async function countSourcesForUser(userId: string): Promise<number> {
  const { count, error } = await db
    .from("sources")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new Error(`Failed to count sources: ${JSON.stringify(error)}`);
  return count ?? 0;
}

async function cleanupSourcesForUser(userId: string): Promise<void> {
  const { data: leftoverSources } = await db.from("sources").select("id").eq("user_id", userId);
  const leftoverIds = (leftoverSources ?? []).map((s: { id: string }) => s.id);
  if (leftoverIds.length > 0) {
    await db.from("observations").delete().in("source_id", leftoverIds);
    await db.from("sources").delete().in("id", leftoverIds);
  }
}

describe("MCP store tool: commit:false performs no source writes (by-reference + inline unstructured)", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `neotoma-mcp-plan-mode-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanupSourcesForUser(TEST_USER_ID);
  });

  describe("by-reference leg (source_storage: 'reference')", () => {
    it("commit:false leaves the sources table untouched and nulls source_id", async () => {
      const server = makeMcpServer();
      const before = await countSourcesForUser(TEST_USER_ID);

      const testFile = join(testDir, `mcp-plan-mode-reference-${randomUUID()}.txt`);
      await writeFile(testFile, `MCP plan mode by-reference probe ${randomUUID()}`);

      const result = await callStore(server, {
        idempotency_key: `mcp-plan-mode-reference-${randomUUID()}`,
        file_path: testFile,
        source_storage: "reference",
        commit: false,
      });

      expect(result.commit).toBe(false);
      expect(result.source_id).toBeNull();
      expect(result.storage_mode).toBe("reference");
      // `path`, not `reference_path`: must match the key this same leg's
      // committed (commit:true) branch uses below, not the REST/actions.ts
      // convention — a client toggling commit must see a stable key.
      expect(result.path).toBe(testFile);
      // mime_type omitted by the caller: must resolve from the extension the
      // same way storeRawReference does under commit:true, not echo undefined.
      expect(result.mime_type).toBe("text/plain");

      const after = await countSourcesForUser(TEST_USER_ID);
      expect(after - before).toBe(0);
    });

    it("commit:true (default) uses the same 'path' key — control case proving parity across commit values", async () => {
      const server = makeMcpServer();

      const testFile = join(testDir, `mcp-commit-true-reference-${randomUUID()}.txt`);
      await writeFile(testFile, `MCP commit:true by-reference control probe ${randomUUID()}`);

      const result = await callStore(server, {
        idempotency_key: `mcp-commit-true-reference-${randomUUID()}`,
        file_path: testFile,
        source_storage: "reference",
      });

      expect(result.source_id).toBeTruthy();
      expect(result.path).toBe(testFile);
      expect(result.mime_type).toBe("text/plain");
    });
  });

  describe("inline unstructured leg (file_content, no entities)", () => {
    it("commit:false leaves the sources table untouched and nulls source_id", async () => {
      const server = makeMcpServer();
      const before = await countSourcesForUser(TEST_USER_ID);

      const content = `MCP plan mode inline probe ${randomUUID()}`;

      const result = await callStore(server, {
        idempotency_key: `mcp-plan-mode-inline-${randomUUID()}`,
        file_content: Buffer.from(content, "utf-8").toString("base64"),
        mime_type: "text/plain",
        original_filename: "mcp-plan-mode-inline-probe.txt",
        commit: false,
      });

      expect(result.commit).toBe(false);
      expect(result.source_id).toBeNull();
      expect(result.entities_created).toBe(0);
      expect(result.observations_created).toBe(0);

      const after = await countSourcesForUser(TEST_USER_ID);
      expect(after - before).toBe(0);
    });

    it("commit:true (default) still writes — control case proving the assertion above is not vacuous", async () => {
      const server = makeMcpServer();
      const before = await countSourcesForUser(TEST_USER_ID);

      const content = `MCP commit:true control probe ${randomUUID()}`;

      const result = await callStore(server, {
        idempotency_key: `mcp-commit-true-inline-${randomUUID()}`,
        file_content: Buffer.from(content, "utf-8").toString("base64"),
        mime_type: "text/plain",
        original_filename: "mcp-commit-true-probe.txt",
      });

      expect(result.source_id).toBeTruthy();

      const after = await countSourcesForUser(TEST_USER_ID);
      expect(after - before).toBe(1);
    });
  });

  describe("parquet ingest leg", () => {
    it("commit:false plans parquet entities without creating observations", async () => {
      const server = makeMcpServer();
      const parquetPath = join(testDir, `mcp_plan_${randomUUID()}.parquet`);
      await createMinimalTestParquet(parquetPath);
      const observationsBefore = await db
        .from("observations")
        .select("*", { count: "exact", head: true })
        .eq("user_id", TEST_USER_ID);
      if (observationsBefore.error) throw observationsBefore.error;
      const entitiesBefore = await db
        .from("entities")
        .select("*", { count: "exact", head: true })
        .eq("user_id", TEST_USER_ID);
      if (entitiesBefore.error) throw entitiesBefore.error;

      const result = await callStore(server, {
        idempotency_key: `mcp-plan-mode-parquet-${randomUUID()}`,
        file_path: parquetPath,
        commit: false,
      });

      expect(result.commit).toBe(false);
      expect(Array.isArray(result.entities)).toBe(true);
      const observationsAfter = await db
        .from("observations")
        .select("*", { count: "exact", head: true })
        .eq("user_id", TEST_USER_ID);
      if (observationsAfter.error) throw observationsAfter.error;
      const entitiesAfter = await db
        .from("entities")
        .select("*", { count: "exact", head: true })
        .eq("user_id", TEST_USER_ID);
      if (entitiesAfter.error) throw entitiesAfter.error;
      expect((observationsAfter.count ?? 0) - (observationsBefore.count ?? 0)).toBe(0);
      expect((entitiesAfter.count ?? 0) - (entitiesBefore.count ?? 0)).toBe(0);
    });
  });

  describe("overflow intake leg", () => {
    it("commit:false returns a plan receipt without creating the overflow sink", async () => {
      const server = makeMcpServer();
      const sinkPath = join(testDir, `overflow-${randomUUID()}.jsonl`);
      const previousSink = process.env.NEOTOMA_OVERFLOW_SINK;
      process.env.NEOTOMA_OVERFLOW_SINK = sinkPath;

      try {
        const result = await callStore(server, {
          intake: { mode: "overflow", reason: "plan-mode regression" },
          entities: [{ entity_type: "note", title: "must not be written" }],
          commit: false,
        });

        expect(result).toMatchObject({ commit: false, overflowed: false });
        expect(existsSync(sinkPath)).toBe(false);
      } finally {
        if (previousSink === undefined) delete process.env.NEOTOMA_OVERFLOW_SINK;
        else process.env.NEOTOMA_OVERFLOW_SINK = previousSink;
        await rm(sinkPath, { force: true });
      }
    });

    it("commit:true (default) still appends to the overflow sink", async () => {
      const server = makeMcpServer();
      const sinkPath = join(testDir, `overflow-${randomUUID()}.jsonl`);
      const previousSink = process.env.NEOTOMA_OVERFLOW_SINK;
      process.env.NEOTOMA_OVERFLOW_SINK = sinkPath;

      try {
        const result = await callStore(server, {
          intake: { mode: "overflow", reason: "committed control" },
          entities: [{ entity_type: "note", title: "control write" }],
        });

        expect(result.overflowed).toBe(true);
        expect(existsSync(sinkPath)).toBe(true);
      } finally {
        if (previousSink === undefined) delete process.env.NEOTOMA_OVERFLOW_SINK;
        else process.env.NEOTOMA_OVERFLOW_SINK = previousSink;
        await rm(sinkPath, { force: true });
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Effect-level coverage for the legs the tests above do not reach (#2493,
// #2471 review round 3): combined entities + file, entities-only, parquet
// commit:true control, and malformed `commit` values.
//
// Every test below runs as its OWN unique user, so row counts and the per-user
// raw-storage directory are hermetic: no other suite writing to the shared
// vitest DB under the default local user can move them, and a leftover from an
// earlier (or pre-fix) run cannot turn them red. NEOTOMA_TEST_REAL_STORAGE=1
// is set for the duration so the raw-storage upload path actually runs (it is
// skipped under NODE_ENV=test otherwise) and the FILE-count assertion can fail
// on the thing it watches; the MCP server runs in this process, so the flag is
// read live by storeRawContent / storeRawReference.
// ---------------------------------------------------------------------------

type EffectCounts = { sources: number; observations: number; entities: number; files: number };

async function countRows(table: string, userId: string): Promise<number> {
  const { count, error } = await db
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new Error(`Failed to count ${table}: ${JSON.stringify(error)}`);
  return count ?? 0;
}

function perUserStorageDir(userId: string): string {
  return join(config.rawStorageDir, userId);
}

function countStoredFiles(userId: string): number {
  const dir = perUserStorageDir(userId);
  return existsSync(dir) ? readdirSync(dir).length : 0;
}

async function effectCounts(userId: string): Promise<EffectCounts> {
  return {
    sources: await countRows("sources", userId),
    observations: await countRows("observations", userId),
    entities: await countRows("entities", userId),
    files: countStoredFiles(userId),
  };
}

function delta(before: EffectCounts, after: EffectCounts): EffectCounts {
  return {
    sources: after.sources - before.sources,
    observations: after.observations - before.observations,
    entities: after.entities - before.entities,
    files: after.files - before.files,
  };
}

const NO_WRITES: EffectCounts = { sources: 0, observations: 0, entities: 0, files: 0 };

async function cleanupUser(userId: string): Promise<void> {
  const { data: entityRows } = await db.from("entities").select("id").eq("user_id", userId);
  const { data: sourceRows } = await db.from("sources").select("id").eq("user_id", userId);
  await cleanupAllTestData({
    entityIds: (entityRows ?? []).map((r: { id: string }) => r.id),
    sourceIds: (sourceRows ?? []).map((r: { id: string }) => r.id),
  });
  await rm(perUserStorageDir(userId), { recursive: true, force: true });
}

describe("MCP store tool: effect-level plan mode for combined, entities-only, parquet and malformed commit", () => {
  const originalRealStorage = process.env.NEOTOMA_TEST_REAL_STORAGE;
  let testDir: string;
  let userId: string;
  let server: NeotomaServer;

  beforeAll(async () => {
    process.env.NEOTOMA_TEST_REAL_STORAGE = "1";
    testDir = join(tmpdir(), `neotoma-mcp-plan-mode-effects-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
  });

  beforeEach(() => {
    userId = randomUUID();
    server = makeMcpServer();
    (server as unknown as { authenticatedUserId: string }).authenticatedUserId = userId;
  });

  afterEach(async () => {
    await cleanupUser(userId);
  });

  afterAll(async () => {
    if (originalRealStorage === undefined) delete process.env.NEOTOMA_TEST_REAL_STORAGE;
    else process.env.NEOTOMA_TEST_REAL_STORAGE = originalRealStorage;
    await rm(testDir, { recursive: true, force: true });
  });

  function entity(label: string): Record<string, unknown> {
    return { entity_type: "plan_mode_test_note", title: `${label} ${randomUUID()}` };
  }

  // The two `commit: parsed.commit` hunks in NeotomaServer.store (src/server.ts)
  // that forward `commit` to the recursive file-leg call each serve one of
  // these interpretation modes: `source_ref: "unstructured"` stores the file
  // FIRST (before the structured leg); with no interpretation the file leg
  // runs AFTER the structured leg. Reference mode exercises the same two
  // hunks with the by-reference storage branch on the file leg.
  const COMBINED_VARIANTS: Array<{
    name: string;
    fileArgs: () => Promise<Record<string, unknown>>;
    interpretation?: Record<string, unknown>;
    byReference?: boolean;
  }> = [
    {
      name: "inline file, interpretation.source_ref='unstructured' (file leg runs first)",
      interpretation: { source_ref: "unstructured" },
      fileArgs: async () => ({
        file_content: Buffer.from(`combined inline first ${randomUUID()}`).toString("base64"),
        mime_type: "text/plain",
        original_filename: "combined-first.txt",
      }),
    },
    {
      name: "inline file, no interpretation (file leg runs after the structured leg)",
      fileArgs: async () => ({
        file_content: Buffer.from(`combined inline after ${randomUUID()}`).toString("base64"),
        mime_type: "text/plain",
        original_filename: "combined-after.txt",
      }),
    },
    {
      name: "by-reference file, no interpretation",
      byReference: true,
      fileArgs: async () => {
        const file = join(testDir, `combined-reference-${randomUUID()}.txt`);
        await writeFile(file, `combined reference ${randomUUID()}`);
        return { file_path: file, source_storage: "reference" };
      },
    },
  ];

  describe.each(COMBINED_VARIANTS)("combined entities + file: $name", (variant) => {
    it("commit:false writes nothing: zero sources/observations/entities/files, both legs report source_id null", async () => {
      const before = await effectCounts(userId);

      const result = await callStore(server, {
        idempotency_key: `mcp-plan-combined-${randomUUID()}`,
        entities: [entity("combined plan")],
        ...(variant.interpretation ? { interpretation: variant.interpretation } : {}),
        ...(await variant.fileArgs()),
        commit: false,
      });

      const structured = result.structured as Record<string, unknown>;
      const unstructured = result.unstructured as Record<string, unknown>;
      expect(structured?.commit).toBe(false);
      expect(unstructured?.commit).toBe(false);
      expect(unstructured?.source_id).toBeNull();

      expect(delta(before, await effectCounts(userId))).toEqual(NO_WRITES);
    });

    it("commit:true control writes a source, an observation, an entity and (inline) a stored file", async () => {
      const before = await effectCounts(userId);

      const result = await callStore(server, {
        idempotency_key: `mcp-commit-combined-${randomUUID()}`,
        entities: [entity("combined commit")],
        ...(variant.interpretation ? { interpretation: variant.interpretation } : {}),
        ...(await variant.fileArgs()),
      });

      const unstructured = result.unstructured as Record<string, unknown>;
      expect(typeof unstructured?.source_id).toBe("string");

      const d = delta(before, await effectCounts(userId));
      expect(d.sources).toBeGreaterThanOrEqual(1);
      expect(d.observations).toBeGreaterThanOrEqual(1);
      expect(d.entities).toBeGreaterThanOrEqual(1);
      // By-reference stores a pointer, not a copy of the bytes.
      if (!variant.byReference) {
        expect(d.files).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe("entities-only (the MCP structured leg's own `commit` option)", () => {
    it("commit:false writes nothing", async () => {
      const before = await effectCounts(userId);

      const result = await callStore(server, {
        idempotency_key: `mcp-plan-entities-${randomUUID()}`,
        entities: [entity("entities-only plan")],
        commit: false,
      });

      expect(result.commit).toBe(false);
      expect(delta(before, await effectCounts(userId))).toEqual(NO_WRITES);
    });

    it("commit:true control writes a source, an observation, an entity and a stored file", async () => {
      const before = await effectCounts(userId);

      await callStore(server, {
        idempotency_key: `mcp-commit-entities-${randomUUID()}`,
        entities: [entity("entities-only commit")],
      });

      const d = delta(before, await effectCounts(userId));
      expect(d.sources).toBeGreaterThanOrEqual(1);
      expect(d.observations).toBeGreaterThanOrEqual(1);
      expect(d.entities).toBeGreaterThanOrEqual(1);
      expect(d.files).toBeGreaterThanOrEqual(1);
    });
  });

  describe("parquet ingest leg: commit:true control", () => {
    it("commit:true writes observations and entities (unique content, so it is not deduplicated away)", async () => {
      const parquetPath = join(testDir, `mcp_commit_${randomUUID()}.parquet`);
      await createTestParquetFile({
        outputPath: parquetPath,
        rows: [
          {
            id: BigInt(Date.now()),
            name: `Parquet commit control ${randomUUID()}`,
            amount: 1.5,
            count: BigInt(7),
            timestamp: BigInt(1000000),
          },
        ],
      });
      const before = await effectCounts(userId);

      const result = await callStore(server, {
        idempotency_key: `mcp-commit-parquet-${randomUUID()}`,
        file_path: parquetPath,
      });

      expect(result.commit).not.toBe(false);
      const d = delta(before, await effectCounts(userId));
      expect(d.observations).toBeGreaterThanOrEqual(1);
      expect(d.entities).toBeGreaterThanOrEqual(1);
    });
  });

  describe("malformed `commit` values are rejected, never coerced into a write", () => {
    it.each([
      ["string 'false'", "false"],
      ["number 0", 0],
      ["null", null],
    ])("commit = %s is rejected and writes nothing", async (_label, badCommit) => {
      const before = await effectCounts(userId);

      await expect(
        callStore(server, {
          idempotency_key: `mcp-bad-commit-${randomUUID()}`,
          entities: [entity("malformed commit")],
          file_content: Buffer.from(`malformed commit ${randomUUID()}`).toString("base64"),
          mime_type: "text/plain",
          commit: badCommit,
        })
      ).rejects.toThrow();

      expect(delta(before, await effectCounts(userId))).toEqual(NO_WRITES);
    });
  });
});
