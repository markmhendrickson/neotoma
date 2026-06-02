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
  observationId: string;
}

async function seedUserData(label: string): Promise<FixtureUserData> {
  const userId = randomUUID();
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const entityId = `${TEST_PREFIX}_ent_${label}_${suffix}`;
  const entityId2 = `${TEST_PREFIX}_ent2_${label}_${suffix}`;
  const sourceId = randomUUID();
  const relationshipKey = `${TEST_PREFIX}_rel_${label}_${suffix}`;
  const observationId = randomUUID();

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

  await db.from("observations").insert({
    id: observationId,
    entity_id: entityId,
    entity_type: "test",
    schema_version: "1.0",
    observed_at: new Date().toISOString(),
    source_priority: 0,
    source_id: sourceId,
    fields: { marker: `${TEST_PREFIX}_obs_${label}` },
    user_id: userId,
  });

  return { userId, entityId, sourceId, relationshipKey, observationId };
}

async function cleanupUserData(data: FixtureUserData): Promise<void> {
  await db.from("observations").delete().eq("id", data.observationId);
  await db.from("relationship_snapshots").delete().eq("relationship_key", data.relationshipKey);
  await db.from("entities").delete().eq("user_id", data.userId);
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

    // NOTE: the `node_type: "source"` branch in src/actions.ts and src/server.ts
    // queries `db.from("source")` (singular). The canonical table is `sources`
    // (plural), so that branch returns no rows for any user — a pre-existing
    // dead-code path tracked separately. We intentionally do NOT assert against
    // it here: a tautological assertion (always passes regardless of the
    // user_id filter) is worse than no assertion.

    it("user A's include_observations does NOT return user B's observations on user B's entity", async () => {
      // userA queries userB's entityId asking for observations. The entity-branch
      // .single() filter blocks the entity itself, but we also assert the
      // observations sub-query is user-scoped — a regression of the
      // .eq("user_id", userId) on the observations subquery would surface user B's
      // observation row here.
      const { status, json } = await callEndpoint("/retrieve_graph_neighborhood", {
        node_id: userB.entityId,
        node_type: "entity",
        user_id: userA.userId,
        include_observations: true,
      });
      expect(status).toBe(200);
      expect(json.entity).toBeUndefined();
      const obsIds = (json.observations ?? []).map((o: any) => o.id);
      expect(obsIds).not.toContain(userB.observationId);
    });

    it("user A querying their own entity with include_observations returns their observation", async () => {
      // Positive control: the same code path returns user A's own observations.
      const { status, json } = await callEndpoint("/retrieve_graph_neighborhood", {
        node_id: userA.entityId,
        node_type: "entity",
        user_id: userA.userId,
        include_observations: true,
      });
      expect(status).toBe(200);
      expect(json.entity).toBeDefined();
      const obsIds = (json.observations ?? []).map((o: any) => o.id);
      expect(obsIds).toContain(userA.observationId);
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

    // Vector: edge-scoping-escape via a planted cross-tenant edge.
    //
    // createRelationship (src/services/relationships.ts) does NOT validate
    // that both endpoints are owned by the caller, so user A can write a
    // relationship row (user_id=A) whose target_entity_id is user B's
    // private entity. The risk would be that the multi-hop BFS in
    // /retrieve_related_entities (src/actions.ts:7964-8039) uses B's id as a
    // hop frontier and then surfaces B's edges or B's entity row.
    //
    // This MUST NOT happen: the per-hop relationship_snapshots queries are
    // user-scoped INSIDE the loop body (actions.ts:7974, 8000), so they only
    // ever return A-owned rows; and the final entities fetch is
    // .eq("user_id", A) (actions.ts:8031), so B's entity row is dropped even
    // though B's id appears as a frontier endpoint. The only echo is the id
    // string A planted themselves — not disclosure of B's data.
    //
    // This locks isolation in: a regression that moves the user_id filter
    // out of the loop, or drops it from the entities fetch, fails here.
    it("planted cross-tenant edge does NOT leak user B's edges or entity via multi-hop BFS", async () => {
      const plantedKey = `${TEST_PREFIX}_planted_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      try {
        // As user A: write an edge A.entityId -> userB.entityId into A's scope.
        // userB.entityId is a foreign endpoint A does not own.
        await db.from("relationship_snapshots").insert({
          relationship_key: plantedKey,
          relationship_type: "REFERS_TO",
          source_entity_id: userA.entityId,
          target_entity_id: userB.entityId,
          schema_version: "1",
          snapshot: JSON.stringify({}),
          user_id: userA.userId,
        });

        // As user A: multi-hop traversal from A's root that reaches the
        // foreign frontier id (userB.entityId) at hop 1, then attempts hop 2.
        const { status, json } = await callEndpoint("/retrieve_related_entities", {
          entity_id: userA.entityId,
          user_id: userA.userId,
          max_hops: 2,
          direction: "both",
        });
        expect(status).toBe(200);

        const rels: any[] = json.relationships ?? [];
        // Every returned relationship row MUST be owned by user A.
        for (const rel of rels) {
          expect(rel.user_id).toBe(userA.userId);
        }
        // User B's pre-seeded edge MUST NOT surface, even though hop 2
        // queries with userB.entityId as a frontier id.
        const relKeys = rels.map((r) => r.relationship_key);
        expect(relKeys).not.toContain(userB.relationshipKey);

        const entities: any[] = json.entities ?? [];
        // No entity owned by user B may appear in the results.
        for (const ent of entities) {
          expect(ent.user_id).toBe(userA.userId);
        }
        // userB.entityId is an endpoint of the planted edge but is owned by
        // user B, so it MUST be absent from the materialized entities.
        const entityIds = entities.map((e) => e.id);
        expect(entityIds).not.toContain(userB.entityId);
      } finally {
        await db.from("relationship_snapshots").delete().eq("relationship_key", plantedKey);
      }
    });
  });

  // Vector: bulk-import-cross-user.
  //
  // The bulk `entities import` CLI path (src/cli/index.ts) sends a body
  // user_id plus an array of raw JSONL lines as entities[]. A red-team pass
  // probed whether an attacker authenticated as user A could write into,
  // overwrite, or read user B's tenant by:
  //   (1) overriding the request body/flag user_id to user B, or
  //   (2) smuggling a per-line `user_id: <userB>` inside an entity object.
  //
  // handleStorePost (src/actions.ts:6767) resolves a SINGLE batch userId via
  // getAuthenticatedUserId, and the per-entity destructure
  // (src/actions.ts:6196) only strips entity_type/intent/target_id — any
  // stray `user_id` lands in `...fields` as inert observation data and the
  // observation is written with `user_id: <batch userId>`
  // (createObservation). Isolation is enforced by the `user_id` column on
  // every row, not by the entity_id (generateEntityId is user-agnostic:
  // type+canonical_name only), so the per-line override cannot redirect a
  // write into another tenant's scope.
  //
  // These tests lock that in: a regression that lets the per-entity user_id
  // win, or that drops the batch-level user scoping on the write, surfaces a
  // user-B-scoped row here and fails.
  describe("/store bulk import (bulk-import-cross-user)", () => {
    it("per-line user_id override is inert: observation is written under the batch user only", async () => {
      const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const canonicalName = `${TEST_PREFIX}_bulk_${suffix}`;
      const createdEntityIds: string[] = [];
      const createdObservationIds: string[] = [];
      const createdSourceIds: string[] = [];

      try {
        // As user A (batch user_id = A), smuggle a per-line user_id = B.
        const { status, json } = await callEndpoint("/store", {
          user_id: userA.userId,
          idempotency_key: `${TEST_PREFIX}_bulk_${suffix}`,
          commit: true,
          entities: [
            {
              entity_type: "test",
              canonical_name: canonicalName,
              // Attacker-smuggled cross-tenant override. MUST be inert.
              user_id: userB.userId,
            },
          ],
        });
        expect(status).toBe(200);

        const stored = (json.entities ?? [])[0] as
          | { entity_id?: string; observation_id?: string }
          | undefined;
        expect(stored?.entity_id).toBeDefined();
        if (stored?.entity_id) createdEntityIds.push(stored.entity_id);
        if (stored?.observation_id) createdObservationIds.push(stored.observation_id);
        if (typeof json.source_id === "string") createdSourceIds.push(json.source_id);

        const entityId = stored!.entity_id!;

        // The written observation MUST belong to user A, never user B.
        const { data: obsRows } = await db
          .from("observations")
          .select("*")
          .eq("entity_id", entityId);
        expect((obsRows ?? []).length).toBeGreaterThan(0);
        for (const obs of obsRows ?? []) {
          expect(obs.user_id).toBe(userA.userId);
          expect(obs.user_id).not.toBe(userB.userId);
        }

        // The entity row itself MUST be scoped to user A.
        const { data: entRows } = await db.from("entities").select("*").eq("id", entityId);
        for (const ent of entRows ?? []) {
          expect(ent.user_id).toBe(userA.userId);
        }

        // No row for this batch import may exist under user B's scope:
        // zero entities and zero observations enumerable as user B.
        const { data: bobEntities } = await db
          .from("entities")
          .select("id")
          .eq("id", entityId)
          .eq("user_id", userB.userId);
        expect(bobEntities ?? []).toEqual([]);

        const { data: bobObs } = await db
          .from("observations")
          .select("id")
          .eq("entity_id", entityId)
          .eq("user_id", userB.userId);
        expect(bobObs ?? []).toEqual([]);
      } finally {
        for (const id of createdObservationIds) {
          await db.from("observations").delete().eq("id", id);
        }
        for (const id of createdEntityIds) {
          await db.from("observations").delete().eq("entity_id", id);
          await db.from("entity_snapshots").delete().eq("entity_id", id);
          await db.from("entities").delete().eq("id", id);
        }
        for (const id of createdSourceIds) {
          await db.from("sources").delete().eq("id", id);
        }
      }
    });

    it("body user_id override does not let user A write into user B's relationship scope", async () => {
      // A bulk batch authored as user A that references user B's entity_id as
      // a relationship target MUST produce only a user-A-scoped
      // relationship_snapshot. User B's relationship reads MUST NOT surface
      // it (no enumeration oracle across the tenant boundary).
      const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const srcName = `${TEST_PREFIX}_bulkrel_${suffix}`;
      // The store relationships[] schema requires target_entity_id to match
      // the canonical Neotoma entity_id format (ent_ + 24 hex). Seed a real,
      // user-B-owned entity with such an id to act as the cross-tenant target.
      const bobTargetId = `ent_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
      const createdEntityIds: string[] = [];
      const createdObservationIds: string[] = [];
      const createdSourceIds: string[] = [];
      const relKeysBefore = new Set<string>();

      await db.from("entities").insert({
        id: bobTargetId,
        user_id: userB.userId,
        entity_type: "test",
        canonical_name: `${TEST_PREFIX}_bobtarget_${suffix}`,
      });

      // Capture user B's existing relationship keys to detect any new leak.
      const { json: bobBefore } = await callEndpoint("/list_relationships", {
        entity_id: bobTargetId,
        user_id: userB.userId,
      });
      for (const r of bobBefore.relationships ?? []) {
        relKeysBefore.add(r.relationship_key);
      }

      try {
        const { status, json } = await callEndpoint("/store", {
          user_id: userA.userId,
          idempotency_key: `${TEST_PREFIX}_bulkrel_${suffix}`,
          commit: true,
          entities: [
            {
              entity_type: "test",
              canonical_name: srcName,
            },
          ],
          relationships: [
            {
              relationship_type: "REFERS_TO",
              source_index: 0,
              // Cross-tenant reference: user B's private entity.
              target_entity_id: bobTargetId,
            },
          ],
        });
        expect(status).toBe(200);

        const stored = (json.entities ?? [])[0] as
          | { entity_id?: string; observation_id?: string }
          | undefined;
        if (stored?.entity_id) createdEntityIds.push(stored.entity_id);
        if (stored?.observation_id) createdObservationIds.push(stored.observation_id);
        if (typeof json.source_id === "string") createdSourceIds.push(json.source_id);

        // Any relationship_snapshot pointing at user B's entity that was
        // created by this batch MUST be scoped to user A (the batch author),
        // never silently re-homed into user B's tenant.
        const { data: snaps } = await db
          .from("relationship_snapshots")
          .select("*")
          .eq("target_entity_id", bobTargetId);
        expect((snaps ?? []).length).toBeGreaterThan(0);
        for (const snap of snaps ?? []) {
          expect(snap.user_id).toBe(userA.userId);
          expect(snap.user_id).not.toBe(userB.userId);
        }

        // The cross-tenant reference MUST NOT appear in user B's reads.
        const { json: bobAfter } = await callEndpoint("/list_relationships", {
          entity_id: bobTargetId,
          user_id: userB.userId,
        });
        const bobKeysAfter: string[] = (bobAfter.relationships ?? []).map(
          (r: any) => r.relationship_key
        );
        for (const key of bobKeysAfter) {
          // No NEW relationship key appeared in user B's scope as a result of
          // user A's cross-tenant write.
          expect(relKeysBefore.has(key)).toBe(true);
        }
        // Every relationship user B can read MUST be owned by user B.
        for (const rel of bobAfter.relationships ?? []) {
          expect(rel.user_id).toBe(userB.userId);
        }
      } finally {
        for (const id of createdObservationIds) {
          await db.from("observations").delete().eq("id", id);
        }
        for (const id of createdEntityIds) {
          await db.from("relationship_snapshots").delete().eq("source_entity_id", id);
          await db.from("observations").delete().eq("entity_id", id);
          await db.from("entity_snapshots").delete().eq("entity_id", id);
          await db.from("entities").delete().eq("id", id);
        }
        for (const id of createdSourceIds) {
          await db.from("sources").delete().eq("id", id);
        }
        await db.from("relationship_snapshots").delete().eq("target_entity_id", bobTargetId);
        await db.from("entities").delete().eq("id", bobTargetId);
      }
    });
  });
});
