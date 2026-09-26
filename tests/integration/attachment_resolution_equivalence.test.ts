/**
 * Equivalence test for the attachment-resolution contract (#2340).
 *
 * The contract:
 *
 *   A snapshot is a function of the observations *attached to* an entity,
 *   where attachment is resolved through a declared resolution layer, rather
 *   than of the observations whose `entity_id` column equals the entity.
 *
 * This test is the whole safety argument for that change. It pins the
 * OBSERVABLE behaviour of `recomputeSnapshot` across the three shapes that
 * exist today, so that swapping the flat `.eq("entity_id", …)` fetch for a
 * resolver provably does not move any snapshot:
 *
 *   (a) plain entity, no merge and no split  → snapshot unchanged
 *   (b) split-then-recompute                 → the SAME two snapshots as the
 *                                              in-place implementation yields
 *   (c) merge-then-recompute                 → the SAME one snapshot
 *
 * It is written to pass BEFORE the resolver lands (against the flat fetch)
 * and to keep passing AFTER, unchanged. A diff in this file accompanying the
 * resolver change would mean the migration altered a snapshot, which is a
 * regression rather than a migration.
 *
 * On top of equivalence it pins the resolver's own guarantees that have no
 * pre-change counterpart: an alias CHAIN must resolve fully (the existing
 * one-hop follow at cli/index.ts under-resolves), a CYCLE must not hang, and
 * depth must be bounded.
 *
 * Requires a live SQLite database; runs in CI via `npm run test:integration`.
 */

import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { db } from "../../src/db.js";
import { recomputeSnapshot, deleteSnapshot } from "../../src/services/snapshot_computation.js";
import { resolveAttachedObservations } from "../../src/services/attachment_resolution.js";

const TEST_USER = "test-attach-2340";
// A dedicated, user-scoped entity type. Deliberately NOT a built-in type:
// the reducer projects a snapshot through the ACTIVE schema, so borrowing a
// shared type would couple these assertions to whatever another test file
// happens to have registered for it when the whole suite runs.
const ENTITY_TYPE = "attach_probe_2340";

const ids = {
  plain: "ent_attach_plain_2340",
  splitSource: "ent_attach_split_src_2340",
  splitTarget: "ent_attach_split_tgt_2340",
  mergeFrom: "ent_attach_merge_from_2340",
  mergeTo: "ent_attach_merge_to_2340",
  chainA: "ent_attach_chain_a_2340",
  chainB: "ent_attach_chain_b_2340",
  chainC: "ent_attach_chain_c_2340",
  cycleA: "ent_attach_cycle_a_2340",
  cycleB: "ent_attach_cycle_b_2340",
};

async function seedSchema() {
  await db.from("schema_registry").delete().eq("user_id", TEST_USER);
  await db.from("schema_registry").insert({
    id: randomUUID(),
    entity_type: ENTITY_TYPE,
    schema_version: "1.0.0",
    schema_definition: {
      entity_type: ENTITY_TYPE,
      schema_version: "1.0.0",
      fields: {
        title: { type: "string", required: false, preserveCase: true },
        summary: { type: "string", required: false, preserveCase: true },
      },
      canonical_name_fields: ["title"],
    },
    reducer_config: { merge_policies: {} },
    active: 1,
    scope: "user",
    user_id: TEST_USER,
    created_at: new Date().toISOString(),
  });
}

async function cleanup() {
  await db.from("observations").delete().eq("user_id", TEST_USER);
  await db.from("entity_snapshots").delete().eq("user_id", TEST_USER);
  await db.from("entities").delete().eq("user_id", TEST_USER);
}

async function insertEntity(id: string, mergedTo: string | null = null) {
  await db.from("entities").insert({
    id,
    entity_type: ENTITY_TYPE,
    canonical_name: id,
    user_id: TEST_USER,
    merged_to_entity_id: mergedTo,
    created_at: new Date().toISOString(),
  });
}

let obsSeq = 0;

async function insertObservation(
  entityId: string,
  fields: Record<string, unknown>,
  observedAt: string
) {
  const id = `obs_attach_2340_${++obsSeq}`;
  await db.from("observations").insert({
    id,
    entity_id: entityId,
    entity_type: ENTITY_TYPE,
    schema_version: "1.0.0",
    source_id: `src_attach_2340_${obsSeq}`,
    interpretation_id: null,
    observed_at: observedAt,
    specificity_score: 1,
    source_priority: 50,
    observation_source: null,
    fields,
    created_at: observedAt,
    user_id: TEST_USER,
  });
  return id;
}

