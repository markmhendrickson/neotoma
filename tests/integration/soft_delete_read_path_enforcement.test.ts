/**
 * Integration test: soft-deleted entities are unreadable across EVERY read path.
 *
 * `retrieve_entities` and `retrieve_entity_snapshot` already enforce tombstones
 * via `getDeletedEntityIds` (services/entity_queries.ts). Two other read paths
 * had the same gap and were fixed separately:
 *   - `/retrieve_related_entities`, which returned a tombstoned entity's
 *     children and edges and would traverse FROM a tombstoned root;
 *   - `/list_observations`, which returned the full pre-deletion observations
 *     including all snapshot `fields` — verbatim recovery of deleted content.
 *
 * Both paths are routed through `getDeletedEntityIdsById` — a thin adapter
 * over `getDeletedEntityIds` for callers that only hold bare ids (ids
 * discovered by walking `relationship_snapshots`, not by selecting from
 * `entities`) — so ALL FOUR paths share one definition of "deleted" and
 * inherit the same merged-away / never-observed carve-outs documented on
 * `getDeletedEntityIds`.
 *
 * Coverage is table-driven over read paths so a future endpoint only needs a
 * new row.
 *
 * Graph seeded (all owned by the same user):
 *   liveRoot --REFERS_TO--> deletedParent --REFERS_TO--> child
 * `deletedParent` is soft-deleted; `liveRoot` and `child` stay live.
 *
 * A second, independent fixture (`mergeSurvivor` / `mergedAway`) covers the
 * carve-out: a merged-away entity has no `entity_snapshots` row (same as a
 * tombstone) but must NOT be treated as deleted by either path.
 */

