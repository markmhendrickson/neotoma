import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { TestIdTracker } from "../helpers/cleanup_helpers.js";

const execAsync = promisify(exec);
const CLI_PATH = "node dist/cli/index.js";
const TEST_USER_ID = "test-user-cli-recent-ingest";

describe("CLI recent and ingest commands", () => {
  const tracker = new TestIdTracker();
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `neotoma-cli-recent-ingest-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await tracker.cleanup();
  });

  describe("recent", () => {
    it("returns JSON with items array and record metadata", async () => {
      const { stdout, stderr } = await execAsync(
        `${CLI_PATH} recent --limit 5 --json --user-id "${TEST_USER_ID}"`
      );
      expect(stderr.replace(/Saved repo path[^\n]*\n?/g, "").trim()).toBe("");
      const result = JSON.parse(stdout) as {
        items: Array<{ record_type: string; id: string; activity_at: string }>;
        limit: number;
      };
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.limit).toBe(5);
      if (result.items.length > 0) {
        const first = result.items[0];
        expect(first).toHaveProperty("record_type");
        expect(first).toHaveProperty("id");
        expect(first).toHaveProperty("activity_at");
      }
    });
  });

  describe("ingest", () => {
    it("accepts --plan with flat entities JSON and source file", async () => {
      const entitiesPath = join(testDir, "ingest-entities.json");
      const sourcePath = join(testDir, "ingest-source.txt");
      await writeFile(
        entitiesPath,
        JSON.stringify([
          {
            entity_type: "note",
            schema_version: "1.0",
            title: "CLI ingest plan test",
            content: "body",
          },
        ])
      );
      await writeFile(sourcePath, "provenance-bytes");

      const idem = `cli-ingest-plan-${randomUUID()}`;
      const { stdout, stderr } = await execAsync(
        `${CLI_PATH} ingest --entities "${entitiesPath}" --source-file "${sourcePath}" --plan --json --user-id "${TEST_USER_ID}" --idempotency-key "${idem}" --file-idempotency-key "${idem}-file"`
      );
      expect(stderr.replace(/Saved repo path[^\n]*\n?/g, "").trim()).toBe("");
      const result = JSON.parse(stdout) as {
        ingest_report?: { mode: string; entities_total: number };
        structured?: { entities?: unknown[] };
        unstructured?: { source_id?: string };
      };
      expect(result.ingest_report?.mode).toBe("plan");
      expect(Array.isArray(result.structured?.entities)).toBe(true);
      const entities = result.structured?.entities ?? [];
      expect(entities.length).toBeGreaterThan(0);
      if (result.unstructured?.source_id) {
        tracker.trackSource(result.unstructured.source_id);
      }
    });
  });
});