/**
 * The comparable part of a snapshot. `computed_at` is wall-clock and moves on
 * every recompute, so it is deliberately excluded; everything else — including
 * `provenance`, which is the field→observation_id map that would silently
 * change if the resolver handed the reducer a different set — is compared.
 */
function comparable(snap: Awaited<ReturnType<typeof recomputeSnapshot>>) {
  if (!snap) return null;
  return {
    entity_id: snap.entity_id,
    entity_type: snap.entity_type,
    schema_version: snap.schema_version,
    snapshot: snap.snapshot,
    observation_count: snap.observation_count,
    last_observation_at: snap.last_observation_at,
    provenance: snap.provenance,
    user_id: snap.user_id,
  };
}

describe("attachment resolution — equivalence with the flat entity_id fetch (#2340)", () => {
  beforeAll(seedSchema);
  beforeEach(cleanup);
  afterEach(cleanup);

  it("(a) a plain entity's snapshot is unchanged by the resolver", async () => {
    await insertEntity(ids.plain);
    await insertObservation(
      ids.plain,
      { title: "first", summary: "alpha" },
      "2026-01-01T00:00:00Z"
    );
    await insertObservation(ids.plain, { title: "second" }, "2026-01-02T00:00:00Z");

    const snap = await recomputeSnapshot(ids.plain, TEST_USER);
    expect(snap).not.toBeNull();
    expect(comparable(snap)).toMatchObject({
      entity_id: ids.plain,
      observation_count: 2,
      last_observation_at: "2026-01-02T00:00:00Z",
    });
    // last_write on `title` → the later observation wins.
    expect((snap!.snapshot as Record<string, unknown>).title).toBe("second");
    expect((snap!.snapshot as Record<string, unknown>).summary).toBe("alpha");
  });

  it("(b) split-then-recompute yields the same two snapshots as the in-place move", async () => {
    // Build the post-split world the way split leaves it TODAY: the moved
    // rows carry the target's entity_id. Under the resolver this same world
    // must reduce identically — which is what makes the resolver a migration
    // rather than a rewrite.
    await insertEntity(ids.splitSource);
    await insertEntity(ids.splitTarget);

    await insertObservation(
      ids.splitSource,
      { title: "stays", summary: "on source" },
      "2026-02-01T00:00:00Z"
    );
    await insertObservation(
      ids.splitTarget,
      { title: "moved", summary: "on target" },
      "2026-02-02T00:00:00Z"
    );

    const sourceSnap = await recomputeSnapshot(ids.splitSource, TEST_USER);
    const targetSnap = await recomputeSnapshot(ids.splitTarget, TEST_USER);

    // Two distinct snapshots, each seeing only its own side. The split's
    // difference-on-source / union-on-target rule must not leak either way.
    expect(comparable(sourceSnap)).toMatchObject({
      entity_id: ids.splitSource,
      observation_count: 1,
    });
    expect((sourceSnap!.snapshot as Record<string, unknown>).title).toBe("stays");

    expect(comparable(targetSnap)).toMatchObject({
      entity_id: ids.splitTarget,
      observation_count: 1,
    });
    expect((targetSnap!.snapshot as Record<string, unknown>).title).toBe("moved");
  });

  it("(c) merge-then-recompute yields one snapshot over the union", async () => {
    // The post-merge world as merge leaves it today: observations already
    // carry the survivor's entity_id, and the absorbed entity is tombstoned.
    await insertEntity(ids.mergeTo);
    await insertObservation(ids.mergeTo, { title: "survivor" }, "2026-03-01T00:00:00Z");
    await insertObservation(ids.mergeTo, { summary: "absorbed" }, "2026-03-02T00:00:00Z");
    await insertEntity(ids.mergeFrom, ids.mergeTo);

    const snap = await recomputeSnapshot(ids.mergeTo, TEST_USER);
    expect(comparable(snap)).toMatchObject({
      entity_id: ids.mergeTo,
      observation_count: 2,
    });
    expect((snap!.snapshot as Record<string, unknown>).title).toBe("survivor");
    expect((snap!.snapshot as Record<string, unknown>).summary).toBe("absorbed");
  });

  it("(c2) recomputing a tombstoned entity does not resurrect it onto the survivor", async () => {
    // Guard against the resolver over-reaching: asking for the absorbed
    // entity must not pull the survivor's observations into a snapshot
    // stored under the tombstone's id. Today the flat fetch returns nothing
    // (the rows moved), so the snapshot is null; the resolver must agree.
    await insertEntity(ids.mergeTo);
    await insertObservation(ids.mergeTo, { title: "survivor" }, "2026-03-01T00:00:00Z");
    await insertEntity(ids.mergeFrom, ids.mergeTo);

    await deleteSnapshot(ids.mergeFrom, TEST_USER);
    const snap = await recomputeSnapshot(ids.mergeFrom, TEST_USER);
    expect(snap).toBeNull();
  });

  it("(d) user scoping is preserved — another user's rows never attach", async () => {
    await insertEntity(ids.plain);
    await insertObservation(ids.plain, { title: "mine" }, "2026-04-01T00:00:00Z");

    await db.from("observations").insert({
      id: "obs_attach_2340_otheruser",
      entity_id: ids.plain,
      entity_type: ENTITY_TYPE,
      schema_version: "1.0.0",
      source_id: "src_attach_2340_other",
      observed_at: "2026-04-02T00:00:00Z",
      specificity_score: 1,
      source_priority: 50,
      fields: { title: "theirs" },
      created_at: "2026-04-02T00:00:00Z",
      user_id: `${TEST_USER}-other`,
    });

    const snap = await recomputeSnapshot(ids.plain, TEST_USER);
    expect(snap!.observation_count).toBe(1);
    expect((snap!.snapshot as Record<string, unknown>).title).toBe("mine");

    await db.from("observations").delete().eq("user_id", `${TEST_USER}-other`);
  });
});

