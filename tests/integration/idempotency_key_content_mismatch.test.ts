/**
 * Regression test for GitHub issue #186:
 * Idempotency key reused with different content should produce a clear error,
 * not silently succeed while skipping the write.
 */

import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/db.js";
import { storeStructuredForApi } from "../../src/actions.js";
import { NeotomaServer } from "../../src/server.js";

const TEST_USER_ID = "00000000-0000-4000-8000-000000000099";
const ENTITY_TYPE = "idempotency_mismatch_test_note";

async function cleanup() {
  const { data: observations } = await db
    .from("observations")
    .select("entity_id, source_id")
    .eq("user_id", TEST_USER_ID);
  const entityIds = Array.from(
    new Set((observations ?? []).map((obs: { entity_id: string }) => obs.entity_id).filter(Boolean))
  );
  const sourceIds = Array.from(
    new Set((observations ?? []).map((obs: { source_id: string }) => obs.source_id).filter(Boolean))
  );

  await db.from("timeline_events").delete().eq("user_id", TEST_USER_ID);
  if (entityIds.length > 0) {
    await db.from("entity_snapshots").delete().in("entity_id", entityIds);
  }
  await db.from("observations").delete().eq("user_id", TEST_USER_ID);
  if (sourceIds.length > 0) {
    await db.from("raw_fragments").delete().in("source_id", sourceIds);
    await db.from("sources").delete().in("id", sourceIds);
  }
  if (entityIds.length > 0) {
    await db.from("entities").delete().in("id", entityIds);
  }
}

