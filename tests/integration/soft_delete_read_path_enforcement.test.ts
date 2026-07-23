/**
 * Integration test: soft-deleted entities are unreadable across EVERY read path.
 *
 * Deletion was enforced per-endpoint, so a tombstoned entity (highest-priority
 * observation with `fields._deleted === true`) was hidden from
 * `/get_entity_snapshot` and `retrieve_entities` but still recoverable via:
 *   - `/retrieve_related_entities`, which returned the tombstone's children and
 *     edges and would traverse FROM a tombstoned root;
 *   - `/list_observations`, which returned the full pre-deletion observations
 *     including all snapshot `fields` — verbatim recovery of deleted content.
 *
 * The fix routes every read path through the shared `getDeletedEntityIds`
 * tombstone helper. Coverage is table-driven over read paths so a future
 * endpoint only needs a new row.
 *
 * Graph seeded (all owned by the same user):
 *   liveRoot --REFERS_TO--> deletedParent --REFERS_TO--> child
 * `deletedParent` is soft-deleted; `liveRoot` and `child` stay live.
 */

import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { softDeleteEntity } from "../../src/services/deletion.js";
import { recomputeSnapshot } from "../../src/services/snapshot_computation.js";
import { queryEntities } from "../../src/services/entity_queries.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";
const API_PORT = 18262;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

const ENTITY_TYPE = "sdrp_note";
const SECRET_FIELD = "sdrp_secret_content";