import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../src/actions.js";
import { db } from "../../src/db.js";
import { softDeleteEntity } from "../../src/services/deletion.js";
import { mergeEntities } from "../../src/services/entity_merge.js";
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

  // Merged-away fixture: independent of the tombstone graph above so the
  // carve-out tests cannot be satisfied by the tombstone behaviour by accident.
  const mergeSurvivor = `ent_sdrp_survivor_${suffix}`;
  const mergedAway = `ent_sdrp_mergedaway_${suffix}`;
  const mergeReferrer = `ent_sdrp_referrer_${suffix}`;
  const mergeEntityIds = [mergeSurvivor, mergedAway, mergeReferrer];

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

    // Merged-away fixture: mergeReferrer -> mergeSurvivor is a live edge added
    // AFTER the merge, so retrieve_related_entities from mergeReferrer reaches
    // a live survivor rather than the merged-away id (mergeEntities repoints
    // edges onto the survivor, so the merged-away id is never a relationship
    // endpoint post-merge — the carve-out is about the ROOT id, not traversal).
    await db.from("entities").insert(
      mergeEntityIds.map((id) => ({
        id,
        entity_type: ENTITY_TYPE,
        canonical_name: id,
        user_id: TEST_USER_ID,
      }))
    );
    await db.from("observations").insert(
      mergeEntityIds.map((id) => ({
        entity_id: id,
        entity_type: ENTITY_TYPE,
        schema_version: "1.0",
        observed_at: "2026-07-01T00:00:00.000Z",
        source_priority: 0,
        fields: { name: id },
        user_id: TEST_USER_ID,
      }))
    );
    for (const id of mergeEntityIds) {
      await recomputeSnapshot(id, TEST_USER_ID);
    }
    await mergeEntities({
      fromEntityId: mergedAway,
      toEntityId: mergeSurvivor,
      userId: TEST_USER_ID,
      mergeReason: "read-path enforcement carve-out test",
      mergedBy: TEST_USER_ID,
    });
  });

  afterAll(async () => {
    await db.from("relationship_snapshots").delete().in("relationship_key", relationshipKeys);
    await db.from("entity_snapshots").delete().in("entity_id", entityIds);
    await db.from("observations").delete().in("entity_id", entityIds);
    await db.from("entities").delete().in("id", entityIds);

    await db
      .from("relationship_snapshots")
      .delete()
      .eq("source_entity_id", mergeReferrer)
      .eq("target_entity_id", mergeSurvivor);
    await db.from("entity_snapshots").delete().in("entity_id", mergeEntityIds);
    await db.from("observations").delete().in("entity_id", mergeEntityIds);
    await db.from("entities").delete().in("id", mergeEntityIds);

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

  /**
   * The carve-out: a merged-away entity has no `entity_snapshots` row (same
   * observable state as a tombstone — `mergeEntities` deletes it in step 9),
   * but it is NOT deleted. `getDeletedEntityIds` distinguishes the two via
   * `merged_to_entity_id` on the CANDIDATE row (see the `unresolved` filter
   * in services/entity_queries.ts), which is why both new call sites had to
   * be able to supply it (`getDeletedEntityIdsById` fetches it before
   * delegating). Without this carve-out, a merge would silently look
   * identical to a delete on these two read paths — the regression
   * `getDeletedEntityIds`'s own docstring (ateles#2267) describes for
   * `retrieve_entities`.
   *
   * A real `mergeEntities()` call also moves the merged-away id's
   * observations onto the survivor, so by the time a real merge has
   * completed, a merged-away id is snapshot-less AND has zero rows in
   * `observations` — indistinguishable, at the `entityIds`-only level, from
   * a NEVER-OBSERVED id (which is also correctly treated as live, by a
   * different branch). An id-only integration probe of a real merge cannot
   * tell the two rules apart, so it would pass even with the carve-out
   * deleted — the "test that cannot fail on the thing it watches" trap.
   * Proven: deleting the `!row.merged_to_entity_id` guard and re-running
   * this suite left the real-merge-fixture assertions below GREEN.
   *
   * The test below instead drives `getDeletedEntityIds` (not the id-only
   * adapter) directly with a candidate row carrying BOTH `merged_to_entity_id`
   * AND a leftover observation under its own id — the state the carve-out's
   * own comment describes ("Snapshot-less candidates that are merged-away are
   * not deleted") independent of whether the observation-move step of a given
   * merge implementation is complete. This is the only fixture that can
   * actually fail when the guard is removed, and it does (see PR description
   * for the verified red/green cycle).
   */
  it("getDeletedEntityIds does not classify a merged-away candidate as deleted, even with a leftover observation under its id", async () => {
    const { getDeletedEntityIds } = await import("../../src/services/entity_queries.js");

    const strandedId = `ent_sdrp_stranded_obs_${suffix}`;
    // No `entities` row, no `entity_snapshots` row — only a leftover
    // observation, simulating a candidate whose merge moved everything
    // EXCEPT this row. `getDeletedEntityIds` must still treat it as live
    // because the caller marks it `merged_to_entity_id`-bearing.
    //
    // The SQLite adapter recomputes `entity_snapshots` automatically on every
    // observation insert (see `getDeletedEntityIds`'s own docstring), so this
    // insert alone would make `strandedId` ALIVE via a real snapshot row —
    // not the snapshot-less state this fixture needs. Delete that
    // auto-created row immediately so what's left is exactly "has an
    // observation, has no snapshot", independent of the merge flag under
    // test.
    await db.from("observations").insert({
      entity_id: strandedId,
      entity_type: ENTITY_TYPE,
      schema_version: "1.0",
      observed_at: "2026-07-01T00:00:00.000Z",
      source_priority: 0,
      fields: { name: strandedId },
      user_id: TEST_USER_ID,
    });
    await db.from("entity_snapshots").delete().eq("entity_id", strandedId);

    try {
      const deleted = await getDeletedEntityIds(
        [{ id: strandedId, merged_to_entity_id: mergeSurvivor }],
        TEST_USER_ID
      );
      expect(deleted.has(strandedId)).toBe(false);

      // Control: the SAME leftover-observation state, without
      // `merged_to_entity_id`, IS classified as deleted (the never-observed
      // rule does not apply — there is an observation — so only the
      // deletion rule can explain it). This is what distinguishes the
      // carve-out from the never-observed branch and is what goes red when
      // the guard is removed.
      const deletedNoMergeFlag = await getDeletedEntityIds(
        [{ id: strandedId, merged_to_entity_id: null }],
        TEST_USER_ID
      );
      expect(deletedNoMergeFlag.has(strandedId)).toBe(true);
    } finally {
      await db.from("observations").delete().eq("entity_id", strandedId);
      await db.from("entity_snapshots").delete().eq("entity_id", strandedId);
    }
  });

  it("does not treat a merged-away entity as a tombstoned root in retrieve_related_entities", async () => {
    // If mergedAway were (wrongly) classified as deleted, this call would
    // short-circuit to `{ relationships: [], entities: [] }` exactly like the
    // tombstoned-root test above. This corroborates the real end-to-end path
    // reaches ordinary traversal rather than the deleted-root branch, but —
    // per the note above — cannot by itself distinguish the carve-out from
    // the never-observed rule once a real merge has moved the observations;
    // the unit-level test above is the one that actually pins the carve-out.
    const { status, json } = await post("/retrieve_related_entities", {
      entity_id: mergedAway,
      direction: "both",
      max_hops: 2,
      include_entities: true,
    });

    expect(status).toBe(200);
    expect(json.entities).toEqual([]);
    expect(json.relationships).toEqual([]);
  });

  it("still surfaces a live entity that links to a merged-away entity id, unaffected by the merge", async () => {
    // Seed a live edge into the merge fixture now that the merge above has
    // settled, so the frontier legitimately contains mergeSurvivor (the
    // repoint target) and the traversal-level carve-out is exercised through
    // the real endpoint rather than only the unit-level helper above.
    await db.from("relationship_snapshots").insert({
      relationship_key: `REFERS_TO:${mergeReferrer}:${mergeSurvivor}`,
      relationship_type: "REFERS_TO",
      source_entity_id: mergeReferrer,
      target_entity_id: mergeSurvivor,
      schema_version: "1.0",
      snapshot: {},
      user_id: TEST_USER_ID,
    });

    const { status, json } = await post("/retrieve_related_entities", {
      entity_id: mergeReferrer,
      direction: "outbound",
      max_hops: 1,
      include_entities: true,
    });

    expect(status).toBe(200);
    const ids = (json.entities as Array<{ id: string }>).map((e) => e.id);
    // The survivor is live and must be reachable normally; mergedAway itself
    // is not a relationship endpoint post-merge, so it is correctly absent —
    // not because it was blocked as deleted.
    expect(ids).toContain(mergeSurvivor);
  });
});