describe("Idempotency key reuse with different content (issue #186)", () => {
  afterEach(cleanup);

  describe("storeStructuredForApi (HTTP API path)", () => {
    it("returns replayed:true when same idempotency_key is reused with identical content", async () => {
      const key = `replay-same-${randomUUID()}`;
      const entities = [
        {
          entity_type: ENTITY_TYPE,
          title: "Original entity",
          description: "First write",
        },
      ];

      const first = await storeStructuredForApi({
        userId: TEST_USER_ID,
        entities,
        sourcePriority: 100,
        idempotencyKey: key,
      });
      expect(first.replayed).toBeFalsy();
      expect(first.entities.length).toBe(1);

      // Second call with identical payload — should replay successfully
      const second = await storeStructuredForApi({
        userId: TEST_USER_ID,
        entities,
        sourcePriority: 100,
        idempotencyKey: key,
      });
      expect(second.replayed).toBe(true);
      expect(second.entities.length).toBe(1);
      expect(second.entities[0].entity_id).toBe(first.entities[0].entity_id);
    });

    it("throws ERR_IDEMPOTENCY_MISMATCH when same key is reused with different content", async () => {
      const key = `replay-diff-${randomUUID()}`;

      const firstEntities = [
        {
          entity_type: ENTITY_TYPE,
          title: "Original entity",
          description: "First write",
        },
      ];
      const secondEntities = [
        {
          entity_type: ENTITY_TYPE,
          title: "Different entity",
          description: "This has different content",
        },
      ];

      // Store the first payload
      await storeStructuredForApi({
        userId: TEST_USER_ID,
        entities: firstEntities,
        sourcePriority: 100,
        idempotencyKey: key,
      });

      // Attempt to reuse the same key with different content — must throw
      await expect(
        storeStructuredForApi({
          userId: TEST_USER_ID,
          entities: secondEntities,
          sourcePriority: 100,
          idempotencyKey: key,
        })
      ).rejects.toMatchObject({
        code: "ERR_IDEMPOTENCY_MISMATCH",
        message: expect.stringContaining(key),
      });
    });

    it("does NOT write the new entity when the mismatch error is thrown", async () => {
      const key = `no-write-${randomUUID()}`;

      const firstEntities = [
        {
          entity_type: ENTITY_TYPE,
          title: "Original entity stable",
          description: "First write stable",
        },
      ];
      const secondEntities = [
        {
          entity_type: ENTITY_TYPE,
          title: "Should not be stored",
          description: "This entity should never appear in the DB",
        },
      ];

      const first = await storeStructuredForApi({
        userId: TEST_USER_ID,
        entities: firstEntities,
        sourcePriority: 100,
        idempotencyKey: key,
      });
      const originalEntityId = first.entities[0].entity_id;

      // Attempt with different content (should error)
      await expect(
        storeStructuredForApi({
          userId: TEST_USER_ID,
          entities: secondEntities,
          sourcePriority: 100,
          idempotencyKey: key,
        })
      ).rejects.toMatchObject({ code: "ERR_IDEMPOTENCY_MISMATCH" });

      // Verify no additional observations were written for this user
      const { data: observations } = await db
        .from("observations")
        .select("entity_id")
        .eq("user_id", TEST_USER_ID);

      const entityIds = new Set((observations ?? []).map((o: { entity_id: string }) => o.entity_id));
      // Only the original entity should be present; "should not be stored" entity must not exist
      expect(entityIds.has(originalEntityId)).toBe(true);

      // Confirm there is exactly one source for this idempotency key (no second source created)
      const { data: sources } = await db
        .from("sources")
        .select("id")
        .eq("user_id", TEST_USER_ID)
        .eq("idempotency_key", key);
      expect(sources?.length).toBe(1);
    });
  });

  describe("MCP store path (storeStructuredInternal)", () => {
    let server: NeotomaServer;

    it("throws ERR_IDEMPOTENCY_MISMATCH on key reuse with different content via MCP store", async () => {
      server = new NeotomaServer();
      (server as unknown as { authenticatedUserId: string }).authenticatedUserId = TEST_USER_ID;

      const key = `mcp-diff-${randomUUID()}`;

      const firstEntities = [
        {
          entity_type: ENTITY_TYPE,
          title: "MCP original entity",
          description: "First MCP write",
        },
      ];
      const secondEntities = [
        {
          entity_type: ENTITY_TYPE,
          title: "MCP different entity",
          description: "Different content via MCP",
        },
      ];

      // First write
      await (server as unknown as { store: (p: unknown) => Promise<unknown> }).store({
        user_id: TEST_USER_ID,
        entities: firstEntities,
        idempotency_key: key,
      });

      // Second write with different content must throw an MCP error containing the code
      await expect(
        (server as unknown as { store: (p: unknown) => Promise<unknown> }).store({
          user_id: TEST_USER_ID,
          entities: secondEntities,
          idempotency_key: key,
        })
      ).rejects.toMatchObject({
        message: expect.stringContaining(key),
      });
    });

    it("returns replayed result when same key is reused with identical content via MCP store", async () => {
      server = new NeotomaServer();
      (server as unknown as { authenticatedUserId: string }).authenticatedUserId = TEST_USER_ID;

      const key = `mcp-same-${randomUUID()}`;
      const entities = [
        {
          entity_type: ENTITY_TYPE,
          title: "MCP replay entity",
          description: "Content for replay test",
        },
      ];

      const firstResponse = await (server as unknown as { store: (p: unknown) => Promise<{ content: Array<{ text: string }> }> }).store({
        user_id: TEST_USER_ID,
        entities,
        idempotency_key: key,
      });
      const firstParsed = JSON.parse((firstResponse as { content: Array<{ text: string }> }).content[0].text);
      expect(firstParsed.source_id).toBeDefined();

      // Replay with identical content
      const secondResponse = await (server as unknown as { store: (p: unknown) => Promise<{ content: Array<{ text: string }> }> }).store({
        user_id: TEST_USER_ID,
        entities,
        idempotency_key: key,
      });
      const secondParsed = JSON.parse((secondResponse as { content: Array<{ text: string }> }).content[0].text);

      // Same source_id should be returned on replay
      expect(secondParsed.source_id).toBe(firstParsed.source_id);
    });
  });
});