describe("soft-delete read-path enforcement", () => {
  let httpServer: ReturnType<typeof createServer>;
  const suffix = String(process.hrtime.bigint());
  const liveRoot = `ent_sdrp_live_${suffix}`;
  const deletedParent = `ent_sdrp_deleted_${suffix}`;
  const child = `ent_sdrp_child_${suffix}`;
  const entityIds = [liveRoot, deletedParent, child];

  const edges: Array<{ source: string; target: string }> = [
    { source: liveRoot, target: deletedParent },
    { source: deletedParent, target: child },
  ];
  const relationshipKeys = edges.map((e) => `REFERS_TO:${e.source}:${e.target}`);

  async function post(path: string, body: Record<string, unknown>) {
    const resp = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: resp.status, json: (await resp.json()) as Record<string, any> };
  }

  beforeAll(async () => {
    httpServer = createServer(app);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(API_PORT, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });

    await db.from("entities").insert(
      entityIds.map((id) => ({
        id,
        entity_type: ENTITY_TYPE,
        canonical_name: id,
        user_id: TEST_USER_ID,
      }))
    );

    // One content-bearing observation per entity. The parent's carries the
    // field that must never resurface once the entity is tombstoned.
    await db.from("observations").insert(
      entityIds.map((id) => ({
        entity_id: id,
        entity_type: ENTITY_TYPE,
        schema_version: "1.0",
        observed_at: "2026-07-01T00:00:00.000Z",
        source_priority: 0,
        fields: { name: id, [SECRET_FIELD]: `secret for ${id}` },
        user_id: TEST_USER_ID,
      }))
    );

    await db.from("relationship_snapshots").insert(
      edges.map((e) => ({
        relationship_key: `REFERS_TO:${e.source}:${e.target}`,
        relationship_type: "REFERS_TO",
        source_entity_id: e.source,
        target_entity_id: e.target,
        schema_version: "1.0",
        snapshot: {},
        user_id: TEST_USER_ID,
      }))
    );

    for (const id of entityIds) {
      await recomputeSnapshot(id, TEST_USER_ID);
    }

    await softDeleteEntity(deletedParent, ENTITY_TYPE, TEST_USER_ID, "read-path enforcement test");
    // Materialize the tombstone the same way the write path does, so the
    // snapshot-backed endpoints reflect the deletion.
    await recomputeSnapshot(deletedParent, TEST_USER_ID);
  });

  afterAll(async () => {
    await db.from("relationship_snapshots").delete().in("relationship_key", relationshipKeys);
    await db.from("entity_snapshots").delete().in("entity_id", entityIds);
    await db.from("observations").delete().in("entity_id", entityIds);
    await db.from("entities").delete().in("id", entityIds);
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  /**
   * Table of read paths that must never surface a tombstoned entity. Each
   * `probe` returns the JSON body of a request rooted at, or reaching, the
   * tombstoned entity; the shared assertion is that the serialized body
   * mentions neither the tombstoned entity id nor its pre-deletion content.
   * A new endpoint only needs a new row here.
   */
  const leakProbes: Array<{
    name: string;
    probe: () => Promise<unknown>;
  }> = [
    {
      name: "POST /retrieve_related_entities rooted at the tombstoned entity",
      probe: async () =>
        (
          await post("/retrieve_related_entities", {
            entity_id: deletedParent,
            direction: "both",
            max_hops: 2,
            include_entities: true,
          })
        ).json,
    },
    {
      name: "POST /retrieve_related_entities from a live root linking to the tombstone",
      probe: async () =>
        (
          await post("/retrieve_related_entities", {
            entity_id: liveRoot,
            direction: "outbound",
            max_hops: 2,
            include_entities: true,
          })
        ).json,
    },
    {
      name: "POST /list_observations for the tombstoned entity",
      probe: async () =>
        (
          await post("/list_observations", {
            entity_id: deletedParent,
          })
        ).json,
    },
  ];

  it.each(leakProbes)("$name does not surface the tombstoned entity", async ({ probe }) => {
    const serialized = JSON.stringify(await probe());
    // Pre-deletion field content must never be recoverable...
    expect(serialized).not.toContain(`secret for ${deletedParent}`);
    // ...and the endpoint must not disclose the tombstoned entity at all.
    // `/list_observations` is exempt: its tombstone rows legitimately carry
    // `entity_id`, which is the audit record the redaction preserves.
    if (!serialized.includes('"_deleted":true')) {
      expect(serialized).not.toContain(deletedParent);
    }
  });

  it("returns an empty result when traversing from a tombstoned root", async () => {
    const { status, json } = await post("/retrieve_related_entities", {
      entity_id: deletedParent,
      direction: "both",
      max_hops: 2,
      include_entities: true,
    });

    expect(status).toBe(200);
    expect(json.entities).toEqual([]);
    expect(json.relationships).toEqual([]);
  });

  it("omits the tombstoned entity from a live root's related results", async () => {
    const { status, json } = await post("/retrieve_related_entities", {
      entity_id: liveRoot,
      direction: "outbound",
      max_hops: 2,
      include_entities: true,
    });

    expect(status).toBe(200);
    const ids = (json.entities as Array<{ id: string }>).map((e) => e.id);
    expect(ids).not.toContain(deletedParent);
    // The tombstone is the only route to `child`, so the traversal must stop
    // there rather than reaching through the deleted node.
    expect(ids).not.toContain(child);
  });

  it("drops relationships whose source or target is tombstoned", async () => {
    const { json } = await post("/retrieve_related_entities", {
      entity_id: liveRoot,
      direction: "outbound",
      max_hops: 2,
      include_entities: true,
    });

    const rels = json.relationships as Array<{
      source_entity_id: string;
      target_entity_id: string;
    }>;
    for (const rel of rels) {
      expect(rel.source_entity_id).not.toBe(deletedParent);
      expect(rel.target_entity_id).not.toBe(deletedParent);
    }
  });

  it("returns only the tombstone observation for a tombstoned entity", async () => {
    const { status, json } = await post("/list_observations", { entity_id: deletedParent });

    expect(status).toBe(200);
    const observations = json.observations as Array<{ fields: Record<string, unknown> }>;
    expect(observations.length).toBeGreaterThan(0);
    for (const obs of observations) {
      expect(obs.fields._deleted).toBe(true);
      expect(obs.fields[SECRET_FIELD]).toBeUndefined();
    }
    // Auditability is preserved: who/when/why survive the redaction.
    expect(observations[0].fields.deleted_by).toBe(TEST_USER_ID);
    expect(observations[0].fields.deletion_reason).toBe("read-path enforcement test");
  });

  it("still returns full observation history for a live entity", async () => {
    const { status, json } = await post("/list_observations", { entity_id: liveRoot });

    expect(status).toBe(200);
    const observations = json.observations as Array<{ fields: Record<string, unknown> }>;
    expect(observations.length).toBe(1);
    expect(observations[0].fields[SECRET_FIELD]).toBe(`secret for ${liveRoot}`);
  });

  it("keeps the existing snapshot and entity-query paths unchanged (no regression)", async () => {
    const deletedSnapshot = await post("/get_entity_snapshot", { entity_id: deletedParent });
    expect(deletedSnapshot.status).toBe(404);

    const liveSnapshot = await post("/get_entity_snapshot", { entity_id: liveRoot });
    expect(liveSnapshot.status).toBe(200);
    expect(liveSnapshot.json.entity_id).toBe(liveRoot);

    const visible = await queryEntities({
      userId: TEST_USER_ID,
      entityType: ENTITY_TYPE,
      includeDeleted: false,
    });
    const visibleIds = visible.map((e) => e.entity_id);
    expect(visibleIds).toContain(liveRoot);
    expect(visibleIds).toContain(child);
    expect(visibleIds).not.toContain(deletedParent);

    const withDeleted = await queryEntities({
      userId: TEST_USER_ID,
      entityType: ENTITY_TYPE,
      includeDeleted: true,
    });
    expect(withDeleted.map((e) => e.entity_id)).toContain(deletedParent);
  });
});
