/**
 * Tenant isolation for the MCP resource handlers reached by entity id.
 *
 * Companion to `tenant_isolation_matrix.test.ts`, which covers the HTTP
 * query endpoints. This file covers the other door onto the same data:
 * the `neotoma://entity/{id}` resource family, whose handlers query the
 * database directly rather than through the scoped query layer.
 *
 * Motivated by #2093. Three handlers reachable by entity id applied no
 * `user_id` filter at all, so any authenticated caller who knew or guessed
 * an entity id could read another user's entity, its observations, and its
 * relationships. The issue named `handleIndividualEntity`; the other two
 * carried the same defect and are covered here for the same reason.
 *
 * Each case is a pair: the owner reads their own data and gets it, and a
 * second authenticated user reads the same id and gets nothing. The second
 * half is the planted negative — it fails against the pre-fix code, which
 * is what makes these tests evidence rather than decoration
 * (`principles.md` invariant 4, in the consuming project).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../src/db.js";
import { NeotomaServer } from "../../src/server.js";
import { randomUUID } from "node:crypto";

const TEST_PREFIX = "mcp_resource_iso_test";

interface Fixture {
  userId: string;
  entityId: string;
  relationshipKey: string;
  otherEntityId: string;
  sourceId: string;
}

async function seed(label: string): Promise<Fixture> {
  const userId = randomUUID();
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const entityId = `${TEST_PREFIX}_ent_${label}_${suffix}`;
  const otherEntityId = `${TEST_PREFIX}_ent2_${label}_${suffix}`;
  const relationshipKey = `${TEST_PREFIX}_rel_${label}_${suffix}`;
  const sourceId = randomUUID();

  await db.from("entities").insert([
    { id: entityId, user_id: userId, entity_type: "test", canonical_name: `${label} primary` },
    { id: otherEntityId, user_id: userId, entity_type: "test", canonical_name: `${label} secondary` },
  ]);

  await db.from("entity_snapshots").insert({
    entity_id: entityId,
    user_id: userId,
    entity_type: "test",
    schema_version: "1.0",
    snapshot: JSON.stringify({ secret: `${label}-only-value` }),
    provenance: JSON.stringify({}),
    observation_count: 1,
  });

  await db.from("sources").insert({
    id: sourceId,
    user_id: userId,
    content_hash: `${TEST_PREFIX}_hash_${label}_${suffix}`,
    mime_type: "text/plain",
    storage_url: `internal://test/${label}`,
    file_size: 0,
  });

  await db.from("observations").insert({
    id: randomUUID(),
    entity_id: entityId,
    entity_type: "test",
    schema_version: "1.0",
    observed_at: new Date().toISOString(),
    source_priority: 0,
    source_id: sourceId,
    fields: { secret: `${label}-observation` },
    user_id: userId,
  });

  await db.from("relationship_snapshots").insert({
    relationship_key: relationshipKey,
    relationship_type: "REFERS_TO",
    source_entity_id: entityId,
    target_entity_id: otherEntityId,
    schema_version: "1",
    snapshot: JSON.stringify({}),
    user_id: userId,
  });

  return { userId, entityId, relationshipKey, otherEntityId, sourceId };
}

describe("MCP resource handlers — tenant isolation (#2093)", () => {
  let server: NeotomaServer;
  let userA: Fixture;
  let userB: Fixture;

  const actAs = (userId: string) => {
    (server as any).authenticatedUserId = userId;
  };

  beforeAll(async () => {
    server = new NeotomaServer();
    userA = await seed("a");
    userB = await seed("b");
  });

  afterAll(async () => {
    const ids = [userA.entityId, userA.otherEntityId, userB.entityId, userB.otherEntityId];
    await db.from("relationship_snapshots").delete().in("relationship_key", [
      userA.relationshipKey,
      userB.relationshipKey,
    ]);
    await db.from("observations").delete().in("entity_id", ids);
    await db.from("sources").delete().in("id", [userA.sourceId, userB.sourceId]);
    await db.from("entity_snapshots").delete().in("entity_id", ids);
    await db.from("entities").delete().in("id", ids);
  });

  describe("neotoma://entity/{id}", () => {
    it("the owner reads their own entity", async () => {
      actAs(userA.userId);
      const result = await (server as any).handleIndividualEntity(userA.entityId);
      expect(result.entity_id).toBe(userA.entityId);
      // The snapshot is recomputed from this user's observations, so assert on
      // the owner's marker rather than on a seeded literal the pipeline
      // legitimately overwrites.
      const snap = typeof result.snapshot === "string" ? JSON.parse(result.snapshot) : result.snapshot;
      expect(snap.secret).toBe("a-observation");
    });

    it("another authenticated user reading that id is refused", async () => {
      actAs(userB.userId);
      await expect((server as any).handleIndividualEntity(userA.entityId)).rejects.toThrow(
        /Entity not found/
      );
    });
  });

  describe("neotoma://entity/{id}/observations", () => {
    it("the owner reads their own observations", async () => {
      actAs(userA.userId);
      const result = await (server as any).handleEntityObservations(userA.entityId);
      expect(result.total).toBe(1);
    });

    it("another authenticated user reads none of them", async () => {
      actAs(userB.userId);
      const result = await (server as any).handleEntityObservations(userA.entityId);
      expect(result.observations).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe("neotoma://entity/{id}/relationships", () => {
    it("the owner reads their own edges", async () => {
      actAs(userA.userId);
      const result = await (server as any).handleEntityRelationships(userA.entityId);
      const keys = result.outbound_relationships.map((r: any) => r.relationship_key);
      expect(keys).toContain(userA.relationshipKey);
    });

    it("another authenticated user reads neither direction", async () => {
      actAs(userB.userId);
      const result = await (server as any).handleEntityRelationships(userA.entityId);
      expect(result.outbound_relationships).toEqual([]);
      expect(result.inbound_relationships).toEqual([]);
    });

    it("the inbound direction is scoped too, not only the outbound one", async () => {
      // userA.otherEntityId is the TARGET of userA's edge. Reading it as user B
      // must return nothing — the pre-fix code scoped neither direction, and a
      // fix applied to only the outbound query would pass every case above.
      actAs(userB.userId);
      const result = await (server as any).handleEntityRelationships(userA.otherEntityId);
      expect(result.inbound_relationships).toEqual([]);
    });
  });

  describe("an unauthenticated caller", () => {
    it("is refused before any query runs", async () => {
      (server as any).authenticatedUserId = null;
      await expect((server as any).handleIndividualEntity(userA.entityId)).rejects.toThrow(
        /Authentication required/
      );
    });
  });
});
