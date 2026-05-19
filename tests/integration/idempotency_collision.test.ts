/**
 * Regression tests for issue #186: idempotency key reuse with different content
 * should error instead of silently replaying the original payload.
 *
 * Before the fix both the MCP path (storeStructuredInternal) and the API path
 * (storeStructuredForApi) returned the existing observations without comparing
 * the incoming content hash to the stored source's content_hash. When content
 * differed the caller received a `replayed: true` response with the stale data.
 *
 * Fix: before accepting an idempotency replay, compute the SHA-256 hash of the
 * incoming JSON and compare it to the stored source content_hash. A mismatch
 * throws ERR_IDEMPOTENCY_COLLISION so the caller knows to use a new key.
 */

import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { storeStructuredForApi } from "../../src/actions.js";
import { NeotomaServer } from "../../src/server.js";
import { cleanupEntityType } from "../helpers/cleanup_helpers.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";
const ENTITY_TYPE = "idempotency_collision_test_note";

describe("idempotency key collision detection (issue #186)", () => {
  afterAll(async () => {
    await cleanupEntityType(ENTITY_TYPE, TEST_USER_ID);
  });

  describe("API path (storeStructuredForApi)", () => {
    it("replays cleanly when content is identical (same key + same payload)", async () => {
      const key = `idem-collision-test-${randomUUID()}`;
      const entities = [
        {
          entity_type: ENTITY_TYPE,
          title: `Same content note ${randomUUID()}`,
          content: "Identical payload.",
        },
      ];

      const first = await storeStructuredForApi({
        userId: TEST_USER_ID,
        entities,
        sourcePriority: 100,
        idempotencyKey: key,
      });

      const second = await storeStructuredForApi({
        userId: TEST_USER_ID,
        entities,
        sourcePriority: 100,
        idempotencyKey: key,
      });

      // Both calls must succeed, second is a replay.
      expect(first.entities.length).toBeGreaterThan(0);
      expect((second as { replayed?: boolean }).replayed).toBe(true);
      expect(second.entities).toHaveLength(first.entities.length);
    });

    it("throws ERR_IDEMPOTENCY_COLLISION when content differs (same key + different payload)", async () => {
      const key = `idem-collision-test-${randomUUID()}`;

      await storeStructuredForApi({
        userId: TEST_USER_ID,
        entities: [
          {
            entity_type: ENTITY_TYPE,
            title: `Original note ${randomUUID()}`,
            content: "Original content.",
          },
        ],
        sourcePriority: 100,
        idempotencyKey: key,
      });

      const collision = storeStructuredForApi({
        userId: TEST_USER_ID,
        entities: [
          {
            entity_type: ENTITY_TYPE,
            title: `Different note — same key ${randomUUID()}`,
            content: "Completely different content with more fields.",
            extra_field: "should cause collision",
          },
        ],
        sourcePriority: 100,
        idempotencyKey: key,
      });

      await expect(collision).rejects.toThrow(/ERR_IDEMPOTENCY_(COLLISION|MISMATCH)|Idempotency key reuse|already used with different content/);
    });
  });

  describe("MCP path (storeStructuredInternal via NeotomaServer.store)", () => {
    it("throws on idempotency collision with different content", async () => {
      const server = new NeotomaServer();
      (server as unknown as Record<string, unknown>).authenticatedUserId = TEST_USER_ID;

      const key = `idem-collision-test-${randomUUID()}`;
      const storeMethod = (
        server as unknown as {
          store: (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
        }
      ).store.bind(server);

      const suffix = randomUUID();

      // First call — should succeed.
      await storeMethod({
        user_id: TEST_USER_ID,
        idempotency_key: key,
        entities: [
          {
            entity_type: ENTITY_TYPE,
            name: `First MCP note ${suffix}`,
            content: "Original content.",
          },
        ],
      });

      // Second call with same key but different content — should throw.
      const collisionCall = storeMethod({
        user_id: TEST_USER_ID,
        idempotency_key: key,
        entities: [
          {
            entity_type: ENTITY_TYPE,
            name: `Second MCP note different ${suffix}`,
            content: "Completely different content.",
            extra: "additional field not in first call",
          },
        ],
      });

      await expect(collisionCall).rejects.toThrow(/ERR_IDEMPOTENCY_(COLLISION|MISMATCH)|Idempotency key reuse|already used with different content/);
    });
  });
});
