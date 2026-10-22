/**
 * Regression test for the commit-mode invariant in `storeStructuredForApi`
 * (#2493, #2471).
 *
 * Plan mode (`commit: false`) skips `storeRawContent` entirely, so
 * `storageResult` is null and `observationSourceId` is undefined by design.
 * The commit branch therefore guards that an observation is never written
 * without a traceable source: reaching it with `commit: true` and no resolved
 * source id throws "Internal invariant violated" instead of inserting an
 * orphan observation.
 *
 * That branch is unreachable through any real input (a healthy
 * `storeRawContent` always returns a source id), so the only way to exercise it
 * is to stub `storeRawContent` to resolve with no source id. This test does
 * that, and asserts BOTH that the call rejects with the invariant message AND
 * that nothing was written (the observation count for the user is unchanged),
 * so removing the guard turns it red either by the missing throw or by an
 * observation being written.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { randomUUID } from "node:crypto";

vi.mock("../../src/services/raw_storage.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/raw_storage.js")>();
  return {
    ...actual,
    storeRawContent: vi.fn(async () => ({
      sourceId: undefined,
      contentHash: "stubbed-no-source-id",
      storageUrl: "internal://stub",
      fileSize: 0,
      deduplicated: false,
    })),
  };
});

import { db } from "../../src/db.js";
import { storeStructuredForApi } from "../../src/actions.js";
import { cleanupAllTestData } from "../helpers/cleanup_helpers.js";

async function countRows(table: string, userId: string): Promise<number> {
  const { count, error } = await db
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new Error(`Failed to count ${table}: ${JSON.stringify(error)}`);
  return count ?? 0;
}

describe("storeStructuredForApi commit-mode invariant", () => {
  const userId = `test-user-commit-invariant-${randomUUID()}`;

  afterEach(async () => {
    const { data } = await db.from("entities").select("id").eq("user_id", userId);
    await cleanupAllTestData({ entityIds: (data ?? []).map((r: { id: string }) => r.id) });
  });

  it("commit:true with no resolved source id throws and writes no observation", async () => {
    const observationsBefore = await countRows("observations", userId);

    await expect(
      storeStructuredForApi({
        userId,
        entities: [{ entity_type: "plan_mode_test_note", title: `invariant ${randomUUID()}` }],
        sourcePriority: 100,
        idempotencyKey: `invariant-${randomUUID()}`,
        commit: true,
      })
    ).rejects.toThrow(/Internal invariant violated: commit=true but no source id was resolved/);

    expect(await countRows("observations", userId)).toBe(observationsBefore);
  });

  it("commit:false never consults storeRawContent, so the missing source id is not an error", async () => {
    const { storeRawContent } = await import("../../src/services/raw_storage.js");
    vi.mocked(storeRawContent).mockClear();

    const result = (await storeStructuredForApi({
      userId,
      entities: [{ entity_type: "plan_mode_test_note", title: `invariant plan ${randomUUID()}` }],
      sourcePriority: 100,
      idempotencyKey: `invariant-plan-${randomUUID()}`,
      commit: false,
    })) as { commit?: boolean; source_id?: unknown };

    expect(result.commit).toBe(false);
    expect(result.source_id).toBeNull();
    expect(storeRawContent).not.toHaveBeenCalled();
  });
});
