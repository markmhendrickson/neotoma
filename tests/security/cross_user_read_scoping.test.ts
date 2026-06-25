/**
 * Cross-user read scoping (companion to tenant_isolation_matrix.test.ts).
 *
 * Locks the 2026-06-25 fixes for pre-existing cross-USER read leaks surfaced by
 * the multi-tenancy audit. Where the matrix file drives HTTP routes, this file
 * exercises the exported data-layer functions DIRECTLY — the code shared by the
 * formerly-unscoped MCP handlers (retrieve_entity_snapshot, list_timeline_events,
 * health_check_snapshots, get_relationship_snapshot, list_entity_types):
 *
 *   - getEntityWithProvenance(entityId, includeDeleted, userId) must not return
 *     another user's entity when scoped by userId.
 *   - getDashboardStats(userId).total_events must count only the caller's
 *     timeline_events (it previously counted across all users).
 *   - SchemaRegistryService.listEntityTypes(keyword, userId) must not disclose
 *     another user's private (user-scoped) entity types.
 *
 * These run against the local SQLite `db` and need no HTTP server.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/db.js";
import { getEntityWithProvenance } from "../../src/services/entity_queries.js";
import { getDashboardStats } from "../../src/services/dashboard_stats.js";
import { SchemaRegistryService } from "../../src/services/schema_registry.js";

const PREFIX = "xuser_scope_test";

interface EntitySeed {
  userId: string;
  entityId: string;
  observationId: string;
}

async function seedEntity(label: string): Promise<EntitySeed> {
  const userId = randomUUID();
  const entityId = `${PREFIX}_ent_${label}_${randomUUID().slice(0, 8)}`;
  const observationId = randomUUID();

  await db.from("entities").insert({
    id: entityId,
    user_id: userId,
    entity_type: "test",
    canonical_name: `${label}'s entity`,
  });
  await db.from("observations").insert({
    id: observationId,
    entity_id: entityId,
    entity_type: "test",
    schema_version: "1.0",
    observed_at: new Date().toISOString(),
    source_priority: 0,
    fields: { marker: `${PREFIX}_${label}` },
    user_id: userId,
  });

  return { userId, entityId, observationId };
}

async function cleanupEntity(seed: EntitySeed): Promise<void> {
  await db.from("observations").delete().eq("entity_id", seed.entityId);
  await db.from("entity_snapshots").delete().eq("entity_id", seed.entityId);
  await db.from("entities").delete().eq("id", seed.entityId);
}

describe("cross-user read scoping", () => {
  describe("getEntityWithProvenance(entityId, includeDeleted, userId)", () => {
    let alice: EntitySeed;
    let bob: EntitySeed;

    beforeAll(async () => {
      alice = await seedEntity("alice");
      bob = await seedEntity("bob");
    });
    afterAll(async () => {
      await cleanupEntity(alice);
      await cleanupEntity(bob);
    });

    it("returns the entity for its owner", async () => {
      const got = await getEntityWithProvenance(alice.entityId, false, alice.userId);
      expect(got).not.toBeNull();
      expect(got?.entity_id).toBe(alice.entityId);
    });

    it("does NOT return another user's entity when scoped by userId", async () => {
      const got = await getEntityWithProvenance(bob.entityId, false, alice.userId);
      expect(got).toBeNull();
    });

    it("returns the entity for its own owner (positive control)", async () => {
      const got = await getEntityWithProvenance(bob.entityId, false, bob.userId);
      expect(got).not.toBeNull();
      expect(got?.entity_id).toBe(bob.entityId);
    });

    it("remains unscoped when no userId is supplied (back-compat for ownership-prechecked callers)", async () => {
      const got = await getEntityWithProvenance(bob.entityId);
      expect(got).not.toBeNull();
    });
  });

  describe("getDashboardStats(userId).total_events", () => {
    const userA = randomUUID();
    const userB = randomUUID();
    const eventIds: string[] = [];

    beforeAll(async () => {
      // Two fresh random users with no other data → counts are deterministic.
      for (let i = 0; i < 2; i++) {
        const id = `${PREFIX}_tl_a_${randomUUID()}`;
        eventIds.push(id);
        await db.from("timeline_events").insert({
          id,
          event_type: "test_event",
          event_timestamp: new Date().toISOString(),
          user_id: userA,
        });
      }
      for (let i = 0; i < 3; i++) {
        const id = `${PREFIX}_tl_b_${randomUUID()}`;
        eventIds.push(id);
        await db.from("timeline_events").insert({
          id,
          event_type: "test_event",
          event_timestamp: new Date().toISOString(),
          user_id: userB,
        });
      }
    });
    afterAll(async () => {
      for (const id of eventIds) {
        await db.from("timeline_events").delete().eq("id", id);
      }
    });

    it("counts only the caller's timeline_events, not every user's", async () => {
      const statsA = await getDashboardStats(userA);
      const statsB = await getDashboardStats(userB);
      expect(statsA.total_events).toBe(2);
      expect(statsB.total_events).toBe(3);
    });
  });

  describe("SchemaRegistryService.listEntityTypes(keyword, userId)", () => {
    const ownerId = randomUUID();
    const privateType = `${PREFIX}_type_${randomUUID().slice(0, 8)}`;
    const registry = new SchemaRegistryService();

    beforeAll(async () => {
      await db.from("schema_registry").insert({
        id: randomUUID(),
        entity_type: privateType,
        schema_version: "1.0.0",
        schema_definition: JSON.stringify({
          entity_type: privateType,
          schema_version: "1.0.0",
          fields: {},
        }),
        reducer_config: JSON.stringify({}),
        active: 1,
        scope: "user",
        user_id: ownerId,
        created_at: new Date().toISOString(),
      });
    });
    afterAll(async () => {
      await db.from("schema_registry").delete().eq("entity_type", privateType);
    });

    it("does NOT expose another user's private entity type", async () => {
      const types = await registry.listEntityTypes(undefined, randomUUID());
      expect(types.map((t) => t.entity_type)).not.toContain(privateType);
    });

    it("exposes the private entity type to its owner", async () => {
      const types = await registry.listEntityTypes(undefined, ownerId);
      expect(types.map((t) => t.entity_type)).toContain(privateType);
    });
  });
});