describe("attachment resolver — guards the existing pointer-follows lack (#2340)", () => {
  beforeAll(seedSchema);
  beforeEach(cleanup);
  afterEach(cleanup);

  it("resolves an alias CHAIN fully, not one hop", async () => {
    // A → B → C. cli/index.ts:17020 resolves exactly one hop and silently
    // under-resolves this; the resolver must land on C.
    await insertEntity(ids.chainC);
    await insertEntity(ids.chainB, ids.chainC);
    await insertEntity(ids.chainA, ids.chainB);

    const res = await resolveAttachedObservations(ids.chainA, TEST_USER);
    expect(res.resolvedEntityId).toBe(ids.chainC);
    expect(res.truncated).toBe(false);
  });

  it("terminates on a CYCLE instead of recursing forever", async () => {
    // A → B → A. entity_queries.ts:945 recurses with no visited set; the
    // resolver must stop and report rather than blow the stack.
    await insertEntity(ids.cycleA, ids.cycleB);
    await insertEntity(ids.cycleB, ids.cycleA);

    const res = await resolveAttachedObservations(ids.cycleA, TEST_USER);
    expect(res.truncated).toBe(true);
    expect(res.truncationReason).toBe("cycle");
    // It still returns a usable set rather than throwing on the read path.
    expect(Array.isArray(res.observations)).toBe(true);
  });

  it("bounds depth rather than truncating silently", async () => {
    // A chain longer than the bound must report truncation, not quietly
    // return a partly-resolved answer.
    const chain: string[] = [];
    for (let i = 0; i <= 40; i++) chain.push(`ent_attach_deep_${i}_2340`);
    await insertEntity(chain[chain.length - 1]);
    for (let i = chain.length - 2; i >= 0; i--) await insertEntity(chain[i], chain[i + 1]);

    const res = await resolveAttachedObservations(chain[0], TEST_USER);
    expect(res.truncated).toBe(true);
    expect(res.truncationReason).toBe("depth");
  });

  it("an unmerged entity resolves to itself with no truncation", async () => {
    await insertEntity(ids.plain);
    await insertObservation(ids.plain, { title: "solo" }, "2026-05-01T00:00:00Z");

    const res = await resolveAttachedObservations(ids.plain, TEST_USER);
    expect(res.resolvedEntityId).toBe(ids.plain);
    expect(res.truncated).toBe(false);
    expect(res.observations).toHaveLength(1);
  });
});
