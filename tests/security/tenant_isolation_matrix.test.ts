/**
 * Tenant isolation matrix (Gate G3 — companion to auth_topology_matrix).
 *
 * Where `auth_topology_matrix.test.ts` verifies that protected endpoints
 * reject unauthenticated callers, this matrix covers the orthogonal
 * threat model: an authenticated caller MUST NOT be able to read another
 * user's data even when they know a cross-user entity_id, source_id, or
 * relationship key.
 *
 * Motivated by GHSA-wrr4-782v-jhwh /
 * docs/security/advisories/2026-05-21-relationship-endpoint-tenant-isolation.md
 *
 * Every authenticated query endpoint that touches user-owned data
 * (entities, observations, sources, relationship_snapshots,
 * timeline_events, entity_snapshots) MUST be covered here. Adding a new
 * such endpoint without adding a row is blocked by the change guardrails
 * rule MUST 5.
 *
 * The matrix seeds two distinct user_ids' worth of data and asserts that
 * calls authenticated as user A only see user A's data, regardless of
 * which node_id, entity_id, or source_id is queried.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../../src/db.js";
import { randomUUID } from "node:crypto";

const TEST_PREFIX = "tenant_iso_matrix_test";
const PORT = process.env.NEOTOMA_SESSION_DEV_PORT ?? "18099";
const BASE_URL = `http://127.0.0.1:${PORT}`;

interface FixtureUserData {
  userId: string;
  entityId: string;
  sourceId: string;
  relationshipKey: string;
}

async function seedUserData(label: string): Promise<FixtureUserData> {
  const userId = randomUUID();
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const entityId = `${TEST_PREFIX}_ent_${label}_${suffix}`;
  const entityId2 = `${TEST_PREFIX}_ent2_${label}_${suffix}`;
  const sourceId = randomUUID();
  const relationshipKey = `${TEST_PREFIX}_rel_${label}_${suffix}`;

  await db.from("entities").insert({
    id: entityId,
    user_id: userId,
    entity_type: "test",
    canonical_name: `${label}'s Entity`,
  });

  await db.from("entities").insert({
    id: entityId2,
    user_id: userId,
    entity_type: "test",
    canonical_name: `${label}'s Entity 2`,
  });

  await db.from("sources").insert({
    id: sourceId,
    user_id: userId,
    content_hash: `${TEST_PREFIX}_hash_${label}_${Date.now()}`,
    mime_type: "text/plain",
    storage_url: `internal://test/${label}`,
    file_size: 0,
  });

  await db.from("relationship_snapshots").insert({
    relationship_key: relationshipKey,
    relationship_type: "REFERS_TO",
    source_entity_id: entityId,
    target_entity_id: entityId2,
    schema_version: "1",
    snapshot: JSON.stringify({}),
    user_id: userId,
  });

  return { userId, entityId, sourceId, relationshipKey };
}

async function cleanupUserData(data: FixtureUserData): Promise<void> {
  await db.from("relationship_snapshots").delete().eq("relationship_key", data.relationshipKey);
  await db.from("entities").delete().like("id", `${TEST_PREFIX}_%`).eq("user_id", data.userId);
  await db.from("sources").delete().eq("id", data.sourceId);
}

async function callEndpoint(
  path: string,
  body: Record<string, unknown>
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

describe("Tenant isolation matrix (GHSA-wrr4-782v-jhwh)", () => {
  let userA: FixtureUserData;
  let userB: FixtureUserData;

  beforeAll(async () => {
    userA = await seedUserData("alice");
    userB = await seedUserData("bob");
  });

  afterAll(async () => {
    await cleanupUserData(userA);
    await cleanupUserData(userB);
  });

  describe("/list_relationships", () => {
    it("user A querying their own entity_id returns scoped result", async () => {
      const { status, json } = await callEndpoint("/list_relationships", {
        entity_id: userA.entityId,
        user_id: userA.userId,
      });
      expect(status).toBe(200);
      expect(Array.isArray(json.relationships)).toBe(true);
    });

    it("user A querying user B's entity_id does NOT return user B's seeded relationship", async () => {
      const { status, json } = await callEndpoint("/list_relationships", {
        entity_id: userB.entityId,
        user_id: userA.userId,
      });
      expect(status).toBe(200);
      // user_id scoping blocks user B's relationship_snapshots row; relationship_key must not appear
      const keys = (json.relationships ?? []).map((r: any) => r.relationship_key);
      expect(keys).not.toContain(userB.relationshipKey);
      expect(json.relationships).toEqual([]);
    });
  });

  describe("/retrieve_graph_neighborhood", () => {
    it("user A querying their own node_id returns user A's entity", async () => {
      const { status, json } = await callEndpoint("/retrieve_graph_neighborhood", {
        node_id: userA.entityId,
        node_type: "entity",
        user_id: userA.userId,
      });
      expect(status).toBe(200);
      expect(json.entity).toBeDefined();
      expect(json.entity.id).toBe(userA.entityId);
    });

    it("user A querying user B's node_id does NOT return user B's entity", async () => {
      const { status, json } = await callEndpoint("/retrieve_graph_neighborhood", {
        node_id: userB.entityId,
        node_type: "entity",
        user_id: userA.userId,
      });
      expect(status).toBe(200);
      // Scoped query .single() finds no row for user A
      expect(json.entity).toBeUndefined();
    });

    it("user A querying user B's source does NOT return user B's source", async () => {
      const { status, json } = await callEndpoint("/retrieve_graph_neighborhood", {
        node_id: userB.sourceId,
        node_type: "source",
        user_id: userA.userId,
      });
      expect(status).toBe(200);
      expect(json.source).toBeUndefined();
    });
  });

  describe("/retrieve_related_entities", () => {
    it("user A querying their own entity_id returns scoped result", async () => {
      const { status, json } = await callEndpoint("/retrieve_related_entities", {
        entity_id: userA.entityId,
        user_id: userA.userId,
      });
      expect(status).toBe(200);
      expect(Array.isArray(json.relationships)).toBe(true);
    });

    it("user A querying user B's entity_id returns empty (scoped to user A)", async () => {
      const { status, json } = await callEndpoint("/retrieve_related_entities", {
        entity_id: userB.entityId,
        user_id: userA.userId,
      });
      expect(status).toBe(200);
      expect(json.relationships).toEqual([]);
      expect(json.entities ?? []).toEqual([]);
    });
  });
});
