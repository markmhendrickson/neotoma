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

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { LOCAL_DEV_USER_ID } from "../../src/services/local_auth.js";

const TEST_USER_ID = LOCAL_DEV_USER_ID;

function makeMcpServer(): NeotomaServer {
  const server = new NeotomaServer();
  (server as unknown as { authenticatedUserId: string }).authenticatedUserId = TEST_USER_ID;
  return server;
}

async function callStore(
  server: NeotomaServer,
  args: unknown
): Promise<Record<string, unknown>> {
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
});
