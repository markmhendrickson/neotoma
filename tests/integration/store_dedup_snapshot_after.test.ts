/**
 * Regression test for issue #1840:
 * store response returns empty `entity_snapshot_after` ({}) on deduplicated
 * observation replay.
 *
 * When an identical observation is stored twice (same entity, same field
 * values, same priority), the second store correctly deduplicates (observation
 * count stays 1) but the store response must still return the current,
 * populated snapshot in `entity_snapshot_after` and mark the entity entry with
 * `deduplicated: true`.
 */

import { describe, it, expect, afterEach } from "vitest";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { randomUUID } from "crypto";
import { cleanupTestEntityType } from "../helpers/test_schema_helpers.js";
import { getSnapshot } from "../../src/services/snapshot_computation.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

describe("store: dedup replay populates entity_snapshot_after (#1840)", () => {
  const server = new NeotomaServer();
  (server as any).authenticatedUserId = TEST_USER_ID;
  const entityType = `dedup_test_${randomUUID().replace(/-/g, "").substring(0, 8)}`;
  const createdEntityIds: string[] = [];
  const createdSourceIds: string[] = [];

  afterEach(async () => {
    if (createdSourceIds.length > 0) {
      await db.from("raw_fragments").delete().in("source_id", createdSourceIds);
      await db.from("observations").delete().in("source_id", createdSourceIds);
      await db.from("sources").delete().in("id", createdSourceIds);
      createdSourceIds.length = 0;
    }
    if (createdEntityIds.length > 0) {
      await db.from("entity_snapshots").delete().in("entity_id", createdEntityIds);
      await db.from("observations").delete().in("entity_id", createdEntityIds);
      await db.from("entities").delete().in("id", createdEntityIds);
      createdEntityIds.length = 0;
    }
    await cleanupTestEntityType(entityType, TEST_USER_ID);
  });

  it("second identical store dedups but still returns a populated snapshot + deduplicated marker", async () => {
    await db.from("schema_registry").insert({
      entity_type: entityType,
      schema_version: "1.0",
      schema_definition: {
        fields: {
          value: { type: "number", required: false },
          label: { type: "string", required: true },
        },
      },
      reducer_config: {
        merge_policies: {
          value: { strategy: "last_write" },
          label: { strategy: "last_write" },
        },
      },
      active: true,
      scope: "user",
      user_id: TEST_USER_ID,
    });

    const entityPayload = {
      entity_type: entityType,
      name: "test",
      label: "t",
      value: 42,
    };

    // The CLI derives the idempotency key as a deterministic content hash of the
    // entities payload, so an identical re-store reuses the SAME key and hits the
    // idempotency-replay path. Mirror that here with one shared key.
    const sharedIdempotencyKey = `test-1840-${randomUUID()}`;

    // First store — establishes the snapshot.
    const storeOne = await (server as any).store({
      user_id: TEST_USER_ID,
      idempotency_key: sharedIdempotencyKey,
      entities: [entityPayload],
      source_priority: 5,
      observation_source: "sensor",
    });
    const responseOne = JSON.parse(storeOne.content[0].text);
    expect(responseOne.entities).toHaveLength(1);
    const entryOne = responseOne.entities[0];
    createdEntityIds.push(entryOne.entity_id);
    createdSourceIds.push(responseOne.source_id);

    expect(entryOne.entity_snapshot_after).toMatchObject({ value: 42, label: "t" });

    const entityId: string = entryOne.entity_id;

    // Second store — identical content, identical priority, SAME idempotency key
    // → idempotency-replay dedup (exactly what the CLI does on a re-store).
    const storeTwo = await (server as any).store({
      user_id: TEST_USER_ID,
      idempotency_key: sharedIdempotencyKey,
      entities: [entityPayload],
      source_priority: 5,
      observation_source: "sensor",
    });
    const responseTwo = JSON.parse(storeTwo.content[0].text);
    if (responseTwo.source_id) createdSourceIds.push(responseTwo.source_id);
    expect(responseTwo.entities).toHaveLength(1);
    const entryTwo = responseTwo.entities[0];

    // Observation count must stay at 1 (dedup worked).
    const { count: obsCount } = await db
      .from("observations")
      .select("id", { count: "exact", head: true })
      .eq("entity_id", entityId)
      .eq("user_id", TEST_USER_ID);
    expect(obsCount).toBe(1);

    // The snapshot in the response must be populated, NOT {}.
    expect(entryTwo.entity_snapshot_after).toBeTruthy();
    expect(entryTwo.entity_snapshot_after).toMatchObject({ value: 42, label: "t" });

    // The entity entry must carry the deduplicated marker.
    expect(entryTwo.deduplicated).toBe(true);

    // It must match what getEntitySnapshot returns directly.
    const direct = await getSnapshot(entityId, TEST_USER_ID);
    expect(entryTwo.entity_snapshot_after).toEqual(direct?.snapshot);
  });
});
